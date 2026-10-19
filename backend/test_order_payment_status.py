"""
test_order_payment_status.py — Focused tests for payment_status on order creation.

Run with:  python -m pytest test_order_payment_status.py -v
or:        python -m unittest test_order_payment_status

Verifies:
  1. Newly created orders (takeaway, dine_in, home_delivery) have payment_status="unpaid".
  2. Existing historical orders with payment_status="fake_paid" remain unchanged
     after new orders are created.

Uses an isolated SQLite in-memory database — no live Supabase required.
_next_order_number and _daily_token are mocked because they rely on
PostgreSQL sequences and advisory locks that don't exist in SQLite.
"""

import os
import uuid
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

# ── Environment stubs — must be set before any app import ─────────────────
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET_KEY", "order-payment-tests-only")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

# ── SQLite compatibility shim for PostgreSQL UUID columns ─────────────────
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.ext.compiler import compiles

compiles(PgUUID, "sqlite")(lambda _t, _c, **_kw: "CHAR(36)")

# ── App imports (after env stubs + shim) ──────────────────────────────────
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    DeliveryZone,
    MenuItem,
    Order,
    Table,
    TableSession,
    User,
)
from app.routers.orders import create_order
from app.schemas import (
    OrderCreateRequest,
    OrderItemRequest,
    OrderTypeEnum,
)


# ── Helpers ───────────────────────────────────────────────────────────────

_ORDER_SEQ = [1000]


def _fake_order_number(order_type: str, db) -> str:
    """Mock _next_order_number — returns deterministic T-/TK-/D- prefixed numbers."""
    prefixes = {"dine_in": "T", "takeaway": "TK", "home_delivery": "D"}
    _ORDER_SEQ[0] += 1
    return f"{prefixes[order_type]}-{_ORDER_SEQ[0]}"


def _fake_daily_token(db) -> int:
    """Mock _daily_token — avoids pg_advisory_xact_lock (PostgreSQL-only)."""
    return 1


# ── Base test class ───────────────────────────────────────────────────────

class OrderPaymentStatusTestBase(unittest.TestCase):
    """
    Shared setUp/tearDown.

    Sets up an in-memory SQLite database, seeds one user, one menu item,
    and one historical order with payment_status='fake_paid'.
    _next_order_number and _daily_token are mocked throughout.
    """

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        self.db = Session()

        # Seed user
        self.user = User(
            id=uuid.uuid4(),
            mobile_number="+919999900000",
            name="Payment Test User",
            password_hash="not-used",
        )
        self.db.add(self.user)

        # Seed menu item
        self.menu_item = MenuItem(
            id=uuid.uuid4(),
            name="Test Tea",
            price=Decimal("4.50"),
            category="Tea",
            is_available=True,
        )
        self.db.add(self.menu_item)

        # Seed historical order with payment_status='fake_paid'
        self.historical_order = Order(
            id=uuid.uuid4(),
            order_number="T-1000",
            session_id=None,
            user_id=self.user.id,
            order_type="takeaway",
            status="delivered",
            total_price=Decimal("9.00"),
            payment_status="fake_paid",
            created_at=datetime(2025, 6, 1, 12, 0, tzinfo=timezone.utc),
        )
        self.db.add(self.historical_order)
        self.db.commit()

        # Patches that persist across the whole test
        self._patch_seq = patch(
            "app.routers.orders._next_order_number", side_effect=_fake_order_number
        )
        self._patch_token = patch(
            "app.routers.orders._daily_token", side_effect=_fake_daily_token
        )
        self._patch_seq.start()
        self._patch_token.start()

    def tearDown(self):
        self._patch_seq.stop()
        self._patch_token.stop()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _make_request(self, order_type: str, **kwargs) -> OrderCreateRequest:
        """Build an OrderCreateRequest with one menu item."""
        return OrderCreateRequest(
            order_type=OrderTypeEnum(order_type),
            items=[OrderItemRequest(menu_item_id=self.menu_item.id, quantity=1)],
            **kwargs,
        )


# ══════════════════════════════════════════════════════════════════════════
#  New orders must be 'unpaid'
# ══════════════════════════════════════════════════════════════════════════

