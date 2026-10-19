"""
app/routers/orders.py — Orders API.

POST  /orders                  create a new order
GET   /orders                  list authenticated user's orders (newest first)
GET   /orders/{order_id}       get full order detail
PATCH /orders/{order_id}/status update order status (staff use; admin enforcement later)
GET   /delivery-zones          list all delivery charge bands (public)

Order types and rules
──────────────────────
dine_in       - requires active session_token (QR scan)
takeaway      - no session; generates daily_token_number (Order #N, per-day counter)
home_delivery - requires delivery_address + delivery_distance_km;
                delivery_charge added from delivery_zones table;
                beyond 10 km → rejected

Pricing
───────
- ALL prices fetched from menu_items at time of order (never from client)
- price_at_order stored as historical snapshot per OrderItem
- total_price = sum(price_at_order * quantity) + delivery_charge (if any)
- delivery_charge stored in delivery_address field context; returned in response

Order numbers
─────────────
- dine_in  → "T-NNNN"  using seq_order_table
- takeaway → "TK-NNNN" using seq_order_takeaway
- delivery → "D-NNNN"  using seq_order_delivery
- Sequences are PostgreSQL-native → concurrent-safe, no race conditions

daily_token_number
──────────────────
- takeaway only: count of today's takeaway orders + 1
- Calculated fresh from DB (no reset job needed — date-based)
- NULL for dine_in and home_delivery
"""

import logging
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.audit import audit
from app.database import get_db
from app.dependencies import get_current_admin, get_current_user
from app.models import (
    Admin,
    DeliveryZone,
    MenuItem,
    Order,
    OrderItem,
    TableSession,
    User,
)
from app.order_progression import advance_order_statuses
from app.schemas import (
    DeliveryZoneOut,
    OrderCreateRequest,
    OrderDetail,
    OrderItemDetail,
    OrderStatusEnum,
    OrderTypeEnum,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["Orders"])

# ── Sequence name map ─────────────────────────────────────────────────────
SEQ_MAP = {
    "dine_in":       ("seq_order_table",    "T"),
    "takeaway":      ("seq_order_takeaway", "TK"),
    "home_delivery": ("seq_order_delivery", "D"),
}


# ── GET /delivery-zones ───────────────────────────────────────────────────

