"""
models.py — SQLAlchemy ORM models for Teashore.

Design decisions:
─────────────────
• All PKs are UUID generated server-side via gen_random_uuid().
• All timestamps are TIMESTAMPTZ (timezone=True) — stored in UTC.
• All price/money columns use Numeric(10,2) — never Float.
• Every FK has an explicit ON DELETE action.
• Indexes on all FK columns + high-query columns (mobile_number, qr_secret, etc.).
• order_number uses PostgreSQL sequences (one per prefix) so concurrent inserts
  can never produce duplicate numbers, even under race conditions.
• Reservations have a UNIQUE constraint on (table_id, reservation_time) in the
  join table to prevent double-booking the same table at the same time slot at
  the DB level — not just application-level.
• stars has a CHECK constraint (1 ≤ stars ≤ 5) enforced in the database.
• No drop_all(), no auto-seed, no schema mutation on normal app startup.
  Use Alembic migrations exclusively for all schema changes.
"""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Date,
    Enum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    Sequence,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base

# ── PostgreSQL Sequences for order_number ─────────────────────────────────
# One sequence per prefix — each increments independently, race-condition-safe.
seq_table_order    = Sequence("seq_order_table",    start=1001, increment=1)
seq_takeaway_order = Sequence("seq_order_takeaway", start=1001, increment=1)
seq_delivery_order = Sequence("seq_order_delivery", start=1001, increment=1)

# ── Enum types (native PostgreSQL enums) ──────────────────────────────────
TableStatus       = Enum("free",       "occupied",                            name="table_status")
SessionStatus     = Enum("active",     "closed",                              name="session_status")
OrderType         = Enum("dine_in",    "takeaway",    "home_delivery",        name="order_type")
OrderStatus       = Enum("placed",     "preparing",   "active", "delivered",  name="order_status")
PaymentStatus     = Enum("fake_paid", "unpaid", "paid",                    name="payment_status")
ReservationStatus = Enum("confirmed",  "cancelled",                           name="reservation_status")