class TestNewOrderPaymentStatus(OrderPaymentStatusTestBase):

    def test_takeaway_order_is_unpaid(self):
        """Newly created takeaway order has payment_status='unpaid'."""
        body = self._make_request("takeaway")
        result = create_order(body=body, current_user=self.user, db=self.db)

        self.assertEqual(result.payment_status, "unpaid")
        self.assertEqual(result.order_type, OrderTypeEnum.takeaway)

        # Verify it's persisted in the database
        db_order = self.db.query(Order).filter(Order.id == result.id).first()
        self.assertIsNotNone(db_order)
        self.assertEqual(db_order.payment_status, "unpaid")

    def test_dine_in_order_is_unpaid(self):
        """Newly created dine_in order has payment_status='unpaid'."""
        # Set up a table and active session for dine_in
        table = Table(
            id=uuid.uuid4(),
            table_number=42,
            capacity=4,
            status="occupied",
            qr_secret="test-qr-secret",
        )
        self.db.add(table)
        session = TableSession(
            id=uuid.uuid4(),
            table_id=table.id,
            session_token="active-session-token",
            status="active",
        )
        self.db.add(session)
        self.db.commit()

        body = self._make_request("dine_in", session_token="active-session-token")
        result = create_order(body=body, current_user=self.user, db=self.db)

        self.assertEqual(result.payment_status, "unpaid")
        self.assertEqual(result.order_type, OrderTypeEnum.dine_in)

        db_order = self.db.query(Order).filter(Order.id == result.id).first()
        self.assertIsNotNone(db_order)
        self.assertEqual(db_order.payment_status, "unpaid")

    def test_home_delivery_order_is_unpaid(self):
        """Newly created home_delivery order has payment_status='unpaid'."""
        # Set up a delivery zone
        zone = DeliveryZone(
            id=uuid.uuid4(),
            min_distance_km=Decimal("0"),
            max_distance_km=Decimal("5"),
            charge=Decimal("2.00"),
        )
        self.db.add(zone)
        self.db.commit()

        body = self._make_request(
            "home_delivery",
            delivery_address="123 Test Street",
            delivery_distance_km=3.0,
        )
        result = create_order(body=body, current_user=self.user, db=self.db)

        self.assertEqual(result.payment_status, "unpaid")
        self.assertEqual(result.order_type, OrderTypeEnum.home_delivery)

        db_order = self.db.query(Order).filter(Order.id == result.id).first()
        self.assertIsNotNone(db_order)
        self.assertEqual(db_order.payment_status, "unpaid")


# ══════════════════════════════════════════════════════════════════════════
#  Historical orders must remain 'fake_paid'
# ══════════════════════════════════════════════════════════════════════════

class TestHistoricalOrderPreservation(OrderPaymentStatusTestBase):

    def test_historical_fake_paid_order_unchanged_after_new_order(self):
        """After creating a new 'unpaid' order, the historical 'fake_paid' order
        must still have payment_status='fake_paid'."""
        # Create a new takeaway order
        body = self._make_request("takeaway")
        create_order(body=body, current_user=self.user, db=self.db)

        # Re-fetch the historical order
        self.db.expire_all()
        historical = self.db.query(Order).filter(
            Order.id == self.historical_order.id
        ).first()

        self.assertEqual(historical.payment_status, "fake_paid")
        self.assertEqual(historical.order_number, "T-1000")

    def test_multiple_new_orders_do_not_affect_historical(self):
        """Creating multiple new orders does not modify the historical order."""
        for _ in range(3):
            body = self._make_request("takeaway")
            create_order(body=body, current_user=self.user, db=self.db)

        self.db.expire_all()
        historical = self.db.query(Order).filter(
            Order.id == self.historical_order.id
        ).first()

        self.assertEqual(historical.payment_status, "fake_paid")

    def test_new_and_historical_orders_coexist(self):
        """The database can hold both 'unpaid' and 'fake_paid' orders simultaneously."""
        # Create a new order
        body = self._make_request("takeaway")
        new_result = create_order(body=body, current_user=self.user, db=self.db)

        # Query all orders grouped by payment_status
        from sqlalchemy import func
        counts = (
            self.db.query(Order.payment_status, func.count(Order.id))
            .group_by(Order.payment_status)
            .all()
        )
        status_map = {str(status): count for status, count in counts}

        self.assertEqual(status_map.get("unpaid"), 1)
        self.assertEqual(status_map.get("fake_paid"), 1)
        self.assertNotIn("paid", status_map)


if __name__ == "__main__":
    unittest.main()
