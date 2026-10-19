"""
test_session_closure_payment.py — Focused tests for the session-closure
payment safeguard (Step 4).

Run with:  python -m pytest test_session_closure_payment.py -v
or:        python -m unittest test_session_closure_payment

Covers both closure paths:
  Customer: PATCH /qr/session/{session_id}/close  (close_session)
  Admin:    PATCH /admin/sessions/{session_id}/close (admin_close_session)

Tests:
  - Unpaid order blocks closure (409) — both paths
  - Table stays occupied when closure is rejected
  - Successful closure after all orders are paid
  - Empty session closes normally
  - Historical fake_paid order blocks closure with staff-review message
  - Session status remains active when rejected

Uses an isolated SQLite in-memory database — no live Supabase required.
"""

import os
import secrets
import uuid
import unittest
from datetime import datetime, timezone
from decimal import Decimal

# ── Environment stubs — must be set before any app import ─────────────────
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET_KEY", "session-closure-tests-only")
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
from app.models import Admin, Order, Table, TableSession, User
from app.routers.qr_sessions import close_session
from app.routers.admin import admin_close_session
from app.schemas import SessionCloseRequest


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


def _make_session(db, table: Table, status: str = "active") -> TableSession:
    sess = TableSession(
        id=_uuid(),
        table_id=table.id,
        session_token=secrets.token_urlsafe(48),
        status=status,
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


def _make_admin(db, role: str = "head_admin") -> Admin:
    a = Admin(
        id=_uuid(),
        username=f"admin-{secrets.token_hex(4)}",
        password_hash="hashed",
        role=role,
        is_active=True,
    )
    db.add(a)
    db.flush()
    return a


# ── Base test class ───────────────────────────────────────────────────────

class SessionClosurePaymentTestBase(unittest.TestCase):
    """Shared setUp/tearDown for session-closure payment tests."""

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
        self.admin = _make_admin(self.db)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()


# ══════════════════════════════════════════════════════════════════════════
#  Customer closure: PATCH /qr/session/{session_id}/close
# ══════════════════════════════════════════════════════════════════════════

class TestCustomerClosurePaymentGuard(SessionClosurePaymentTestBase):

    def test_unpaid_order_blocks_closure(self):
        """Session with an unpaid order cannot be closed — returns 409."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        _make_order(self.db, sess, self.user, payment_status="unpaid",
                    order_number="T-5001")
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            close_session(
                session_id=sess.id,
                body=SessionCloseRequest(session_token=sess.session_token),
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("payment is pending", ctx.exception.detail.lower())
        self.assertIn("T-5001", ctx.exception.detail)

    def test_table_stays_occupied_when_unpaid(self):
        """When closure is rejected, the table must remain occupied."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        _make_order(self.db, sess, self.user, payment_status="unpaid")
        self.db.commit()

        with self.assertRaises(HTTPException):
            close_session(
                session_id=sess.id,
                body=SessionCloseRequest(session_token=sess.session_token),
                db=self.db,
            )

        self.db.refresh(table)
        self.assertEqual(table.status, "occupied")

    def test_session_stays_active_when_unpaid(self):
        """When closure is rejected, the session must remain active."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        _make_order(self.db, sess, self.user, payment_status="unpaid")
        self.db.commit()

        with self.assertRaises(HTTPException):
            close_session(
                session_id=sess.id,
                body=SessionCloseRequest(session_token=sess.session_token),
                db=self.db,
            )

        self.db.refresh(sess)
        self.assertEqual(sess.status, "active")
        self.assertIsNone(sess.closed_at)

    def test_closure_succeeds_after_payment(self):
        """Session with all paid orders closes normally."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        _make_order(self.db, sess, self.user, payment_status="paid",
                    order_number="T-5002")
        self.db.commit()

        result = close_session(
            session_id=sess.id,
            body=SessionCloseRequest(session_token=sess.session_token),
            db=self.db,
        )

        self.assertEqual(result.status, "closed")
        self.assertIsNotNone(result.closed_at)

        self.db.refresh(table)
        self.assertEqual(table.status, "free")

    def test_empty_session_closes_normally(self):
        """Session with no orders can be closed."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        self.db.commit()

        result = close_session(
            session_id=sess.id,
            body=SessionCloseRequest(session_token=sess.session_token),
            db=self.db,
        )

        self.assertEqual(result.status, "closed")
        self.db.refresh(table)
        self.assertEqual(table.status, "free")

    def test_fake_paid_order_blocks_closure(self):
        """Historical fake_paid order blocks closure — staff review required."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        _make_order(self.db, sess, self.user, payment_status="fake_paid",
                    order_number="T-5003")
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            close_session(
                session_id=sess.id,
                body=SessionCloseRequest(session_token=sess.session_token),
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("staff review", ctx.exception.detail.lower())
        self.assertIn("T-5003", ctx.exception.detail)

    def test_mixed_paid_and_unpaid_blocks_closure(self):
        """Even one unpaid order among paid ones blocks closure."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        _make_order(self.db, sess, self.user, payment_status="paid",
                    order_number="T-6001")
        _make_order(self.db, sess, self.user, payment_status="unpaid",
                    order_number="T-6002")
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            close_session(
                session_id=sess.id,
                body=SessionCloseRequest(session_token=sess.session_token),
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("T-6002", ctx.exception.detail)


# ══════════════════════════════════════════════════════════════════════════
#  Admin closure: PATCH /admin/sessions/{session_id}/close
# ══════════════════════════════════════════════════════════════════════════

class TestAdminClosurePaymentGuard(SessionClosurePaymentTestBase):

    def test_unpaid_order_blocks_admin_closure(self):
        """Admin cannot force-close a session with unpaid orders — returns 409."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        _make_order(self.db, sess, self.user, payment_status="unpaid",
                    order_number="T-7001")
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            admin_close_session(
                session_id=sess.id,
                current_admin=self.admin,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("payment is pending", ctx.exception.detail.lower())

    def test_table_stays_occupied_when_admin_rejected(self):
        """Table stays occupied when admin closure is rejected."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        _make_order(self.db, sess, self.user, payment_status="unpaid")
        self.db.commit()

        with self.assertRaises(HTTPException):
            admin_close_session(
                session_id=sess.id,
                current_admin=self.admin,
                db=self.db,
            )

        self.db.refresh(table)
        self.assertEqual(table.status, "occupied")

    def test_admin_closure_succeeds_after_payment(self):
        """Admin can close a session when all orders are paid."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        _make_order(self.db, sess, self.user, payment_status="paid")
        self.db.commit()

        result = admin_close_session(
            session_id=sess.id,
            current_admin=self.admin,
            db=self.db,
        )

        self.assertEqual(result.status, "closed")
        self.db.refresh(table)
        self.assertEqual(table.status, "free")

    def test_admin_empty_session_closes(self):
        """Admin can close a session with no orders."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        self.db.commit()

        result = admin_close_session(
            session_id=sess.id,
            current_admin=self.admin,
            db=self.db,
        )

        self.assertEqual(result.status, "closed")
        self.db.refresh(table)
        self.assertEqual(table.status, "free")

    def test_admin_fake_paid_blocks_closure(self):
        """Admin closure blocked by fake_paid orders — staff review required."""
        table = _make_table(self.db)
        sess = _make_session(self.db, table)
        _make_order(self.db, sess, self.user, payment_status="fake_paid",
                    order_number="T-7002")
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            admin_close_session(
                session_id=sess.id,
                current_admin=self.admin,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("staff review", ctx.exception.detail.lower())


if __name__ == "__main__":
    unittest.main()
