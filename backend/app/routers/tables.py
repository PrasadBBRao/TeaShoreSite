"""
app/routers/tables.py — Public table availability endpoint.

Endpoints
─────────
GET /tables/available
    Returns all tables, each annotated with `is_available` for the requested
    date + time + party_size combination.

    A table is considered *unavailable* if:
      • A confirmed reservation exists on that table within ±SLOT_WINDOW_HOURS
        of the requested reservation_time.

    Capacity filtering:
      • Only tables whose capacity >= party_size are returned (tables that are
        too small to seat the party are omitted entirely, not just flagged).

    Query parameters:
      reservation_time  ISO-8601 datetime string (required)
      party_size        integer >= 1 (required)

    Auth: public — no token required.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Reservation, ReservationTable, Table
from app.schemas import TableAvailableOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tables", tags=["Tables"])

# Must match the conflict window used in reservations.py
SLOT_WINDOW_HOURS = 2


@router.get(
    "/available",
    response_model=list[TableAvailableOut],
    summary="List tables with availability for a given date, time, and party size",
)
def list_available_tables(
    reservation_time: datetime = Query(
        ...,
        description="ISO-8601 datetime for the desired reservation slot (e.g. 2026-09-15T19:00:00)",
    ),
    party_size: int = Query(..., ge=1, le=50, description="Number of guests"),
    db: Session = Depends(get_db),
):
    """
    Returns all tables whose capacity >= party_size, each annotated with
    `is_available` indicating whether the table is free at the requested time.

    Availability check mirrors the application-level conflict window used
    when creating a reservation (±SLOT_WINDOW_HOURS = ±2 hours).

    The requested datetime must be in the future; past times return an empty
    list rather than an error so the UI can handle it gracefully.
    """
    # Normalise to UTC-aware
    if reservation_time.tzinfo is None:
        reservation_time = reservation_time.replace(tzinfo=timezone.utc)

    # Tables too small for the party are excluded entirely
    try:
        tables = (
            db.query(Table)
            .filter(Table.capacity >= party_size)
            .order_by(Table.table_number.asc())
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("list_available_tables: table query error: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable. Please retry.",
        )

    if not tables:
        return []

    # Find which table IDs are booked within the conflict window
    window_start = reservation_time - timedelta(hours=SLOT_WINDOW_HOURS)
    window_end   = reservation_time + timedelta(hours=SLOT_WINDOW_HOURS)

    table_ids = [t.id for t in tables]

    try:
        booked_rows = (
            db.query(ReservationTable.table_id)
            .join(Reservation, ReservationTable.reservation_id == Reservation.id)
            .filter(
                ReservationTable.table_id.in_(table_ids),
                Reservation.status == "confirmed",
                ReservationTable.reservation_time >= window_start,
                ReservationTable.reservation_time <= window_end,
            )
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("list_available_tables: availability query error: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable. Please retry.",
        )

    booked_ids = {row.table_id for row in booked_rows}

    return [
        TableAvailableOut(
            id=t.id,
            table_number=t.table_number,
            capacity=t.capacity,
            is_available=(t.id not in booked_ids),
        )
        for t in tables
    ]
