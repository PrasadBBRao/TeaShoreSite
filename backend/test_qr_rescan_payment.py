"""
test_qr_rescan_payment.py — Regression tests for the auto-close payment
safeguard in _active_session_for_table (Step 4.1).

Run with:  python -m pytest test_qr_rescan_payment.py -v
or:        python -m unittest test_qr_rescan_payment

Covers:
  Active (non-expired) session with unpaid orders:
    - Rescan returns 409, session stays active, table stays occupied.

  Active (non-expired) session with fake_paid orders:
    - Rescan returns 409, session stays active, table stays occupied.

  Expired session with unpaid orders:
    - Session is NOT auto-closed.  Rescan returns 409, session stays
      active, table stays occupied.

  Expired session with fake_paid orders:
    - Same — session NOT auto-closed, 409, table occupied.

  Expired session with all paid orders:
    - Session auto-closes normally.  New session created (existing
      behavior preserved).

  Expired session with no orders (empty):
    - Session auto-closes normally.  New session created.

Uses an isolated SQLite in-memory database — no live Supabase required.
"""

import os
import secrets
import uuid
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock

# ── Environment stubs — must be set before any app import ─────────────────
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET_KEY", "qr-rescan-tests-only")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

# ── SQLite compatibility shim for PostgreSQL UUID columns ─────────────────
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.ext.compiler import compiles

compiles(PgUUID, "sqlite")(lambda _t, _c, **_kw: "CHAR(36)")

# ── App imports (after env stubs + shim) ──────────────────────────────────
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Order, Table, TableSession, User
from app.routers.qr_sessions import scan_qr


# ── Helpers ───────────────────────────────────────────────────────────────

def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _make_table(db, table_number: int = 1, status: str = "occupied") -> Table:
    t = Table(
        id=_uuid(),
        table_number=table_number,
        capacity=4,
        status=status,
        qr_secret=secrets.token_urlsafe(16),
    )
    db.add(t)
    db.flush()
    return t


def _make_session(
    db,
    table: Table,
    *,
    status: str = "active",
    expires_at: datetime | None = None,
) -> TableSession:
    sess = TableSession(
        id=_uuid(),
        table_id=table.id,
        session_token=secrets.token_urlsafe(48),
        status=status,
        expires_at=expires_at,
    )
    db.add(sess)
    db.flush()
    return sess


def _make_user(db) -> User:
    u = User(
        id=_uuid(),
        mobile_number=f"+91{secrets.randbelow(9_000_000_000) + 1_000_000_000}",
        name="Test User",
        password_hash="hashed",
    )
    db.add(u)
    db.flush()
    return u


def _make_order(
    db,
    session: TableSession,
    user: User,
    *,
    payment_status: str = "unpaid",
    order_number: str | None = None,
) -> Order:
    o = Order(
        id=_uuid(),
        order_number=order_number or f"T-{secrets.randbelow(9000) + 1000}",
        session_id=session.id,
        user_id=user.id,
        order_type="dine_in",
        status="placed",
        total_price=Decimal("10.00"),
        payment_status=payment_status,
    )
    db.add(o)
    db.flush()
    return o


def _fake_request() -> MagicMock:
    """Build a minimal Starlette Request mock for scan_qr (no auth)."""
    req = MagicMock()
    req.headers = {}
    return req


# ── Base test class ───────────────────────────────────────────────────────

class QRRescanPaymentTestBase(unittest.TestCase):
    """Shared setUp/tearDown."""

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        self.db = Session()
        self.user = _make_user(self.db)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()


# ══════════════════════════════════════════════════════════════════════════
#  Active (non-expired) session rescans
# ══════════════════════════════════════════════════════════════════════════

class TestRescanActiveSession(QRRescanPaymentTestBase):

    def test_rescan_active_session_with_unpaid_orders(self):
        """Rescan a table with an active session that has unpaid orders → 409.
        Session stays active, table stays occupied."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)  # no expires_at → never expires
        _make_order(self.db, sess, self.user, payment_status="unpaid",
                    order_number="T-8001")
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            scan_qr(request=_fake_request(), qr_secret=table.qr_secret, db=self.db)

        self.assertEqual(ctx.exception.status_code, 409)
        self.db.refresh(sess)
        self.assertEqual(sess.status, "active")
        self.db.refresh(table)
        self.assertEqual(table.status, "occupied")

    def test_rescan_active_session_with_fake_paid_orders(self):
        """Rescan a table with an active session that has fake_paid orders → 409.
        Session stays active, table stays occupied."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        _make_order(self.db, sess, self.user, payment_status="fake_paid",
                    order_number="T-8002")
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            scan_qr(request=_fake_request(), qr_secret=table.qr_secret, db=self.db)

        self.assertEqual(ctx.exception.status_code, 409)
        self.db.refresh(sess)
        self.assertEqual(sess.status, "active")
        self.db.refresh(table)
        self.assertEqual(table.status, "occupied")


