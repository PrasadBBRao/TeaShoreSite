"""
app/routers/admin.py — Admin API.

POST /admin/login                          admin login → JWT with role=admin
GET  /admin/me                             whoami (admin only)

Menu management (admin only):
POST   /admin/menu                         create menu item
PATCH  /admin/menu/{id}                    update menu item fields
DELETE /admin/menu/{id}                    delete menu item (only if no orders reference it)
PATCH  /admin/menu/{id}/availability       toggle is_available

Table management (admin only):
POST   /admin/tables                       create a table
GET    /admin/tables                       list all tables
PATCH  /admin/tables/{id}                  update table capacity/status
DELETE /admin/tables/{id}                  delete table (only if no sessions)

Order management (admin only):
GET    /admin/orders                       list all orders (all users, paginated)
GET    /admin/orders/{id}                  get any order
PATCH  /admin/orders/{id}/status           advance order status (unrestricted for admin)

Reservation management (admin only):
GET    /admin/reservations                 list all reservations
PATCH  /admin/reservations/{id}/cancel     cancel any reservation

Ratings (admin + customer):
POST   /ratings                            customer submits rating for their own order
GET    /admin/ratings                      admin lists all ratings
DELETE /admin/ratings/{id}                 admin deletes a rating

Security notes:
- Admin JWT carries role="admin" claim; get_current_admin rejects all other tokens.
- Regular user tokens cannot call any /admin/* endpoint.
- Prices are always server-authoritative (fetched from DB, never from request).
- Admin cannot inject role or ownership via request body.
"""

import json
import logging
import secrets
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import String, or_
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.core.security import create_access_token, hash_password, verify_password
from app.database import get_db
from app.dependencies import get_current_admin, get_current_user, get_head_admin
from app.audit import audit, sanitise_metadata
from app.models import (
    Admin,
    AuditLog,
    MenuItem,
    Order,
    OrderItem,
    Rating,
    Reservation,
    ReservationAddon,
    Table,
    TableSession,
    User,
)
from app.schemas import (
    AdminLoginRequest,
    AdminOrderOut,
    AdminSessionCreate,
    AdminSessionOut,
    AdminStatusUpdate,
    AdminTokenOut,
    AdminUserOut,
    AuditLogOut,
    DashboardStats,
    MenuItemCreate,
    MenuItemOut,
    MenuItemUpdate,
    ReservationAddonOut,
    ReservationAddonCreate,
    ReservationAddonUpdate,
    OrderStatusEnum,
    PaymentConfirmRequest,
    RatingCreateRequest,
    RatingOut2,
    ReservationAddonOut,
    ReservationDetail,
    StaffCreate,
    StaffOut,
    StaffUpdate,
    TableCreate,
    TableOut,
    TableUpdate,
)
from app.routers.reservations import _build_detail as _build_res_detail
from app.routers.qr_sessions import _check_session_orders_paid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])
ratings_router = APIRouter(prefix="/ratings", tags=["Ratings"])


