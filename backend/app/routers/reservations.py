"""
app/routers/reservations.py — Reservation API endpoints.

All write endpoints require JWT authentication (get_current_user).
Read endpoints are also authenticated so users only see their own reservations.

Endpoints
─────────
POST   /reservations                 — create a reservation with optional addons
GET    /reservations                 — list the authenticated user's reservations
GET    /reservations/{id}            — get reservation detail (with addons)
PATCH  /reservations/{id}/cancel     — cancel a reservation
GET    /reservations/addons/available — list available addons (server-authoritative prices)

Double-booking protection
──────────────────────────
The database enforces uniqueness on (table_id, reservation_time) in reservation_tables.
An IntegrityError on that constraint is caught and returned as 409 Conflict.
We also do an application-level pre-check for overlapping slots within a configurable
window (SLOT_WINDOW_HOURS) to give a better error message before the DB rejects it.

Addon pricing
──────────────
Prices are always read from reservation_addons at booking time and stored as a
snapshot. The client only supplies addon_id + quantity — never a price.
"""

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.audit import audit
from app.dependencies import get_current_user
from app.models import (
    Reservation,
    ReservationAddon,
    ReservationAddonSelection,
    ReservationTable,
    Table,
    User,
)
from app.schemas import (
    AddonSelectionDetail,
    ReservationCreateRequest,
    ReservationDetail,
    ReservationStatusEnum,
    ReservationAddonOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reservations", tags=["Reservations"])

# Reservations within this many hours of an existing booking on the same
# table are considered conflicting at application level.
SLOT_WINDOW_HOURS = 2


# ── helpers ────────────────────────────────────────────────────────────────

def _build_detail(res: Reservation) -> ReservationDetail:
    """Convert a Reservation ORM object into a ReservationDetail schema."""
    table_ids = [rt.table_id for rt in
                 res.tables.__class__.__mro__  # avoid lazy-load; handled via joinedload
                 ] if False else [t.id for t in res.tables]

    addon_rows: list[AddonSelectionDetail] = []
    total = Decimal("0.00")
    for sel in res.addon_selections:
        unit = Decimal(str(sel.addon.price))
        line = unit * sel.quantity
        total += line
        addon_rows.append(AddonSelectionDetail(
            id=sel.id,
            addon_id=sel.addon_id,
            addon_name=sel.addon.name,
            quantity=sel.quantity,
            unit_price=unit,
            line_total=line,
        ))

    return ReservationDetail(
        id=res.id,
        user_id=res.user_id,
        party_size=res.party_size,
        reservation_time=res.reservation_time,
        status=ReservationStatusEnum(res.status),
        extra_chair=res.extra_chair,
        gift_message=res.gift_message,
        created_at=res.created_at,
        updated_at=res.updated_at,
        table_ids=[t.id for t in res.tables],
        addons=addon_rows,
        addon_total=total,
    )


def _load_reservation(
    reservation_id: UUID, user_id: UUID, db: Session
) -> Reservation:
    """Fetch a reservation belonging to the current user, or raise 404/403."""
    try:
        res = (
            db.query(Reservation)
            .options(
                joinedload(Reservation.tables),
                joinedload(Reservation.addon_selections).joinedload(
                    ReservationAddonSelection.addon
                ),
            )
            .filter(Reservation.id == reservation_id)
            .first()
        )
    except SQLAlchemyError as exc:
        logger.error("_load_reservation DB error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database temporarily unavailable. Please retry.",
        )

    if res is None:
        raise HTTPException(status_code=404, detail="Reservation not found.")

    if res.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied.")

    return res


# ── GET /reservations/addons/available ─────────────────────────────────────

@router.get(
    "/addons/available",
    response_model=list[ReservationAddonOut],
    summary="List all available reservation addons (server-authoritative prices)",
)
def list_addons(db: Session = Depends(get_db)):
    """
    Public endpoint — returns all active addons with server-side prices.
    The client must never calculate or override addon prices; always use
    the values returned here.

    All 5 addons are returned here. The UI decides which to show per flow
    (reservations show all; home delivery/takeaway hide Balloon Decoration
    and Bento Cake — that filtering is the frontend's responsibility).
    """
    try:
        addons = (
            db.query(ReservationAddon)
            .filter(ReservationAddon.is_available.is_(True))
            .order_by(ReservationAddon.price.asc())
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("list_addons DB error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database temporarily unavailable. Please retry.",
        )
    return addons


# ── POST /reservations ─────────────────────────────────────────────────────

@router.post(
    "",
    response_model=ReservationDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a reservation with optional addons",
)
def create_reservation(
    body: ReservationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new reservation for the authenticated user.

    - Validates all table IDs exist.
    - Checks for slot conflicts (application-level, ±SLOT_WINDOW_HOURS).
    - Inserts reservation + reservation_tables rows atomically.
    - DB-level UniqueConstraint (table_id, reservation_time) provides a
      final race-condition safety net → caught and returned as 409.
    - Addons: price snapshot fetched from DB at booking time, never from client.

    Status codes:
      201  Created
      400  Invalid table IDs / reservation in the past
      409  Double-booking conflict
      422  Validation error
      503  DB unavailable
    """
    # 1 — Reservation time must be in the future
    now_utc = datetime.now(timezone.utc)
    rt = body.reservation_time
    # Make timezone-aware if naive (assume UTC)
    if rt.tzinfo is None:
        rt = rt.replace(tzinfo=timezone.utc)
    if rt <= now_utc:
        raise HTTPException(
            status_code=400,
            detail="reservation_time must be in the future.",
        )

    # 2 — Validate table IDs
    try:
        tables = (
            db.query(Table)
            .filter(Table.id.in_(body.table_ids))
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("create_reservation: table lookup error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    found_ids = {t.id for t in tables}
    missing = [str(tid) for tid in body.table_ids if tid not in found_ids]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Table IDs not found: {missing}",
        )

    # 3 — Application-level slot conflict check (gives a better error message
    #     than letting the DB constraint fire cold)
    window_start = rt - timedelta(hours=SLOT_WINDOW_HOURS)
    window_end   = rt + timedelta(hours=SLOT_WINDOW_HOURS)
    try:
        conflicts = (
            db.query(ReservationTable)
            .join(Reservation, ReservationTable.reservation_id == Reservation.id)
            .filter(
                ReservationTable.table_id.in_(body.table_ids),
                Reservation.status == "confirmed",
                ReservationTable.reservation_time >= window_start,
                ReservationTable.reservation_time <= window_end,
            )
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("create_reservation: conflict check error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if conflicts:
        conflicting_tables = {str(c.table_id) for c in conflicts}
        raise HTTPException(
            status_code=409,
            detail=f"Tables already booked within {SLOT_WINDOW_HOURS}h of that time: {conflicting_tables}",
        )

    # 4 — Validate and price addons (server-authoritative)
    addon_data: list[tuple[ReservationAddon, int]] = []
    if body.addons:
        addon_ids = [a.addon_id for a in body.addons]
        try:
            db_addons = (
                db.query(ReservationAddon)
                .filter(
                    ReservationAddon.id.in_(addon_ids),
                    ReservationAddon.is_available.is_(True),
                )
                .all()
            )
        except SQLAlchemyError as exc:
            logger.error("create_reservation: addon lookup error: %s", exc)
            raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

        found_addon_ids = {a.id for a in db_addons}
        bad = [str(aid) for aid in addon_ids if aid not in found_addon_ids]
        if bad:
            raise HTTPException(
                status_code=400,
                detail=f"Addon IDs not found or unavailable: {bad}",
            )
        # map id → (addon, quantity)
        qty_map = {a.addon_id: a.quantity for a in body.addons}
        addon_data = [(a, qty_map[a.id]) for a in db_addons]

    # 5 — Insert reservation atomically
    try:
        new_res = Reservation(
            user_id=current_user.id,
            party_size=body.party_size,
            reservation_time=rt,
            extra_chair=body.extra_chair,
            gift_message=body.gift_message or None,
            status="confirmed",
        )
        db.add(new_res)
        db.flush()   # get new_res.id without committing yet

        # Insert reservation_tables rows (denormalised reservation_time for DB constraint)
        for tid in body.table_ids:
            db.add(ReservationTable(
                reservation_id=new_res.id,
                table_id=tid,
                reservation_time=rt,
            ))

        # Insert addon selections (price snapshot from DB, never from client)
        for addon, qty in addon_data:
            db.add(ReservationAddonSelection(
                reservation_id=new_res.id,
                addon_id=addon.id,
                quantity=qty,
            ))

        db.commit()
        db.refresh(new_res)

    except IntegrityError as exc:
        db.rollback()
        err = str(exc.orig).lower()
        if "uq_reservation_tables_table_time" in err:
            raise HTTPException(
                status_code=409,
                detail="Double-booking: that table is already reserved for exactly that time.",
            )
        raise HTTPException(status_code=409, detail="Reservation conflict.")

    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("create_reservation: insert error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    # 6 — Return full detail (re-load with relationships)
    # Use a fresh eager-load query to get tables + addon_selections populated.
    # This avoids relying on lazy-load which can fail with pgbouncer transaction mode.
    try:
        loaded = (
            db.query(Reservation)
            .options(
                joinedload(Reservation.tables),
                joinedload(Reservation.addon_selections).joinedload(
                    ReservationAddonSelection.addon
                ),
            )
            .filter(Reservation.id == new_res.id)
            .first()
        )
        if loaded is None:
            raise HTTPException(status_code=500, detail="Reservation created but could not be retrieved.")
        return _build_detail(loaded)
    except SQLAlchemyError as exc:
        logger.error("create_reservation: reload error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")


# ── GET /reservations ─────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[ReservationDetail],
    summary="List authenticated user's reservations",
)
def list_my_reservations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns all reservations belonging to the authenticated user,
    ordered newest first. Includes addons for each.
    """
    try:
        reservations = (
            db.query(Reservation)
            .options(
                joinedload(Reservation.tables),
                joinedload(Reservation.addon_selections).joinedload(
                    ReservationAddonSelection.addon
                ),
            )
            .filter(Reservation.user_id == current_user.id)
            .order_by(Reservation.created_at.desc())
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("list_my_reservations DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return [_build_detail(r) for r in reservations]


# ── GET /reservations/{id} ─────────────────────────────────────────────────

@router.get(
    "/{reservation_id}",
    response_model=ReservationDetail,
    summary="Get a single reservation's full detail",
)
def get_reservation(
    reservation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns full detail for one reservation.
    Only the owning user can access it (403 otherwise).
    """
    return _build_detail(_load_reservation(reservation_id, current_user.id, db))


# ── PATCH /reservations/{id}/cancel ───────────────────────────────────────

@router.patch(
    "/{reservation_id}/cancel",
    response_model=ReservationDetail,
    summary="Cancel a reservation",
)
def cancel_reservation(
    reservation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Cancel a confirmed reservation.

    - 200  OK           — reservation cancelled
    - 400  Bad Request  — reservation already cancelled
    - 403  Forbidden    — not the owner
    - 404  Not Found    — no such reservation
    """
    res = _load_reservation(reservation_id, current_user.id, db)

    if res.status == "cancelled":
        raise HTTPException(
            status_code=400,
            detail="Reservation is already cancelled.",
        )

    try:
        res.status = "cancelled"
        audit(db, actor=current_user, action="reservation.cancel",
              resource_type="reservation", resource_id=str(reservation_id),
              metadata={"cancelled_by": "customer", "reservation_time": str(res.reservation_time)})
        db.commit()
        db.refresh(res)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("cancel_reservation DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return _build_detail(_load_reservation(reservation_id, current_user.id, db))