@router.get(
    "/delivery-zones",
    response_model=list[DeliveryZoneOut],
    summary="List all delivery charge bands (public)",
)
def list_delivery_zones(db: Session = Depends(get_db)):
    """
    Return all delivery zones sorted by min_distance_km ascending.
    Public — no authentication required.
    Used by the frontend to preview delivery charges before order submission.

    - 200  OK          — list of zones (may be empty if not seeded)
    - 503  Unavailable — database temporarily unreachable
    """
    try:
        zones = (
            db.query(DeliveryZone)
            .order_by(DeliveryZone.min_distance_km.asc())
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("list_delivery_zones: DB error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database temporarily unavailable. Please retry.",
        )
    return zones


# ── Helpers ───────────────────────────────────────────────────────────────

def _next_order_number(order_type: str, db: Session) -> str:
    """
    Call the appropriate PostgreSQL sequence and format the order number.
    This is atomic at the DB level — no race condition possible.
    """
    seq_name, prefix = SEQ_MAP[order_type]
    row = db.execute(text(f"SELECT nextval('{seq_name}')")).fetchone()
    return f"{prefix}-{row[0]}"


def _daily_token(db: Session) -> int:
    """
    Count today's takeaway orders and return the next token number.
    Calculated fresh from the DB — no reset job needed.
    """
    # Serialize allocation inside the current transaction so concurrent
    # takeaway orders cannot observe the same count and receive one token.
    db.execute(text("SELECT pg_advisory_xact_lock(78124591)"))
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
    tomorrow_start = today_start + timedelta(days=1)
    count = (
        db.query(func.count(Order.id))
        .filter(
            Order.order_type == "takeaway",
            Order.created_at >= today_start,
            Order.created_at < tomorrow_start,
        )
        .scalar()
    ) or 0
    return count + 1


def _calc_eta(distance_km: Decimal, total_qty: int) -> int:
    """
    Calculate estimated delivery minutes from distance and item quantity.
    Called server-side only — never accepts client input.

    Distance bands:
      0–1 km    → 20 min
            1–4 km    → 20 min
            4–5 km    → 30 min
      5–7 km    → 35 min
      7–10 km   → 45 min

    Quantity adjustment:
      1–2 items  → +0
      3–4 items  → +5
      5–6 items  → +10
      7+ items   → +15
    """
    d = float(distance_km)
    if d <= 1:      base = 20
    elif d <= 4:    base = 20
    elif d <= 5:    base = 30
    elif d <= 7:    base = 35
    else:           base = 45   # covers 7–10 km

    if total_qty <= 2:    adj = 0
    elif total_qty <= 4:  adj = 5
    elif total_qty <= 6:  adj = 10
    else:                 adj = 15

    return base + adj


def _build_detail(order: Order) -> "OrderDetail":
    """Convert an Order ORM object to OrderDetail response schema."""
    items_total = Decimal("0.00")
    item_rows: list[OrderItemDetail] = []
    total_qty = 0

    for oi in order.order_items:
        pt = Decimal(str(oi.price_at_order))
        line = pt * oi.quantity
        items_total += line
        total_qty += oi.quantity
        name = oi.menu_item.name if oi.menu_item else "(deleted)"
        item_rows.append(OrderItemDetail(
            id=oi.id,
            menu_item_id=oi.menu_item_id,
            menu_item_name=name,
            quantity=oi.quantity,
            price_at_order=pt,
            line_total=line,
        ))

    total = Decimal(str(order.total_price))
    delivery_charge = total - items_total if total > items_total else Decimal("0.00")

    # ── ETA — server-side only, null for non-delivery orders ─────────────
    eta_minutes: Optional[int] = None
    eta_at: Optional[datetime] = None
    if order.order_type == "home_delivery" and order.delivery_distance_km is not None:
        eta_minutes = _calc_eta(Decimal(str(order.delivery_distance_km)), total_qty)
        if order.created_at:
            ca = order.created_at
            if ca.tzinfo is None:
                ca = ca.replace(tzinfo=timezone.utc)
            eta_at = ca + timedelta(minutes=eta_minutes)

    return OrderDetail(
        id=order.id,
        order_number=order.order_number,
        order_type=OrderTypeEnum(order.order_type),
        status=OrderStatusEnum(order.status),
        payment_status=order.payment_status,
        session_id=order.session_id,
        user_id=order.user_id,
        delivery_address=order.delivery_address,
        delivery_charge=delivery_charge if delivery_charge > 0 else None,
        delivery_distance_km=Decimal(str(order.delivery_distance_km)) if order.delivery_distance_km else None,
        items_total=items_total,
        total_price=total,
        daily_token_number=order.daily_token_number,
        estimated_delivery_minutes=eta_minutes,
        estimated_delivery_at=eta_at,
        created_at=order.created_at,
        updated_at=order.updated_at,
        items=item_rows,
    )


def _load_order(order_id: UUID, user_id: UUID, db: Session) -> Order:
    try:
        order = (
            db.query(Order)
            .options(
                joinedload(Order.order_items).joinedload(OrderItem.menu_item)
            )
            .filter(Order.id == order_id)
            .first()
        )
    except SQLAlchemyError as exc:
        logger.error("_load_order DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    if order.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return order


# ── POST /orders ──────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=OrderDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new order",
)
def create_order(
    body: OrderCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create an order. All pricing is server-authoritative.

    Rules per order_type:
    - dine_in:       session_token (active QR session) required
    - takeaway:      no session needed; daily_token_number assigned
    - home_delivery: delivery_address + delivery_distance_km required

    Status codes:
    201 Created
    400 Business rule violation (past date, no address, >10km, etc.)
    401 Not authenticated
    404 Menu item not found
    422 Validation error
    503 DB unavailable
    """
    order_type = body.order_type.value

    # ── 1 · Validate session for dine_in ─────────────────────────────────
    session_id: UUID | None = None
    if order_type == "dine_in":
        if not body.session_token:
            raise HTTPException(
                status_code=400,
                detail="session_token is required for dine_in orders.",
            )
        try:
            sess = (
                db.query(TableSession)
                .filter(
                    TableSession.session_token == body.session_token,
                    TableSession.status == "active",
                )
                .with_for_update()
                .first()
            )
        except SQLAlchemyError as exc:
            logger.error("create_order: session lookup error: %s", exc)
            raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

        if sess is None:
            raise HTTPException(
                status_code=400,
                detail="Invalid or inactive session_token.",
            )
        session_id = sess.id

    # ── 2 · Validate delivery fields ─────────────────────────────────────
    delivery_charge = Decimal("0.00")
    if order_type == "home_delivery":
        if not body.delivery_address or not body.delivery_address.strip():
            raise HTTPException(
                status_code=400,
                detail="delivery_address is required for home_delivery orders.",
            )
        if body.delivery_distance_km is None:
            raise HTTPException(
                status_code=400,
                detail="delivery_distance_km is required for home_delivery orders.",
            )
        dist = Decimal(str(body.delivery_distance_km))
        if dist > Decimal("10"):
            raise HTTPException(
                status_code=400,
                detail=f"Delivery distance {dist} km exceeds the maximum of 10 km. "
                       "We don't deliver beyond 10 km.",
            )
        # Find the matching delivery zone
        try:
            zone = (
                db.query(DeliveryZone)
                .filter(
                    DeliveryZone.min_distance_km <= dist,
                    DeliveryZone.max_distance_km > dist,
                )
                .first()
            )
        except SQLAlchemyError as exc:
            logger.error("create_order: delivery zone lookup error: %s", exc)
            raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

        if zone is None:
            # Fallback: try exact max boundary (5–10 zone uses max=10)
            try:
                zone = (
                    db.query(DeliveryZone)
                    .filter(
                        DeliveryZone.min_distance_km <= dist,
                        DeliveryZone.max_distance_km >= dist,
                    )
                    .order_by(DeliveryZone.min_distance_km.desc())
                    .first()
                )
            except SQLAlchemyError as exc:
                logger.error("create_order: delivery zone fallback error: %s", exc)
                raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

        if zone is None:
            raise HTTPException(
                status_code=400,
                detail=f"No delivery zone configured for {dist} km. "
                       "Please check available delivery areas.",
            )
        delivery_charge = Decimal(str(zone.charge))

    # ── 3 · Fetch and validate menu items (server-side prices) ───────────
    item_ids = [i.menu_item_id for i in body.items]
    try:
        menu_items = (
            db.query(MenuItem)
            .filter(MenuItem.id.in_(item_ids))
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("create_order: menu item lookup error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    # Build id → MenuItem map
    item_map = {mi.id: mi for mi in menu_items}

    items_total = Decimal("0.00")
    order_item_data: list[tuple] = []   # (menu_item_id, quantity, price_at_order)

    for req_item in body.items:
        mi = item_map.get(req_item.menu_item_id)
        if mi is None:
            raise HTTPException(
                status_code=404,
                detail=f"Menu item '{req_item.menu_item_id}' not found.",
            )
        if not mi.is_available:
            raise HTTPException(
                status_code=400,
                detail=f"Menu item '{mi.name}' is currently unavailable.",
            )
        # Server-authoritative price — client never sets this
        price = Decimal(str(mi.price))
        items_total += price * req_item.quantity
        order_item_data.append((mi.id, req_item.quantity, price))

    total_price = items_total + delivery_charge

    # ── 4 · Generate order number (sequence) ─────────────────────────────
    try:
        order_number = _next_order_number(order_type, db)
    except SQLAlchemyError as exc:
        logger.error("create_order: sequence error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    # ── 5 · daily_token_number (takeaway only) ────────────────────────────
    daily_token: int | None = None
    if order_type == "takeaway":
        try:
            daily_token = _daily_token(db)
        except SQLAlchemyError as exc:
            logger.error("create_order: daily_token error: %s", exc)
            raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    # ── 6 · Insert order + order_items atomically ─────────────────────────
    try:
        new_order = Order(
            order_number=order_number,
            session_id=session_id,
            user_id=current_user.id,
            order_type=order_type,
            status="placed",
            total_price=total_price,
            payment_status="unpaid",
            delivery_address=body.delivery_address,
            delivery_distance_km=Decimal(str(body.delivery_distance_km)) if body.delivery_distance_km is not None else None,
            daily_token_number=daily_token,
        )
        db.add(new_order)
        db.flush()   # get new_order.id

        for mi_id, qty, price in order_item_data:
            db.add(OrderItem(
                order_id=new_order.id,
                menu_item_id=mi_id,
                quantity=qty,
                price_at_order=price,
            ))

        db.commit()
        db.refresh(new_order)

    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("create_order: insert error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    # ── 7 · Return full detail ────────────────────────────────────────────
    return _build_detail(_load_order(new_order.id, current_user.id, db))


# ── GET /orders ────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[OrderDetail],
    summary="List authenticated user's orders (newest first)",
)
def list_my_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        advance_order_statuses(db)
        orders = (
            db.query(Order)
            .options(
                joinedload(Order.order_items).joinedload(OrderItem.menu_item)
            )
            .filter(Order.user_id == current_user.id)
            .order_by(Order.created_at.desc())
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("list_my_orders DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return [_build_detail(o) for o in orders]


# ── GET /orders/{order_id} ─────────────────────────────────────────────────

@router.get(
    "/{order_id}",
    response_model=OrderDetail,
    summary="Get full order detail",
)
def get_order(
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    advance_order_statuses(db)
    return _build_detail(_load_order(order_id, current_user.id, db))


# ── PATCH /orders/{order_id}/status ───────────────────────────────────────

@router.patch(
    "/{order_id}/status",
    response_model=OrderDetail,
    summary="Update order status (staff/admin use)",
)
def update_order_status(
    order_id: UUID,
    new_status: OrderStatusEnum,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Advance an order through its lifecycle:
    placed → preparing → active → delivered

    Status updates are restricted to the admin endpoint's authorization model.
    """
    try:
        order = (
            db.query(Order)
            .options(
                joinedload(Order.order_items).joinedload(OrderItem.menu_item)
            )
            .filter(Order.id == order_id)
            .first()
        )
    except SQLAlchemyError as exc:
        logger.error("update_order_status lookup error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")

    # Simple forward-only progression guard
    progression = {
        "placed":    {"preparing"},
        "preparing": {"active"},
        "active":    {"delivered"},
        "delivered": set(),
    }
    allowed = progression.get(order.status, set())
    if new_status.value not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move order from '{order.status}' to '{new_status.value}'. "
                   f"Allowed next states: {allowed or 'none (order is final)'}",
        )

    prev_status = order.status
    try:
        order.status = new_status.value
        audit(db, actor=current_admin, action="order.status_change",
              resource_type="order", resource_id=str(order_id),
              metadata={"order_number": order.order_number,
                        "from_status": prev_status,
                        "to_status": new_status.value})
        db.commit()
        db.refresh(order)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("update_order_status DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return _build_detail(order)