# ══════════════════════════════════════════════════════════════════════════
#  Expired session rescans — the key fix
# ══════════════════════════════════════════════════════════════════════════

class TestRescanExpiredSession(QRRescanPaymentTestBase):

    def test_expired_session_with_unpaid_not_auto_closed(self):
        """Expired session with unpaid orders must NOT be auto-closed on rescan.
        Returns 409, session stays active, table stays occupied."""
        table = _make_table(self.db)
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        sess = _make_session(self.db, table, expires_at=past)
        _make_order(self.db, sess, self.user, payment_status="unpaid",
                    order_number="T-9001")
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            scan_qr(request=_fake_request(), qr_secret=table.qr_secret, db=self.db)

        self.assertEqual(ctx.exception.status_code, 409)

        # Session must NOT have been closed
        self.db.refresh(sess)
        self.assertEqual(sess.status, "active")
        self.assertIsNone(sess.closed_at)

        # Table must NOT have been freed
        self.db.refresh(table)
        self.assertEqual(table.status, "occupied")

    def test_expired_session_with_fake_paid_not_auto_closed(self):
        """Expired session with fake_paid orders must NOT be auto-closed.
        Returns 409, session stays active, table stays occupied."""
        table = _make_table(self.db)
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        sess = _make_session(self.db, table, expires_at=past)
        _make_order(self.db, sess, self.user, payment_status="fake_paid",
                    order_number="T-9002")
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            scan_qr(request=_fake_request(), qr_secret=table.qr_secret, db=self.db)

        self.assertEqual(ctx.exception.status_code, 409)
        self.db.refresh(sess)
        self.assertEqual(sess.status, "active")
        self.assertIsNone(sess.closed_at)
        self.db.refresh(table)
        self.assertEqual(table.status, "occupied")

    def test_expired_session_with_paid_orders_auto_closes(self):
        """Expired session with all paid orders auto-closes normally.
        New session is created (existing behavior preserved)."""
        table = _make_table(self.db)
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        sess = _make_session(self.db, table, expires_at=past)
        _make_order(self.db, sess, self.user, payment_status="paid",
                    order_number="T-9003")
        self.db.commit()

        result = scan_qr(request=_fake_request(), qr_secret=table.qr_secret, db=self.db)

        # New session created
        self.assertTrue(result.is_new_session)
        self.assertIsNotNone(result.session_token)

        # Old session was closed
        self.db.refresh(sess)
        self.assertEqual(sess.status, "closed")
        self.assertIsNotNone(sess.closed_at)

    def test_expired_empty_session_auto_closes(self):
        """Expired session with no orders auto-closes normally.
        New session is created (existing behavior preserved)."""
        table = _make_table(self.db)
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        sess = _make_session(self.db, table, expires_at=past)
        self.db.commit()

        result = scan_qr(request=_fake_request(), qr_secret=table.qr_secret, db=self.db)

        self.assertTrue(result.is_new_session)

        self.db.refresh(sess)
        self.assertEqual(sess.status, "closed")
        self.assertIsNotNone(sess.closed_at)

    def test_expired_session_with_mixed_paid_and_unpaid_not_closed(self):
        """Expired session with one paid and one unpaid order → not auto-closed.
        The unpaid order blocks closure."""
        table = _make_table(self.db)
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        sess = _make_session(self.db, table, expires_at=past)
        _make_order(self.db, sess, self.user, payment_status="paid",
                    order_number="T-9101")
        _make_order(self.db, sess, self.user, payment_status="unpaid",
                    order_number="T-9102")
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            scan_qr(request=_fake_request(), qr_secret=table.qr_secret, db=self.db)

        self.assertEqual(ctx.exception.status_code, 409)
        self.db.refresh(sess)
        self.assertEqual(sess.status, "active")
        self.assertIsNone(sess.closed_at)


if __name__ == "__main__":
    unittest.main()
