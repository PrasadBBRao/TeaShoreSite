"""
schemas.py — Pydantic v2 request/response schemas for Teashore.

Convention:
  <Model>Base    shared fields (no id / server-generated timestamps)
  <Model>Create  fields accepted on creation
  <Model>Out     full read schema returned to API consumers
  <Model>Update  optional fields for PATCH operations
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, SecretStr


# ── Shared Pydantic config ────────────────────────────────────────────────

class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Enums (mirror models.py) ──────────────────────────────────────────────

class TableStatusEnum(str, Enum):
    free     = "free"
    occupied = "occupied"

class SessionStatusEnum(str, Enum):
    active = "active"
    closed = "closed"

class OrderTypeEnum(str, Enum):
    dine_in       = "dine_in"
    takeaway      = "takeaway"
    home_delivery = "home_delivery"

class OrderStatusEnum(str, Enum):
    placed    = "placed"
    preparing = "preparing"
    active    = "active"
    delivered = "delivered"

class PaymentStatusEnum(str, Enum):
    fake_paid = "fake_paid"
    unpaid    = "unpaid"
    paid      = "paid"

class PaymentMethodEnum(str, Enum):
    cash = "cash"
    upi  = "upi"

class ReservationStatusEnum(str, Enum):
    confirmed = "confirmed"
    cancelled = "cancelled"


# ── User ──────────────────────────────────────────────────────────────────

class UserBase(_Base):
    mobile_number: str = Field(..., max_length=20)
    name:          str = Field(..., max_length=120)

class UserCreate(UserBase):
    pass

class UserOut(UserBase):
    id:         uuid.UUID
    created_at: datetime
    updated_at: datetime

class UserUpdate(_Base):
    name: Optional[str] = Field(None, max_length=120)


# ── Admin ─────────────────────────────────────────────────────────────────

class AdminBase(_Base):
    username: str = Field(..., max_length=80)

class AdminCreate(AdminBase):
    password: str = Field(..., min_length=8)   # raw — hashed before storing

class AdminOut(AdminBase):
    id:         uuid.UUID
    role:       str
    is_active:  bool
    created_at: datetime


class AuditLogOut(_Base):
    id:            uuid.UUID
    actor_id:      Optional[uuid.UUID] = None
    actor_username: Optional[str] = None
    actor_role:    Optional[str] = None
    action:        str
    resource_type: Optional[str] = None
    resource_id:   Optional[str] = None
    success:       bool
    metadata:      Optional[dict[str, Any]] = None
    created_at:    datetime


class DailyReportSummaryOut(_Base):
    business_date: date
    business_timezone: str
    generated_at: datetime
    order_count: int
    order_status_counts: dict[str, int]
    order_value_all_orders: Decimal
    revenue_total: Optional[Decimal] = None
    revenue_available: bool
    reservation_count: int


class DailyReportOut(_Base):
    id: uuid.UUID
    business_date: date
    business_timezone: str
    generated_at: datetime
    report_data: dict[str, Any]


class ReportDownloadRequest(_Base):
    secret: SecretStr


# ── Staff management schemas ──────────────────────────────────────────────

class StaffCreate(_Base):
    """Body for POST /admin/staff — head admin creates a staff account."""
    username: str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=8, max_length=128)

class StaffOut(_Base):
    """Response for staff account — never exposes password_hash."""
    id:         uuid.UUID
    username:   str
    role:       str           # always 'staff'
    is_active:  bool
    created_by: Optional[uuid.UUID] = None
    created_at: datetime

class StaffUpdate(_Base):
    """Body for PATCH /admin/staff/{id} — head admin updates staff details."""
    is_active: Optional[bool] = None
    password:  Optional[str]  = Field(None, min_length=8, max_length=128)
    # Note: 'role' is intentionally absent — staff cannot be promoted to
    # head_admin via this endpoint. Role promotion is not supported.


# ── Table ─────────────────────────────────────────────────────────────────

class TableBase(_Base):
    table_number: int
    capacity:     int
    qr_secret:    str = Field(..., max_length=128)

class TableCreate(TableBase):
    pass

class TableOut(TableBase):
    id:     uuid.UUID
    status: TableStatusEnum

class TableAvailableOut(_Base):
    """Public table info returned by GET /tables/available — no qr_secret exposed."""
    id:           uuid.UUID
    table_number: int
    capacity:     int
    is_available: bool   # False if table is already booked within SLOT_WINDOW_HOURS

class TableUpdate(_Base):
    status:   Optional[TableStatusEnum] = None
    capacity: Optional[int]             = None


# ── TableSession ──────────────────────────────────────────────────────────

class TableSessionBase(_Base):
    table_id:      uuid.UUID
    session_token: str = Field(..., max_length=256)

class TableSessionCreate(TableSessionBase):
    expires_at: Optional[datetime] = None

class TableSessionOut(TableSessionBase):
    id:         uuid.UUID
    started_at: datetime
    closed_at:  Optional[datetime] = None
    expires_at: Optional[datetime] = None
    status:     SessionStatusEnum

class TableSessionUpdate(_Base):
    status:    Optional[SessionStatusEnum] = None
    closed_at: Optional[datetime]          = None
    expires_at: Optional[datetime]         = None


# ── MenuItem ──────────────────────────────────────────────────────────────

class MenuItemBase(_Base):
    name:         str              = Field(..., max_length=200)
    description:  Optional[str]   = None
    price:        Decimal          = Field(..., ge=0, decimal_places=2)
    category:     str              = Field(..., max_length=100)
    image_url:    Optional[str]    = Field(None, max_length=500)
    is_available: bool             = True

class MenuItemCreate(MenuItemBase):
    pass

class MenuItemOut(MenuItemBase):
    id: uuid.UUID

class MenuItemUpdate(_Base):
    name:         Optional[str]     = Field(None, max_length=200)
    description:  Optional[str]     = None
    price:        Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    category:     Optional[str]     = Field(None, max_length=100)
    image_url:    Optional[str]     = Field(None, max_length=500)
    is_available: Optional[bool]    = None


# ── OrderItem ─────────────────────────────────────────────────────────────

class OrderItemBase(_Base):
    menu_item_id:   uuid.UUID
    quantity:       int     = Field(..., ge=1)
    price_at_order: Decimal = Field(..., ge=0, decimal_places=2)

class OrderItemCreate(OrderItemBase):
    pass

class OrderItemOut(OrderItemBase):
    id:       uuid.UUID
    order_id: uuid.UUID


# ── Order ─────────────────────────────────────────────────────────────────

class OrderBase(_Base):
    order_type:       OrderTypeEnum
    total_price:      Decimal       = Field(..., ge=0, decimal_places=2)
    delivery_address: Optional[str] = None

class OrderCreate(OrderBase):
    session_id:  Optional[uuid.UUID]     = None
    user_id:     Optional[uuid.UUID]     = None
    order_items: list[OrderItemCreate]   = Field(default_factory=list)

class OrderOut(OrderBase):
    id:             uuid.UUID
    order_number:   str
    session_id:     Optional[uuid.UUID]  = None
    user_id:        Optional[uuid.UUID]  = None
    status:         OrderStatusEnum
    payment_status: PaymentStatusEnum
    created_at:     datetime
    updated_at:     datetime
    daily_token_number: Optional[int]    = None
    order_items:    list[OrderItemOut]   = []

class OrderUpdate(_Base):
    status:          Optional[OrderStatusEnum]   = None
    payment_status:  Optional[PaymentStatusEnum] = None
    delivery_address: Optional[str]              = None


# ── Reservation ───────────────────────────────────────────────────────────

class ReservationBase(_Base):
    user_id:          uuid.UUID
    party_size:       int      = Field(..., ge=1)
    reservation_time: datetime
    extra_chair:      bool     = False

class ReservationCreate(ReservationBase):
    table_ids: list[uuid.UUID] = Field(default_factory=list)

class ReservationOut(ReservationBase):
    id:         uuid.UUID
    status:     ReservationStatusEnum
    created_at: datetime
    updated_at: datetime
    table_ids:  list[uuid.UUID] = []   # populated from relationship in route layer

class ReservationUpdate(_Base):
    status:           Optional[ReservationStatusEnum] = None
    reservation_time: Optional[datetime]              = None
    party_size:       Optional[int]                   = Field(None, ge=1)
    extra_chair:      Optional[bool]                  = None


# ── Rating ────────────────────────────────────────────────────────────────

class RatingBase(_Base):
    order_id: uuid.UUID
    user_id:  uuid.UUID
    stars:    int            = Field(..., ge=1, le=5)
    comment:  Optional[str] = None

class RatingCreate(RatingBase):
    pass

class RatingOut(RatingBase):
    id:         uuid.UUID
    created_at: datetime


# ══════════════════════════════════════════════════════════════════════════
#  Part 4 — DeliveryZone, ReservationAddon, ReservationAddonSelection
# ══════════════════════════════════════════════════════════════════════════

from decimal import Decimal as _Decimal   # already imported above, alias avoids clash


# ── DeliveryZone ──────────────────────────────────────────────────────────

class DeliveryZoneBase(_Base):
    min_distance_km: _Decimal
    max_distance_km: _Decimal
    charge:          _Decimal = Field(..., ge=0, decimal_places=2)

class DeliveryZoneCreate(DeliveryZoneBase):
    pass

class DeliveryZoneOut(DeliveryZoneBase):
    id: uuid.UUID

class DeliveryZoneUpdate(_Base):
    min_distance_km: Optional[_Decimal] = None
    max_distance_km: Optional[_Decimal] = None
    charge:          Optional[_Decimal] = Field(None, ge=0, decimal_places=2)


# ── ReservationAddon ──────────────────────────────────────────────────────

class ReservationAddonBase(_Base):
    name:         str            = Field(..., max_length=200)
    description:  Optional[str] = None
    price:        _Decimal       = Field(..., ge=0, decimal_places=2)
    image_url:    Optional[str]  = Field(None, max_length=500)
    is_available: bool           = True

class ReservationAddonCreate(ReservationAddonBase):
    pass

class ReservationAddonOut(ReservationAddonBase):
    id: uuid.UUID

class ReservationAddonUpdate(_Base):
    name:         Optional[str]     = Field(None, max_length=200)
    description:  Optional[str]     = None
    price:        Optional[_Decimal] = Field(None, ge=0, decimal_places=2)
    image_url:    Optional[str]      = Field(None, max_length=500)
    is_available: Optional[bool]     = None


# ── ReservationAddonSelection ─────────────────────────────────────────────

class ReservationAddonSelectionBase(_Base):
    reservation_id: uuid.UUID
    addon_id:       uuid.UUID
    quantity:       int = Field(default=1, ge=1)

class ReservationAddonSelectionCreate(ReservationAddonSelectionBase):
    pass

class ReservationAddonSelectionOut(ReservationAddonSelectionBase):
    id: uuid.UUID

class ReservationAddonSelectionUpdate(_Base):
    quantity: Optional[int] = Field(None, ge=1)


# ══════════════════════════════════════════════════════════════════════════
#  Authentication schemas
# ══════════════════════════════════════════════════════════════════════════

class SignupRequest(_Base):
    """Body for POST /auth/signup."""
    mobile_number: str  = Field(..., min_length=10, max_length=15,
                                pattern=r"^\+?[0-9]{10,15}$")
    name:          str  = Field(..., min_length=1, max_length=120)
    password:      str  = Field(..., min_length=6, max_length=128)


class LoginRequest(_Base):
    """Body for POST /auth/login."""
    mobile_number: str = Field(..., min_length=10, max_length=15)
    password:      str = Field(..., min_length=1, max_length=128)


class TokenOut(_Base):
    """Response returned after successful signup or login."""
    access_token: str
    token_type:   str = "bearer"
    user_id:      uuid.UUID
    name:         str
    mobile_number: str


# ── Reservation — richer output and creation schemas ──────────────────────

class AddonSelectionIn(_Base):
    """What the client sends when selecting an addon — no price, no reservation_id."""
    addon_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=20)


class AddonSelectionDetail(_Base):
    """Embedded in ReservationDetail — shows addon name + price snapshot."""
    id:         uuid.UUID
    addon_id:   uuid.UUID
    addon_name: str
    quantity:   int
    unit_price: _Decimal
    line_total: _Decimal


class ReservationCreateRequest(_Base):
    """Full body for POST /reservations."""
    party_size:       int             = Field(..., ge=1, le=50)
    reservation_time: datetime
    table_ids:        list[uuid.UUID] = Field(..., min_length=1)
    extra_chair:      bool            = False
    addons:           list[AddonSelectionIn] = Field(default_factory=list)
    # Optional gift message — stored when the Gift Message add-on is selected.
    # Format: "occasion: text" or just free text. NULL/omit when not applicable.
    gift_message:     Optional[str]   = Field(None, max_length=500)


class ReservationDetail(_Base):
    """Full reservation response including tables and addon selections."""
    id:               uuid.UUID
    user_id:          uuid.UUID
    party_size:       int
    reservation_time: datetime
    status:           ReservationStatusEnum
    extra_chair:      bool
    gift_message:     Optional[str]          = None
    created_at:       datetime
    updated_at:       datetime
    table_ids:        list[uuid.UUID]        = []
    addons:           list[AddonSelectionDetail] = []
    addon_total:      _Decimal               = _Decimal("0.00")


# ── QR Session schemas ────────────────────────────────────────────────────

class QRScanResponse(_Base):
    """Returned when a customer scans a QR code."""
    session_id:     uuid.UUID
    session_token:  str
    table_id:       uuid.UUID
    table_number:   int
    capacity:       int
    status:         SessionStatusEnum      # "active"
    started_at:     datetime
    expires_at:     Optional[datetime]
    is_new_session: bool                   # True = just created, False = resumed


class TableInUseResponse(_Base):
    """
    Returned as the detail body of HTTP 409 when a QR scan finds an existing
    active session that was NOT started by the requesting scanner.

    table_in_use: True always (lets the client distinguish from other 409s).
    The session_token is deliberately OMITTED — it must not be revealed to
    an unauthorised scanner.
    """
    table_in_use:  bool = True
    table_number:  int
    message:       str


class SessionCloseRequest(_Base):
    """
    Body for PATCH /qr/session/{session_id}/close.

    The customer must supply the session_token they received at scan time.
    This proves they are the original scanner without requiring a login,
    and prevents any authenticated-but-wrong-session user from closing
    another customer's session by guessing the UUID.
    """
    session_token: str = Field(..., min_length=1)


class SessionValidateResponse(_Base):
    """Returned when validating a session token before placing an order."""
    valid:        bool
    session_id:   Optional[uuid.UUID]  = None
    table_id:     Optional[uuid.UUID]  = None
    table_number: Optional[int]        = None
    detail:       Optional[str]        = None


# ── Orders — clean request schemas (server-side price enforcement) ─────────

class OrderItemRequest(_Base):
    """What the client sends per line item — NO price field (server fetches it)."""
    menu_item_id: uuid.UUID
    quantity:     int = Field(..., ge=1, le=99)


class OrderCreateRequest(_Base):
    """
    Body for POST /orders.

    Client never supplies prices or totals — those are always fetched from
    the database at order-creation time to prevent manipulation.
    """
    order_type:       OrderTypeEnum
    items:            list[OrderItemRequest] = Field(..., min_length=1)
    # dine_in: required — must be an active session token
    session_token:    Optional[str]   = None
    # home_delivery: required
    delivery_address: Optional[str]   = None
    delivery_distance_km: Optional[float] = Field(None, ge=0)


class OrderItemDetail(_Base):
    """Embedded in OrderDetail — includes item name for display."""
    id:             uuid.UUID
    menu_item_id:   uuid.UUID
    menu_item_name: str
    quantity:       int
    price_at_order: Decimal
    line_total:     Decimal


class OrderDetail(_Base):
    """Full order response with computed totals and server-side ETA."""
    id:                 uuid.UUID
    order_number:       str
    order_type:         OrderTypeEnum
    status:             OrderStatusEnum
    payment_status:     PaymentStatusEnum
    session_id:         Optional[uuid.UUID]
    user_id:            Optional[uuid.UUID]
    delivery_address:   Optional[str]
    delivery_charge:    Optional[Decimal]
    delivery_distance_km: Optional[Decimal]         # stored at creation; null for non-delivery
    items_total:        Decimal
    total_price:        Decimal
    daily_token_number: Optional[int]
    # ETA fields — calculated server-side, never accepted from client.
    # null for dine_in and takeaway.
    estimated_delivery_minutes: Optional[int]       # integer minutes
    estimated_delivery_at:      Optional[datetime]  # created_at + ETA
    created_at:         datetime
    updated_at:         datetime
    items:              list[OrderItemDetail] = []


# ── Admin authentication schemas ──────────────────────────────────────────

class AdminLoginRequest(_Base):
    username: str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=1, max_length=128)


class AdminTokenOut(_Base):
    access_token: str
    token_type:   str = "bearer"
    admin_id:     uuid.UUID
    username:     str
    role:         str = "admin"


# ── Admin-facing list schemas ─────────────────────────────────────────────

class AdminOrderOut(_Base):
    """Admin view of an order — includes user info and items (on detail fetch)."""
    id:                 uuid.UUID
    order_number:       str
    order_type:         OrderTypeEnum
    status:             OrderStatusEnum
    payment_status:     PaymentStatusEnum
    payment_method:     Optional[str]          = None
    total_price:        Decimal
    daily_token_number: Optional[int]
    delivery_address:   Optional[str]
    delivery_distance_km: Optional[Decimal]   = None
    delivery_charge:    Optional[Decimal]     = None
    items_total:        Optional[Decimal]     = None
    user_id:            Optional[uuid.UUID]
    session_id:         Optional[uuid.UUID]
    created_at:         datetime
    updated_at:         datetime
    items:              list[OrderItemDetail] = []   # populated by GET /admin/orders/{id}


class AdminStatusUpdate(_Base):
    new_status: OrderStatusEnum


class PaymentConfirmRequest(_Base):
    """Body for PATCH /admin/orders/{order_id}/payment — staff confirms payment."""
    payment_method: PaymentMethodEnum


class RatingOut2(_Base):
    """Admin/public rating view."""
    id:         uuid.UUID
    order_id:   uuid.UUID
    user_id:    uuid.UUID
    stars:      int
    comment:    Optional[str]
    created_at: datetime


class RatingCreateRequest(_Base):
    """Customer creates a rating for their own order."""
    order_id: uuid.UUID
    stars:    int = Field(..., ge=1, le=5)
    comment:  Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════
#  Admin — new schemas added for missing endpoints (Step 2)
# ══════════════════════════════════════════════════════════════════════════

class AdminUserOut(_Base):
    """Admin view of a customer account."""
    id:            uuid.UUID
    name:          str
    mobile_number: str
    created_at:    datetime
    updated_at:    datetime


class AdminSessionOut(_Base):
    """Admin view of a table session — includes table_number for display."""
    id:            uuid.UUID
    table_id:      uuid.UUID
    table_number:  int
    session_token: str
    status:        SessionStatusEnum
    started_at:    datetime
    closed_at:     Optional[datetime] = None
    expires_at:    Optional[datetime] = None


class AdminSessionCreate(_Base):
    """Body for POST /admin/sessions — open a session on any table."""
    table_id: uuid.UUID


class DashboardStats(_Base):
    """Response for GET /admin/dashboard/stats."""
    orders_today:           int
    order_value_today:      _Decimal
    revenue_today:          Optional[_Decimal] = None
    revenue_available:      bool
    revenue_unavailable_reason: str
    active_sessions:        int
    upcoming_reservations:  int   # confirmed reservations in the next 24 hours