# ── POST /admin/login ─────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=AdminTokenOut,
    summary="Admin login — returns JWT with role=admin",
)
def admin_login(body: AdminLoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate as admin.

    - 200  OK           — valid credentials, token returned
    - 401  Unauthorized — wrong username or password
    - 503  Unavailable  — database unreachable
    """
    try:
        admin = db.query(Admin).filter(Admin.username == body.username).first()
    except SQLAlchemyError as exc:
        logger.error("admin_login: DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if admin is None or not verify_password(body.password, admin.password_hash):
        try:
            audit(db, actor=admin, action="login.fail", success=False, required=True,
                  metadata={"reason": "unknown_username" if admin is None else "wrong_password",
                            "username": body.username})
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            logger.error("admin_login: failed-login audit write: %s", exc)
            raise HTTPException(status_code=503, detail="Authentication temporarily unavailable.")
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not admin.is_active:
        try:
            audit(db, actor=admin, action="login.fail", success=False, required=True,
                  metadata={"reason": "account_inactive", "username": body.username})
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            logger.error("admin_login: inactive-login audit write: %s", exc)
            raise HTTPException(status_code=503, detail="Authentication temporarily unavailable.")
        raise HTTPException(status_code=403, detail="This admin account has been deactivated.")

    token = create_access_token(
        subject=str(admin.id),
        extra={"role": "admin", "username": admin.username},
    )
    try:
        audit(db, actor=admin, action="login.success", success=True, required=True)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("admin_login: successful-login audit write: %s", exc)
        raise HTTPException(status_code=503, detail="Authentication temporarily unavailable.")
    return AdminTokenOut(access_token=token, admin_id=admin.id, username=admin.username)


# ── GET /admin/me ─────────────────────────────────────────────────────────

@router.get("/me", summary="Admin whoami — returns role and active status")
def admin_me(current_admin: Admin = Depends(get_current_admin)):
    return {
        "admin_id":  str(current_admin.id),
        "username":  current_admin.username,
        "role":      current_admin.role,
        "is_active": current_admin.is_active,
    }


@router.get(
    "/audit-logs",
    response_model=list[AuditLogOut],
    summary="Read audit logs (head admin only)",
)
def list_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    start_at: datetime | None = Query(None),
    end_at: datetime | None = Query(None),
    actor: str | None = Query(None, min_length=1, max_length=80),
    action: str | None = Query(None, min_length=1, max_length=100),
    resource_type: str | None = Query(None, min_length=1, max_length=60),
    result: bool | None = Query(None, description="Filter by successful or failed result"),
    _: Admin = Depends(get_head_admin),
    db: Session = Depends(get_db),
):
    if start_at and end_at and start_at > end_at:
        raise HTTPException(status_code=422, detail="start_at must not be after end_at.")

    try:
        query = db.query(AuditLog)
        if start_at is not None:
            query = query.filter(AuditLog.created_at >= start_at)
        if end_at is not None:
            query = query.filter(AuditLog.created_at <= end_at)
        if actor:
            query = query.filter(
                or_(AuditLog.actor_username == actor, AuditLog.actor_id.cast(String) == actor)
            )
        if action:
            query = query.filter(AuditLog.action == action)
        if resource_type:
            query = query.filter(AuditLog.resource_type == resource_type)
        if result is not None:
            query = query.filter(AuditLog.success.is_(result))
        rows = (
            query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("list_audit_logs DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    output = []
    for row in rows:
        try:
            metadata = json.loads(row.metadata_json) if row.metadata_json else None
        except (TypeError, json.JSONDecodeError):
            metadata = None
        if isinstance(metadata, dict):
            metadata = sanitise_metadata(metadata)
        else:
            metadata = None
        output.append(AuditLogOut(
            id=row.id,
            actor_id=row.actor_id,
            actor_username=row.actor_username,
            actor_role=row.actor_role,
            action=row.action,
            resource_type=row.resource_type,
            resource_id=row.resource_id,
            success=row.success,
            metadata=metadata,
            created_at=row.created_at,
        ))
    return output


# ── POST /admin/admins (bootstrap — create first admin) ───────────────────

@router.post("/admins", summary="Create a new admin account (head admin only)", status_code=201)
def create_admin(
    body: AdminLoginRequest,
    current_admin: Admin = Depends(get_head_admin),
    db: Session = Depends(get_db),
):
    """Create an additional admin. The calling request must already be an admin."""
    try:
        existing = db.query(Admin).filter(Admin.username == body.username).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists.")
    new_admin = Admin(
        username=body.username,
        password_hash=hash_password(body.password),
        created_by=current_admin.id,
    )
    try:
        db.add(new_admin)
        db.flush()
        audit(db, actor=current_admin, action="admin.create",
              resource_type="admin", resource_id=str(new_admin.id),
              metadata={"username": new_admin.username, "role": new_admin.role},
              required=True)
        db.commit()
        db.refresh(new_admin)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return {"admin_id": str(new_admin.id), "username": new_admin.username}


# ══════════════════════════════════════════════════════════════════════════
#  MENU MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════

@router.post("/menu", response_model=MenuItemOut, status_code=201,
             summary="Create a menu item")
def create_menu_item(
    body: MenuItemCreate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        item = MenuItem(**body.model_dump())
        db.add(item)
        db.flush()
        audit(db, actor=current_admin, action="menu.create",
              resource_type="menu_item", resource_id=str(item.id),
              metadata={"name": item.name, "category": item.category, "price": str(item.price)})
        db.commit()
        db.refresh(item)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("create_menu_item: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return item


@router.patch("/menu/{item_id}", response_model=MenuItemOut,
              summary="Update a menu item")
def update_menu_item(
    item_id: UUID,
    body: MenuItemUpdate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    changes = body.model_dump(exclude_none=True)
    previous_availability = item.is_available
    for field, value in changes.items():
        setattr(item, field, value)
    try:
        audit(db, actor=current_admin, action="menu.update",
              resource_type="menu_item", resource_id=str(item_id),
              metadata={"fields_changed": list(changes.keys())})
        if "is_available" in changes and changes["is_available"] != previous_availability:
            audit(db, actor=current_admin, action="menu.availability",
                  resource_type="menu_item", resource_id=str(item_id),
                  metadata={"from_available": previous_availability,
                            "to_available": changes["is_available"]})
        db.commit()
        db.refresh(item)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return item


@router.patch("/menu/{item_id}/availability", response_model=MenuItemOut,
              summary="Toggle menu item availability")
def set_menu_availability(
    item_id: UUID,
    is_available: bool = Body(..., embed=True),
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    item.is_available = is_available
    try:
        audit(db, actor=current_admin, action="menu.availability",
              resource_type="menu_item", resource_id=str(item_id),
              metadata={"is_available": is_available, "name": item.name})
        db.commit()
        db.refresh(item)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return item


@router.delete("/menu/{item_id}", status_code=204,
               summary="Delete a menu item (fails if referenced by orders)")
def delete_menu_item(
    item_id: UUID,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    item_name = item.name
    try:
        db.delete(item)
        audit(db, actor=current_admin, action="menu.delete",
              resource_type="menu_item", resource_id=str(item_id),
              metadata={"name": item_name})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: this item is referenced by existing orders. "
                   "Mark it as unavailable instead.",
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")


# ══════════════════════════════════════════════════════════════════════════
#  TABLE MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════

@router.post("/tables", response_model=TableOut, status_code=201,
             summary="Create a table")
def create_table(
    body: TableCreate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        tbl = Table(**body.model_dump())
        db.add(tbl)
        db.flush()
        audit(db, actor=current_admin, action="table.create",
              resource_type="table", resource_id=str(tbl.id),
              metadata={"table_number": tbl.table_number, "capacity": tbl.capacity})
        db.commit()
        db.refresh(tbl)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409,
                            detail="Table number or QR secret already exists.")
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return tbl


@router.get("/tables", response_model=list[TableOut],
            summary="List all tables")
def list_tables(
    _: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        return db.query(Table).order_by(Table.table_number.asc()).all()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")


@router.patch("/tables/{table_id}", response_model=TableOut,
              summary="Update table capacity or status")
def update_table(
    table_id: UUID,
    body: TableUpdate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        tbl = db.query(Table).filter(Table.id == table_id).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if tbl is None:
        raise HTTPException(status_code=404, detail="Table not found.")
    changes = body.model_dump(exclude_none=True)
    for f, v in changes.items():
        setattr(tbl, f, v)
    try:
        audit(db, actor=current_admin, action="table.update",
              resource_type="table", resource_id=str(table_id),
              metadata={"fields_changed": list(changes.keys()),
                        "table_number": tbl.table_number})
        db.commit()
        db.refresh(tbl)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return tbl


@router.delete("/tables/{table_id}", status_code=204,
               summary="Delete a table (fails if it has sessions)")
def delete_table(
    table_id: UUID,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        tbl = db.query(Table).filter(Table.id == table_id).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if tbl is None:
        raise HTTPException(status_code=404, detail="Table not found.")
    table_number = tbl.table_number
    try:
        db.delete(tbl)
        audit(db, actor=current_admin, action="table.delete",
              resource_type="table", resource_id=str(table_id),
              metadata={"table_number": table_number})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: table has existing sessions. "
                   "Close all sessions before deleting.",
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")


# ══════════════════════════════════════════════════════════════════════════
#  ORDER MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════

@router.get("/orders", response_model=list[AdminOrderOut],
            summary="List all orders (admin view, newest first)")
def list_all_orders(
    limit:        int = Query(50, ge=1, le=200),
    offset:       int = Query(0, ge=0),
    status_filter: str | None = Query(None, alias="status"),
    date_from:    datetime | None = Query(None, description="Filter orders created >= this UTC datetime (ISO 8601)"),
    date_to:      datetime | None = Query(None, description="Filter orders created <  this UTC datetime (ISO 8601)"),
    _: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        q = db.query(Order)
        if status_filter:
            q = q.filter(Order.status == status_filter)
        if date_from is not None:
            q = q.filter(Order.created_at >= date_from)
        if date_to is not None:
            q = q.filter(Order.created_at < date_to)
        orders = q.order_by(Order.created_at.desc()).offset(offset).limit(limit).all()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return orders


@router.get("/orders/{order_id}", response_model=AdminOrderOut,
            summary="Get any order by ID (admin)")
def get_any_order(
    order_id: UUID,
    _: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        order = (
            db.query(Order)
            .options(joinedload(Order.order_items))
            .filter(Order.id == order_id)
            .first()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    return order


@router.patch("/orders/{order_id}/status", response_model=AdminOrderOut,
              summary="Update order status (admin — unrestricted transitions)")
def admin_update_order_status(
    order_id: UUID,
    body: AdminStatusUpdate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin can set any status — no progression restriction."""
    try:
        order = db.query(Order).filter(Order.id == order_id).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    if order.status == "delivered" and body.new_status.value != "delivered":
        raise HTTPException(
            status_code=400,
            detail="Delivered orders cannot move back to an earlier status.",
        )
    prev_status = order.status
    order.status = body.new_status.value
    try:
        audit(db, actor=current_admin, action="order.status_change",
              resource_type="order", resource_id=str(order_id),
              metadata={"order_number": order.order_number,
                        "from_status": prev_status,
                        "to_status": body.new_status.value})
        db.commit()
        db.refresh(order)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return order


@router.patch("/orders/{order_id}/payment", response_model=AdminOrderOut,
              summary="Confirm order payment (staff/admin)")
def confirm_order_payment(
    order_id: UUID,
    body: PaymentConfirmRequest,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Staff/admin manually confirms that an order was paid.

    - Only orders currently 'unpaid' can be confirmed.
    - 'fake_paid' (historical) and 'paid' (already confirmed) are rejected.
    - Sets payment_status='paid' and records the payment_method (cash or upi).
    - The action is audit-logged for compliance.

    Status codes:
    200 OK               — payment confirmed
    400 Business rule    — order is not 'unpaid' (already paid or fake_paid)
    401/403              — not authenticated as staff/admin
    404                  — order not found
    503                  — database unavailable
    """
    try:
        order = (
            db.query(Order)
            .filter(Order.id == order_id)
            .with_for_update()
            .first()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")

    if order.payment_status != "unpaid":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot confirm payment: order is currently '{order.payment_status}'. "
                   f"Only 'unpaid' orders can be confirmed.",
        )

    order.payment_status = "paid"
    order.payment_method = body.payment_method.value
    try:
        audit(db, actor=current_admin, action="order.payment_confirmed",
              resource_type="order", resource_id=str(order_id),
              metadata={"order_number": order.order_number,
                        "payment_method": body.payment_method.value,
                        "from_status": "unpaid",
                        "to_status": "paid"})
        db.commit()
        db.refresh(order)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return order


# ══════════════════════════════════════════════════════════════════════════
#  RESERVATION MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════

@router.get("/reservations", response_model=list[ReservationDetail],
            summary="List all reservations (admin)")
def list_all_reservations(
    limit:     int = Query(50, ge=1, le=200),
    offset:    int = Query(0, ge=0),
    date_from: datetime | None = Query(None, description="Filter reservations with reservation_time >= this UTC datetime"),
    date_to:   datetime | None = Query(None, description="Filter reservations with reservation_time <  this UTC datetime"),
    _: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        from app.models import ReservationAddonSelection
        q = (
            db.query(Reservation)
            .options(
                joinedload(Reservation.tables),
                joinedload(Reservation.addon_selections).joinedload(
                    ReservationAddonSelection.addon
                ),
            )
        )
        if date_from is not None:
            q = q.filter(Reservation.reservation_time >= date_from)
        if date_to is not None:
            q = q.filter(Reservation.reservation_time < date_to)
        reservations = (
            q.order_by(Reservation.created_at.desc())
            .offset(offset).limit(limit)
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return [_build_res_detail(r) for r in reservations]


@router.patch("/reservations/{reservation_id}/cancel",
              response_model=ReservationDetail,
              summary="Cancel any reservation (admin)")
def admin_cancel_reservation(
    reservation_id: UUID,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        from app.models import ReservationAddonSelection
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
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if res is None:
        raise HTTPException(status_code=404, detail="Reservation not found.")
    if res.status == "cancelled":
        raise HTTPException(status_code=400, detail="Reservation is already cancelled.")
    res.status = "cancelled"
    try:
        audit(db, actor=current_admin, action="reservation.cancel",
              resource_type="reservation", resource_id=str(reservation_id),
              metadata={"user_id": str(res.user_id),
                        "reservation_time": str(res.reservation_time),
                        "cancelled_by": "admin"})
        db.commit()
        db.refresh(res)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return _build_res_detail(res)


# ══════════════════════════════════════════════════════════════════════════
#  RATINGS  (customer creation + admin management)
# ══════════════════════════════════════════════════════════════════════════

@ratings_router.post("", response_model=RatingOut2, status_code=201,
                     summary="Submit a rating for your own order")
def create_rating(
    body: RatingCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Customer submits a rating for one of their own orders.
    - Stars 1-5 only (enforced by Pydantic + DB CHECK constraint).
    - One rating per order (enforced by DB unique constraint).
    - order_id must belong to the authenticated user.
    """
    try:
        order = db.query(Order).filter(
            Order.id == body.order_id,
            Order.user_id == current_user.id,
        ).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if order is None:
        raise HTTPException(status_code=404,
                            detail="Order not found or does not belong to you.")

    rating = Rating(
        order_id=body.order_id,
        user_id=current_user.id,
        stars=body.stars,
        comment=body.comment,
    )
    try:
        db.add(rating)
        db.commit()
        db.refresh(rating)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409,
                            detail="You have already rated this order.")
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return rating


@router.get("/ratings", response_model=list[RatingOut2],
            summary="List all ratings (admin)")
def list_all_ratings(
    limit:  int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        return (db.query(Rating)
                .order_by(Rating.created_at.desc())
                .offset(offset).limit(limit).all())
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")


@router.delete("/ratings/{rating_id}", status_code=204,
               summary="Delete a rating (admin)")
def delete_rating(
    rating_id: UUID,
    _: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        rating = db.query(Rating).filter(Rating.id == rating_id).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if rating is None:
        raise HTTPException(status_code=404, detail="Rating not found.")
    try:
        db.delete(rating)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")


# ══════════════════════════════════════════════════════════════════════════
#  NEW ADMIN ENDPOINTS — Step 2 additions
#
#  GET  /admin/menu                       list ALL menu items (incl. unavailable)
#  GET  /admin/users                      list all customer accounts
#  GET  /admin/sessions                   list all table sessions
#  POST /admin/sessions                   manually open a session on any table
#  PATCH /admin/sessions/{id}/close       force-close any session
#  GET  /admin/dashboard/stats            dashboard KPI snapshot
#  PATCH /admin/addons/{id}/availability  enable/disable a reservation add-on
# ══════════════════════════════════════════════════════════════════════════

import secrets as _secrets
from datetime import date as _date, datetime as _datetime, timedelta as _timedelta, timezone as _timezone
from decimal import Decimal as _Decimal


# ── GET /admin/menu ───────────────────────────────────────────────────────

@router.get(
    "/menu",
    response_model=list[MenuItemOut],
    summary="List ALL menu items including unavailable ones (admin)",
)
def admin_list_menu(
    category: str | None = Query(None, max_length=100),
    _: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Returns every menu item — available and unavailable — so the admin
    panel can display and manage the full catalogue.

    Optional `category` query param narrows results.
    """
    try:
        q = db.query(MenuItem)
        if category:
            q = q.filter(MenuItem.category.ilike(category))
        items = q.order_by(MenuItem.category.asc(), MenuItem.name.asc()).all()
    except SQLAlchemyError as exc:
        logger.error("admin_list_menu: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return items


# ── GET /admin/users ──────────────────────────────────────────────────────

@router.get(
    "/users",
    response_model=list[AdminUserOut],
    summary="List all customer accounts (admin)",
)
def admin_list_users(
    limit:  int = Query(100, ge=1, le=500),
    offset: int = Query(0,   ge=0),
    _: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Returns all registered customer accounts, newest first.
    Passwords are never exposed — only id, name, mobile_number, timestamps.
    """
    try:
        users = (
            db.query(User)
            .order_by(User.created_at.desc())
            .offset(offset).limit(limit)
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("admin_list_users: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return users


# ── GET /admin/sessions ───────────────────────────────────────────────────

@router.get(
    "/sessions",
    response_model=list[AdminSessionOut],
    summary="List all table sessions (admin)",
)
def admin_list_sessions(
    status_filter: str | None = Query(None, alias="status",
                                      description="Filter by status: 'active' or 'closed'"),
    limit:  int = Query(100, ge=1, le=500),
    offset: int = Query(0,   ge=0),
    _: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Returns table sessions with the associated table_number for display.
    Filter by `status=active` to see only open sessions.
    """
    try:
        q = (
            db.query(TableSession)
            .join(Table, TableSession.table_id == Table.id)
        )
        if status_filter in ("active", "closed"):
            q = q.filter(TableSession.status == status_filter)
        sessions = (
            q.order_by(TableSession.started_at.desc())
            .offset(offset).limit(limit)
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("admin_list_sessions: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return [
        AdminSessionOut(
            id=s.id,
            table_id=s.table_id,
            table_number=s.table.table_number,
            session_token=s.session_token,
            status=s.status,
            started_at=s.started_at,
            closed_at=s.closed_at,
            expires_at=s.expires_at,
        )
        for s in sessions
    ]


# ── POST /admin/sessions ──────────────────────────────────────────────────

@router.post(
    "/sessions",
    response_model=AdminSessionOut,
    status_code=201,
    summary="Manually open a table session (admin)",
)
def admin_open_session(
    body: AdminSessionCreate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Opens a new active session on the specified table.

    - 201  Created  — session opened, token returned
    - 400  Bad Request — table already has an active session
    - 404  Not Found   — table_id does not exist
    - 409  Conflict    — duplicate session_token (retry automatically handled)
    - 503  DB unavailable
    """
    # 1 — Verify table exists
    try:
        table = db.query(Table).filter(Table.id == body.table_id).first()
    except SQLAlchemyError as exc:
        logger.error("admin_open_session: table lookup: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if table is None:
        raise HTTPException(status_code=404, detail="Table not found.")

    # 2 — Reject if an active session already exists on this table
    try:
        existing = (
            db.query(TableSession)
            .filter(
                TableSession.table_id == body.table_id,
                TableSession.status == "active",
            )
            .first()
        )
    except SQLAlchemyError as exc:
        logger.error("admin_open_session: existing session check: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if existing is not None:
        raise HTTPException(
            status_code=400,
            detail=f"Table {table.table_number} already has an active session "
                   f"(session_id={existing.id}). Close it first.",
        )

    # 3 — Create session
    token = _secrets.token_urlsafe(48)
    try:
        sess = TableSession(
            table_id=table.id,
            session_token=token,
            status="active",
        )
        db.add(sess)
        db.flush()
        table.status = "occupied"
        audit(db, actor=current_admin, action="session.open",
              resource_type="table_session", resource_id=str(sess.id),
              metadata={"table_id": str(table.id),
                        "table_number": table.table_number})
        db.commit()
        db.refresh(sess)
    except IntegrityError:
        # The partial unique index uq_one_active_session_per_table fired —
        # a concurrent admin open or QR scan beat this request to the INSERT.
        # Roll back cleanly and return 409, matching scan_qr behaviour.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Table {table.table_number} already has an active session "
                "(opened by a concurrent request). Refresh and try again."
            ),
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("admin_open_session: insert: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return AdminSessionOut(
        id=sess.id,
        table_id=sess.table_id,
        table_number=table.table_number,
        session_token=sess.session_token,
        status=sess.status,
        started_at=sess.started_at,
        closed_at=sess.closed_at,
        expires_at=sess.expires_at,
    )


# ── PATCH /admin/sessions/{session_id}/close ──────────────────────────────

@router.patch(
    "/sessions/{session_id}/close",
    response_model=AdminSessionOut,
    summary="Force-close any table session (admin)",
)
def admin_close_session(
    session_id: UUID,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Force-closes a session regardless of whether the customer has an order.
    Also marks the associated table as 'free'.

    - 200  OK          — session closed
    - 400  Bad Request — session is already closed
    - 404  Not Found   — session_id does not exist
    - 503  DB unavailable
    """
    try:
        sess = (
            db.query(TableSession)
            .filter(TableSession.id == session_id)
            .with_for_update()
            .first()
        )
    except SQLAlchemyError as exc:
        logger.error("admin_close_session: lookup: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    if sess.status == "closed":
        raise HTTPException(status_code=400, detail="Session is already closed.")

    # ── Payment safeguard: reject if any order is unpaid or fake_paid ────
    _check_session_orders_paid(sess, db)

    try:
        sess.status = "closed"
        sess.closed_at = _datetime.now(_timezone.utc)
        if sess.table:
            sess.table.status = "free"
        audit(db, actor=current_admin, action="session.close",
              resource_type="table_session", resource_id=str(session_id),
              metadata={"table_id": str(sess.table_id),
                        "table_number": sess.table.table_number if sess.table else None})
        db.commit()
        db.refresh(sess)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("admin_close_session: commit: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return AdminSessionOut(
        id=sess.id,
        table_id=sess.table_id,
        table_number=sess.table.table_number,
        session_token=sess.session_token,
        status=sess.status,
        started_at=sess.started_at,
        closed_at=sess.closed_at,
        expires_at=sess.expires_at,
    )


# ── GET /admin/dashboard/stats ────────────────────────────────────────────

@router.get(
    "/dashboard/stats",
    response_model=DashboardStats,
    summary="Dashboard KPI snapshot (admin)",
)
def admin_dashboard_stats(
    _: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Returns four live counts/totals for the admin dashboard header:

    - orders_today          count of all orders created today (UTC)
    - order_value_today     sum of total_price for today's orders (not verified revenue)
    - active_sessions       count of currently active table sessions
    - upcoming_reservations confirmed reservations in the next 24 hours
    """
    from sqlalchemy import func as _func

    now_utc   = _datetime.now(_timezone.utc)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + _timedelta(days=1)
    next_24h  = now_utc + _timedelta(hours=24)

    try:
        # Orders today + revenue today
        row = (
            db.query(
                _func.count(Order.id).label("cnt"),
                _func.coalesce(_func.sum(Order.total_price), 0).label("rev"),
            )
            .filter(Order.created_at >= today_start, Order.created_at < tomorrow_start)
            .one()
        )
        orders_today = row.cnt
        order_value_today = _Decimal(str(row.rev))

        # Active sessions
        active_sessions = (
            db.query(_func.count(TableSession.id))
            .filter(TableSession.status == "active")
            .scalar()
        ) or 0

        # Upcoming confirmed reservations in next 24 h
        upcoming = (
            db.query(_func.count(Reservation.id))
            .filter(
                Reservation.status == "confirmed",
                Reservation.reservation_time >= now_utc,
                Reservation.reservation_time <= next_24h,
            )
            .scalar()
        ) or 0

    except SQLAlchemyError as exc:
        logger.error("admin_dashboard_stats: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return DashboardStats(
        orders_today=orders_today,
        order_value_today=order_value_today,
        revenue_today=None,
        revenue_available=False,
        revenue_unavailable_reason=(
            "The payment model only records fake_paid and has no verified settlement ledger."
        ),
        active_sessions=active_sessions,
        upcoming_reservations=upcoming,
    )


# ── PATCH /admin/addons/{addon_id}/availability ───────────────────────────

@router.patch(
    "/addons/{addon_id}/availability",
    response_model=ReservationAddonOut,
    summary="Enable or disable a reservation add-on (admin)",
)
def admin_set_addon_availability(
    addon_id: UUID,
    is_available: bool = Body(..., embed=True),
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Toggles `is_available` on a reservation add-on.

    - 200  OK        — updated add-on returned
    - 404  Not Found — addon_id does not exist
    - 503  DB unavailable
    """
    try:
        addon = db.query(ReservationAddon).filter(ReservationAddon.id == addon_id).first()
    except SQLAlchemyError as exc:
        logger.error("admin_set_addon_availability: lookup: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if addon is None:
        raise HTTPException(status_code=404, detail="Add-on not found.")

    addon.is_available = is_available
    try:
        audit(db, actor=current_admin, action="addon.availability",
              resource_type="reservation_addon", resource_id=str(addon_id),
              metadata={"name": addon.name, "is_available": is_available})
        db.commit()
        db.refresh(addon)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("admin_set_addon_availability: commit: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return addon


@router.post(
    "/addons",
    response_model=ReservationAddonOut,
    status_code=201,
    summary="Create a reservation add-on (admin)",
)
def admin_create_addon(
    body: ReservationAddonCreate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        addon = ReservationAddon(**body.model_dump())
        db.add(addon)
        db.flush()
        audit(db, actor=current_admin, action="addon.create",
              resource_type="reservation_addon", resource_id=str(addon.id),
              metadata={"name": addon.name, "price": str(addon.price),
                        "is_available": addon.is_available})
        db.commit()
        db.refresh(addon)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("admin_create_addon: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return addon


# ── GET /admin/addons ─────────────────────────────────────────────────────

@router.get(
    "/addons",
    response_model=list[ReservationAddonOut],
    summary="List ALL reservation add-ons including unavailable ones (admin)",
)
def admin_list_addons(
    _: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Returns every reservation add-on regardless of is_available flag.
    The public endpoint /reservations/addons/available only returns
    is_available=True; this admin endpoint returns the complete list.

    - 200  OK   — list returned (may be empty)
    - 503  DB unavailable
    """
    try:
        addons = (
            db.query(ReservationAddon)
            .order_by(ReservationAddon.price.asc())
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("admin_list_addons: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return addons


# ── PATCH /admin/addons/{addon_id} ────────────────────────────────────────

@router.patch(
    "/addons/{addon_id}",
    response_model=ReservationAddonOut,
    summary="Update a reservation add-on (admin)",
)
def admin_update_addon(
    addon_id: UUID,
    body: ReservationAddonUpdate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Partially update a reservation add-on using the existing
    ReservationAddonUpdate schema (name, description, price,
    image_url, is_available).

    Only fields explicitly provided are updated (exclude_none=True).
    Price must be >= 0.

    - 200  OK        — updated add-on returned
    - 404  Not Found — addon_id does not exist
    - 422  Validation error (e.g. negative price)
    - 503  DB unavailable
    """
    try:
        addon = db.query(ReservationAddon).filter(ReservationAddon.id == addon_id).first()
    except SQLAlchemyError as exc:
        logger.error("admin_update_addon: lookup: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if addon is None:
        raise HTTPException(status_code=404, detail="Add-on not found.")

    changes = body.model_dump(exclude_none=True)
    previous_availability = addon.is_available
    for field, value in changes.items():
        setattr(addon, field, value)

    try:
        audit(db, actor=current_admin, action="addon.update",
              resource_type="reservation_addon", resource_id=str(addon_id),
              metadata={"fields_changed": list(changes.keys()), "name": addon.name})
        if "is_available" in changes and changes["is_available"] != previous_availability:
            audit(db, actor=current_admin, action="addon.availability",
                  resource_type="reservation_addon", resource_id=str(addon_id),
                  metadata={"from_available": previous_availability,
                            "to_available": changes["is_available"]})
        db.commit()
        db.refresh(addon)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("admin_update_addon: commit: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return addon


@router.delete("/addons/{addon_id}", status_code=204,
               summary="Delete a reservation add-on (admin)")
def admin_delete_addon(
    addon_id: UUID,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        addon = db.query(ReservationAddon).filter(ReservationAddon.id == addon_id).first()
    except SQLAlchemyError as exc:
        logger.error("admin_delete_addon lookup: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if addon is None:
        raise HTTPException(status_code=404, detail="Add-on not found.")
    addon_name = addon.name
    try:
        db.delete(addon)
        audit(db, actor=current_admin, action="addon.delete",
              resource_type="reservation_addon", resource_id=str(addon_id),
              metadata={"name": addon_name})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409,
                            detail="Cannot delete: this add-on is used by existing reservations.")
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("admin_delete_addon: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")


# ══════════════════════════════════════════════════════════════════════════
#  STAFF MANAGEMENT  (head admin only)
#
#  GET  /admin/staff           list all staff accounts
#  POST /admin/staff           create a new staff account
#  PATCH /admin/staff/{id}     activate/deactivate, reset password
#
#  Security rules enforced here:
#   • All endpoints require get_head_admin — staff cannot call them.
#   • Staff accounts are always created with role='staff' — body cannot
#     supply a role field.
#   • PATCH cannot change role — promotion to head_admin is not supported
#     via this API.
#   • The last remaining head_admin account cannot be deactivated.
#   • Password hashes are never returned in any response.
# ══════════════════════════════════════════════════════════════════════════

@router.get(
    "/staff",
    response_model=list[StaffOut],
    summary="List all staff accounts (head admin only)",
)
def list_staff(
    include_inactive: bool = Query(False, description="Include deactivated accounts"),
    _: Admin = Depends(get_head_admin),
    db: Session = Depends(get_db),
):
    """
    Returns all accounts with role='staff'.
    Head admins are not included (use GET /admin/me for your own details).

    - 200  OK   — list returned (may be empty)
    - 403  Forbidden — caller is not a head_admin
    - 503  DB unavailable
    """
    try:
        q = db.query(Admin).filter(Admin.role == "staff")
        if not include_inactive:
            q = q.filter(Admin.is_active.is_(True))
        staff = q.order_by(Admin.created_at.asc()).all()
    except SQLAlchemyError as exc:
        logger.error("list_staff DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    return staff


@router.post(
    "/staff",
    response_model=StaffOut,
    status_code=201,
    summary="Create a staff account (head admin only)",
)
def create_staff(
    body: StaffCreate,
    current_admin: Admin = Depends(get_head_admin),
    db: Session = Depends(get_db),
):
    """
    Creates a new staff account with role='staff' and is_active=True.

    The `role` field is always forced to 'staff' regardless of anything
    in the request — staff cannot be promoted to head_admin here.

    - 201  Created    — staff account created
    - 409  Conflict   — username already exists
    - 403  Forbidden  — caller is not a head_admin
    - 503  DB unavailable
    """
    try:
        existing = db.query(Admin).filter(Admin.username == body.username).first()
    except SQLAlchemyError as exc:
        logger.error("create_staff DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if existing:
        raise HTTPException(status_code=409, detail="Username already exists.")

    new_staff = Admin(
        username=body.username,
        password_hash=hash_password(body.password),
        role="staff",          # always staff — never promoted here
        is_active=True,
        created_by=current_admin.id,
    )
    try:
        db.add(new_staff)
        db.flush()
        audit(db, actor=current_admin, action="staff.create",
              resource_type="admin", resource_id=str(new_staff.id),
              metadata={"username": new_staff.username, "role": "staff"},
              required=True)
        db.commit()
        db.refresh(new_staff)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("create_staff insert error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return new_staff


@router.patch(
    "/staff/{staff_id}",
    response_model=StaffOut,
    summary="Update a staff account — activate/deactivate or reset password (head admin only)",
)
def update_staff(
    staff_id: UUID,
    body: StaffUpdate,
    current_admin: Admin = Depends(get_head_admin),
    db: Session = Depends(get_db),
):
    """
    Partially updates a staff account.

    Allowed fields (StaffUpdate):
      is_active  — deactivate or reactivate the account
      password   — reset the staff member's password (min 8 chars)

    Role changes are intentionally NOT supported here.
    Staff cannot be promoted to head_admin via this endpoint.

    Safety guard: deactivating the last active head_admin is rejected
    (though this endpoint only targets staff — included for defence-in-depth).

    - 200  OK         — updated staff account returned
    - 400  Bad Request — attempted to deactivate the last active head_admin
    - 403  Forbidden  — target account is not role='staff' (cannot modify head admins)
    - 404  Not Found  — staff_id does not exist
    - 503  DB unavailable
    """
    try:
        target = db.query(Admin).filter(Admin.id == staff_id).first()
    except SQLAlchemyError as exc:
        logger.error("update_staff lookup error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if target is None:
        raise HTTPException(status_code=404, detail="Staff account not found.")

    # Head admins cannot be modified via this endpoint — prevents lateral escalation
    if target.role != "staff":
        raise HTTPException(
            status_code=403,
            detail="Cannot modify a head_admin account via the staff endpoint.",
        )

    # Apply allowed updates
    # Collect what's being changed for audit metadata — determined before apply
    audit_actions: list[str] = []
    audit_meta: dict = {"target_username": target.username, "target_id": str(target.id)}

    if body.is_active is not None:
        # Defence-in-depth: ensure at least one active head_admin will remain
        if not body.is_active and target.role == "head_admin":
            try:
                active_heads = (
                    db.query(Admin)
                    .filter(Admin.role == "head_admin", Admin.is_active.is_(True))
                    .count()
                )
            except SQLAlchemyError as exc:
                logger.error("update_staff head_admin count error: %s", exc)
                raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
            if active_heads <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot deactivate the last active head_admin account.",
                )
        audit_actions.append("staff.activate" if body.is_active else "staff.deactivate")
        audit_meta["is_active"] = body.is_active
        target.is_active = body.is_active

    if body.password is not None:
        audit_actions.append("staff.password_reset")
        target.password_hash = hash_password(body.password)

    try:
        for action_name in audit_actions:
            audit(db, actor=current_admin, action=action_name,
                  resource_type="admin", resource_id=str(staff_id),
                metadata=audit_meta, required=True)
        db.commit()
        db.refresh(target)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("update_staff commit error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return target