# ── users ─────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id            = Column(UUID(as_uuid=True), primary_key=True,
                           server_default=func.gen_random_uuid(), default=uuid.uuid4)
    mobile_number = Column(String(20),  nullable=False, unique=True)
    name          = Column(String(120), nullable=False)
    # password_hash: nullable so existing rows (pre-auth) are unaffected.
    # Application layer enforces that new signups always supply a password.
    password_hash = Column(String(255), nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at    = Column(DateTime(timezone=True), server_default=func.now(),
                           onupdate=func.now(), nullable=False)

    # indexes
    __table_args__ = (
        Index("ix_users_mobile_number", "mobile_number"),
    )

    orders       = relationship("Order",       back_populates="user")
    reservations = relationship("Reservation", back_populates="user")
    ratings      = relationship("Rating",      back_populates="user")


# ── admins ────────────────────────────────────────────────────────────────

class Admin(Base):
    __tablename__ = "admins"

    id            = Column(UUID(as_uuid=True), primary_key=True,
                           server_default=func.gen_random_uuid(), default=uuid.uuid4)
    username      = Column(String(80),  nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    # Role: 'head_admin' has full access and can manage staff.
    # 'staff' has restricted access; cannot create admins or change roles.
    role          = Column(String(20),  nullable=False, server_default="head_admin")
    # Deactivated accounts are rejected at the dependency level on every request.
    is_active     = Column(Boolean,     nullable=False, server_default="true")
    # Nullable FK to self — tracks which head_admin created this account.
    created_by    = Column(UUID(as_uuid=True),
                           ForeignKey("admins.id", ondelete="SET NULL"),
                           nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_admins_username", "username"),
    )

    # Self-referential: who created this account
    created_by_admin = relationship(
        "Admin",
        remote_side="Admin.id",
        foreign_keys=[created_by],
        backref="created_staff",
    )


# ── audit_logs ────────────────────────────────────────────────────────────
# Append-only audit trail for all admin/staff actions.
# Rows are inserted by the application and never updated or deleted
# through normal application code.  The DB user could in principle
# truncate the table, but no application endpoint exposes that.

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id            = Column(UUID(as_uuid=True), primary_key=True,
                           server_default=func.gen_random_uuid(), default=uuid.uuid4)
    # Actor — who performed the action (nullable for failed/anonymous attempts)
    actor_id      = Column(UUID(as_uuid=True), nullable=True)
    actor_username= Column(String(80),  nullable=True)
    actor_role    = Column(String(20),  nullable=True)   # 'head_admin' | 'staff'
    # Action descriptor  e.g.  'menu.create', 'staff.deactivate', 'login.fail'
    action        = Column(String(100), nullable=False)
    # Resource that was acted upon
    resource_type = Column(String(60),  nullable=True)   # e.g. 'menu_item', 'order'
    resource_id   = Column(String(100), nullable=True)   # str(UUID) or other id
    # Outcome
    success       = Column(Boolean,     nullable=False, server_default="true")
    # Extra context — JSON, never contains passwords/tokens/hashes
    metadata_json = Column(Text,        nullable=True)
    # When
    created_at    = Column(DateTime(timezone=True),
                           server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_audit_logs_actor_id",   "actor_id"),
        Index("ix_audit_logs_action",     "action"),
        Index("ix_audit_logs_created_at", "created_at"),
        Index("ix_audit_logs_resource",   "resource_type", "resource_id"),
    )


# ── daily_report_snapshots ────────────────────────────────────────────────
# Finalized, immutable-at-the-API-level daily historical report snapshots.

class DailyReportSnapshot(Base):
    __tablename__ = "daily_report_snapshots"

    id                = Column(UUID(as_uuid=True), primary_key=True,
                               server_default=func.gen_random_uuid(), default=uuid.uuid4)
    business_date     = Column(Date, nullable=False)
    business_timezone = Column(String(64), nullable=False, server_default="UTC")
    generated_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    report_data       = Column(JSON, nullable=False)

    __table_args__ = (
        UniqueConstraint("business_date", name="uq_daily_report_business_date"),
        Index("ix_daily_report_generated_at", "generated_at"),
    )


# ── tables ────────────────────────────────────────────────────────────────

class Table(Base):
    __tablename__ = "tables"

    id           = Column(UUID(as_uuid=True), primary_key=True,
                          server_default=func.gen_random_uuid(), default=uuid.uuid4)
    table_number = Column(Integer, nullable=False, unique=True)
    capacity     = Column(Integer, nullable=False)
    status       = Column(TableStatus, nullable=False, server_default="free")
    qr_secret    = Column(String(128), nullable=False, unique=True)

    __table_args__ = (
        Index("ix_tables_qr_secret", "qr_secret"),
    )

    sessions = relationship("TableSession", back_populates="table")
    reservations = relationship(
        "Reservation",
        secondary="reservation_tables",
        back_populates="tables",
    )


# ── table_sessions ────────────────────────────────────────────────────────

class TableSession(Base):
    __tablename__ = "table_sessions"

    id            = Column(UUID(as_uuid=True), primary_key=True,
                           server_default=func.gen_random_uuid(), default=uuid.uuid4)
    # RESTRICT: cannot delete a table that has an active/historical session
    table_id      = Column(UUID(as_uuid=True),
                           ForeignKey("tables.id", ondelete="RESTRICT"),
                           nullable=False)
    session_token = Column(String(256), nullable=False, unique=True)
    started_at    = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_at     = Column(DateTime(timezone=True), nullable=True)
    # expires_at: nullable now; used in future to auto-expire sessions left open by accident
    expires_at    = Column(DateTime(timezone=True), nullable=True)
    status        = Column(SessionStatus, nullable=False, server_default="active")
    # QR Phase 1 (migration f1a2b3c4d5e6): records which authenticated user
    # created this session. NULL for anonymous scans and all pre-Phase-1 rows.
    # SET NULL: session record survives if the user is deleted.
    started_by_user_id = Column(UUID(as_uuid=True),
                                ForeignKey("users.id", ondelete="SET NULL"),
                                nullable=True)

    __table_args__ = (
        Index("ix_table_sessions_table_id",             "table_id"),
        Index("ix_table_sessions_session_token",        "session_token"),
        Index("ix_table_sessions_started_by_user_id",   "started_by_user_id"),
        # Partial unique index defined via migration SQL (not declarable here):
        # CREATE UNIQUE INDEX uq_one_active_session_per_table
        #   ON table_sessions(table_id) WHERE status = 'active'
        # SQLAlchemy does not enforce it at the ORM level; PostgreSQL does.
    )

    table            = relationship("Table", back_populates="sessions")
    orders           = relationship("Order", back_populates="session")
    started_by_user  = relationship("User",  foreign_keys=[started_by_user_id])


# ── menu_items ────────────────────────────────────────────────────────────

class MenuItem(Base):
    __tablename__ = "menu_items"

    id           = Column(UUID(as_uuid=True), primary_key=True,
                          server_default=func.gen_random_uuid(), default=uuid.uuid4)
    name         = Column(String(200), nullable=False)
    description  = Column(Text, nullable=True)
    price        = Column(Numeric(10, 2), nullable=False)
    category     = Column(String(100), nullable=False)
    image_url    = Column(String(500), nullable=True)
    is_available = Column(Boolean, nullable=False, server_default="true")

    order_items = relationship("OrderItem", back_populates="menu_item")


# ── orders ────────────────────────────────────────────────────────────────

class Order(Base):
    __tablename__ = "orders"

    id           = Column(UUID(as_uuid=True), primary_key=True,
                          server_default=func.gen_random_uuid(), default=uuid.uuid4)

    # Human-readable order number — populated by application layer using the
    # appropriate sequence (seq_order_table / seq_order_takeaway / seq_order_delivery)
    # before INSERT.  Unique per type prefix, never recalculated.
    order_number = Column(String(20), nullable=False, unique=True)

    # SET NULL: if a session is deleted (rare), the order record is preserved
    session_id   = Column(UUID(as_uuid=True),
                          ForeignKey("table_sessions.id", ondelete="SET NULL"),
                          nullable=True)
    # RESTRICT: a user with order history cannot be deleted — preserves audit trail
    user_id      = Column(UUID(as_uuid=True),
                          ForeignKey("users.id", ondelete="RESTRICT"),
                          nullable=True)

    order_type       = Column(OrderType,    nullable=False)
    status           = Column(OrderStatus,  nullable=False, server_default="placed")
    total_price      = Column(Numeric(10, 2), nullable=False)
    payment_status   = Column(PaymentStatus, nullable=False, server_default="unpaid")
    # payment_method: set when staff confirms payment (cash or upi).
    # NULL for unpaid orders and all historical fake_paid orders — those were
    # never confirmed through the payment-confirmation flow.
    payment_method   = Column(String(20), nullable=True)
    delivery_address = Column(Text, nullable=True)   # required when order_type = home_delivery
    # Delivery distance stored at order-creation time for ETA calculation.
    # NULL for dine_in and takeaway.
    delivery_distance_km = Column(Numeric(5, 2), nullable=True)
    # Customer-facing pickup token for takeaway/counter-QR orders only (e.g. "Order #7").
    # NULL for dine_in and home_delivery.  Calculated at order-creation time as:
    #   COUNT(today's takeaway orders so far) + 1  — no scheduled reset needed.
    daily_token_number = Column(Integer, nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at       = Column(DateTime(timezone=True), server_default=func.now(),
                              onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_orders_session_id",    "session_id"),
        Index("ix_orders_user_id",       "user_id"),
        Index("ix_orders_order_number",  "order_number"),
    )

    session     = relationship("TableSession", back_populates="orders")
    user        = relationship("User",         back_populates="orders")
    order_items = relationship("OrderItem",    back_populates="order",
                               cascade="all, delete-orphan")
    rating      = relationship("Rating",       back_populates="order", uselist=False)


# ── order_items ───────────────────────────────────────────────────────────

class OrderItem(Base):
    __tablename__ = "order_items"

    id             = Column(UUID(as_uuid=True), primary_key=True,
                            server_default=func.gen_random_uuid(), default=uuid.uuid4)
    # CASCADE: order_items are owned by the order; deleting order removes items
    order_id       = Column(UUID(as_uuid=True),
                            ForeignKey("orders.id", ondelete="CASCADE"),
                            nullable=False)
    # RESTRICT: cannot delete a menu item that has been ordered (preserves history)
    menu_item_id   = Column(UUID(as_uuid=True),
                            ForeignKey("menu_items.id", ondelete="RESTRICT"),
                            nullable=False)
    quantity       = Column(Integer, nullable=False)
    # Historical price snapshot — never recalculated; captures price at time of order
    price_at_order = Column(Numeric(10, 2), nullable=False)

    __table_args__ = (
        Index("ix_order_items_order_id",     "order_id"),
        Index("ix_order_items_menu_item_id", "menu_item_id"),
    )

    order     = relationship("Order",    back_populates="order_items")
    menu_item = relationship("MenuItem", back_populates="order_items")


# ── reservation_tables (join table) ───────────────────────────────────────

class ReservationTable(Base):
    """
    Many-to-many between Reservation and Table.

    The UNIQUE constraint on (table_id, reservation_time) prevents
    double-booking the same table at the same time slot at the DATABASE
    level, closing the race-condition window where two simultaneous inserts
    could both pass an application-level availability check.

    NOTE: reservation_time is denormalised here (copied from the parent
    reservation row) specifically to support this constraint efficiently.
    It must be kept in sync with Reservation.reservation_time.
    """
    __tablename__ = "reservation_tables"

    reservation_id   = Column(UUID(as_uuid=True),
                              ForeignKey("reservations.id", ondelete="CASCADE"),
                              primary_key=True)
    table_id         = Column(UUID(as_uuid=True),
                              ForeignKey("tables.id", ondelete="CASCADE"),
                              primary_key=True)
    # Denormalised from parent reservation to support the DB-level double-booking constraint
    reservation_time = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        # DB-level double-booking prevention:
        # same table cannot have two reservations at the same timestamp
        UniqueConstraint("table_id", "reservation_time",
                         name="uq_reservation_tables_table_time"),
        Index("ix_reservation_tables_table_id",       "table_id"),
        Index("ix_reservation_tables_reservation_id", "reservation_id"),
    )


# ── reservations ──────────────────────────────────────────────────────────

class Reservation(Base):
    __tablename__ = "reservations"

    id               = Column(UUID(as_uuid=True), primary_key=True,
                              server_default=func.gen_random_uuid(), default=uuid.uuid4)
    # RESTRICT: user with reservations cannot be deleted
    user_id          = Column(UUID(as_uuid=True),
                              ForeignKey("users.id", ondelete="RESTRICT"),
                              nullable=False)
    party_size       = Column(Integer, nullable=False)
    reservation_time = Column(DateTime(timezone=True), nullable=False)
    status           = Column(ReservationStatus, nullable=False, server_default="confirmed")
    extra_chair      = Column(Boolean, nullable=False, server_default="false")
    # Optional gift message stored when the Gift Message add-on is selected.
    # Added via migration b2c3d4e5f6a7. NULL when no gift message was provided.
    gift_message     = Column(Text, nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at       = Column(DateTime(timezone=True), server_default=func.now(),
                              onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_reservations_user_id", "user_id"),
    )

    user   = relationship("User", back_populates="reservations")
    tables = relationship(
        "Table",
        secondary="reservation_tables",
        back_populates="reservations",
    )
    addon_selections = relationship("ReservationAddonSelection", back_populates="reservation")


# ── ratings ───────────────────────────────────────────────────────────────

class Rating(Base):
    __tablename__ = "ratings"

    id         = Column(UUID(as_uuid=True), primary_key=True,
                        server_default=func.gen_random_uuid(), default=uuid.uuid4)
    # CASCADE: rating is owned by the order; deleting order removes its rating
    order_id   = Column(UUID(as_uuid=True),
                        ForeignKey("orders.id", ondelete="CASCADE"),
                        nullable=False, unique=True)   # one rating per order
    # CASCADE: deleting a user removes their ratings
    user_id    = Column(UUID(as_uuid=True),
                        ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False)
    stars      = Column(Integer, nullable=False)
    comment    = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        # Enforce 1-5 star range at the database level
        CheckConstraint("stars >= 1 AND stars <= 5", name="ck_ratings_stars_range"),
        Index("ix_ratings_order_id", "order_id"),
        Index("ix_ratings_user_id",  "user_id"),
    )

    order = relationship("Order", back_populates="rating")
    user  = relationship("User",  back_populates="ratings")


# ══════════════════════════════════════════════════════════════════════════════
#  Part 4 additions — added via migration add_delivery_zones_addons_daily_token
# ══════════════════════════════════════════════════════════════════════════════

# ── delivery_zones ────────────────────────────────────────────────────────────
# Defines the delivery charge bands by distance.
# Distances beyond max_distance_km of the last band are not deliverable
# (enforced in application logic, no DB row needed).
# Seed data inserted via seed.py — NEVER auto-seeded at startup.

class DeliveryZone(Base):
    __tablename__ = "delivery_zones"

    id               = Column(UUID(as_uuid=True), primary_key=True,
                              server_default=func.gen_random_uuid(), default=uuid.uuid4)
    min_distance_km  = Column(Numeric, nullable=False)
    max_distance_km  = Column(Numeric, nullable=False)
    charge           = Column(Numeric(10, 2), nullable=False)


# ── reservation_addons ────────────────────────────────────────────────────────
# Catalogue of optional add-ons available during reservation/order.
# Seed data inserted via seed.py — NEVER auto-seeded at startup.
# Application layer filters visible addons by order type:
#   - home_delivery / takeaway / counter-QR: Flowers Bouquet, Chocolates, Gift Message
#   - reservations:                          all addons including Balloon Decoration, Bento Cake

class ReservationAddon(Base):
    __tablename__ = "reservation_addons"

    id           = Column(UUID(as_uuid=True), primary_key=True,
                          server_default=func.gen_random_uuid(), default=uuid.uuid4)
    name         = Column(String(200), nullable=False)
    description  = Column(Text, nullable=True)
    price        = Column(Numeric(10, 2), nullable=False)
    image_url    = Column(String(500), nullable=True)
    is_available = Column(Boolean, nullable=False, server_default="true")

    selections = relationship("ReservationAddonSelection", back_populates="addon")


# ── reservation_addon_selections ──────────────────────────────────────────────
# Records which addons (and how many) a customer selected for a reservation.
# CASCADE on reservation_id: deleting a reservation removes its selections.
# RESTRICT on addon_id: cannot delete an addon that has been selected.

class ReservationAddonSelection(Base):
    __tablename__ = "reservation_addon_selections"

    id             = Column(UUID(as_uuid=True), primary_key=True,
                            server_default=func.gen_random_uuid(), default=uuid.uuid4)
    reservation_id = Column(UUID(as_uuid=True),
                            ForeignKey("reservations.id", ondelete="CASCADE"),
                            nullable=False)
    addon_id       = Column(UUID(as_uuid=True),
                            ForeignKey("reservation_addons.id", ondelete="RESTRICT"),
                            nullable=False)
    quantity       = Column(Integer, nullable=False, server_default="1")

    __table_args__ = (
        Index("ix_reservation_addon_selections_reservation_id", "reservation_id"),
    )

    reservation = relationship("Reservation", back_populates="addon_selections")
    addon       = relationship("ReservationAddon", back_populates="selections")
