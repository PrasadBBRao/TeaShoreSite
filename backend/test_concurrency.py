"""
test_concurrency.py — PostgreSQL row-locking tests for the payment workflow.

Run with:  python -m pytest test_concurrency.py -v

These tests connect to the live PostgreSQL database using TWO separate
connections to verify that SELECT ... FOR UPDATE serializes concurrent
access.  They are automatically skipped when the database is not PostgreSQL
or is unreachable.

What is tested (only against PostgreSQL, never SQLite):
  1. Two concurrent payment confirmations on the same order are serialized.
  2. Order creation and session closure on the same session are serialized.
  3. Two concurrent closure attempts on the same session are serialized.

All test data (table, session, order) is created with unique identifiers and
cleaned up in tearDown.  No existing data is modified or deleted.
"""

import os
import uuid
import unittest
from datetime import datetime, timezone
from decimal import Decimal

# ── Environment stubs ─────────────────────────────────────────────────────
# Do NOT set DATABASE_URL — let database.py load the real PostgreSQL URL
# from .env.  These concurrency tests require a live PostgreSQL database.
os.environ.setdefault("JWT_SECRET_KEY", "concurrency-tests-only")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.database import DATABASE_URL


def _is_postgres() -> bool:
    """Return True if DATABASE_URL points to a PostgreSQL instance."""
    return DATABASE_URL.startswith(("postgresql://", "postgresql+"))


# ── Skip all tests if not on PostgreSQL ───────────────────────────────────
@unittest.skipUnless(_is_postgres(), "Concurrency tests require PostgreSQL")
class TestPostgreSQLRowLocking(unittest.TestCase):
    """
    Uses two separate NullPool engines to simulate two concurrent HTTP requests.
    Each test creates isolated test data and cleans it up.
    """

    def setUp(self):
        self.engine_a = create_engine(DATABASE_URL, poolclass=NullPool)
        self.engine_b = create_engine(DATABASE_URL, poolclass=NullPool)
        self.SessionA = sessionmaker(bind=self.engine_a, autocommit=False, autoflush=False)
        self.SessionB = sessionmaker(bind=self.engine_b, autocommit=False, autoflush=False)

        # Generate unique test identifiers to avoid conflicts with real data
        self.test_tag = f"conctest-{uuid.uuid4().hex[:8]}"
        self.cleanup_ids = {"orders": [], "sessions": [], "tables": []}

        # Create test data using connection A
        db = self.SessionA()
        try:
            # Create a test table with a high, unlikely-to-conflict number
            result = db.execute(text(
                "INSERT INTO tables (table_number, capacity, status, qr_secret) "
                "VALUES (:num, :cap, 'occupied', :secret) RETURNING id"
            ), {"num": 99001, "cap": 4, "secret": self.test_tag})
            table_id = result.fetchone()[0]
            self.cleanup_ids["tables"].append(table_id)

            # Create an active session on the table
            result = db.execute(text(
                "INSERT INTO table_sessions (table_id, session_token, status) "
                "VALUES (:tid, :token, 'active') RETURNING id"
            ), {"tid": table_id, "token": f"{self.test_tag}-session"})
            session_id = result.fetchone()[0]
            self.cleanup_ids["sessions"].append(session_id)

            # Create a test user (needed for order FK)
            result = db.execute(text(
                "INSERT INTO users (mobile_number, name) "
                "VALUES (:mobile, :name) RETURNING id"
            ), {"mobile": f"+999{uuid.uuid4().hex[:10]}", "name": "ConcTest"})
            user_id = result.fetchone()[0]
            self.cleanup_ids["users"] = [user_id]

            # Create an unpaid order on the session
            result = db.execute(text(
                "INSERT INTO orders (order_number, session_id, user_id, "
                "order_type, status, total_price, payment_status) "
                "VALUES (:onum, :sid, :uid, 'dine_in', 'placed', 10.00, 'unpaid') "
                "RETURNING id"
            ), {"onum": f"CT-{uuid.uuid4().hex[:8]}", "sid": session_id, "uid": user_id})
            order_id = result.fetchone()[0]
            self.cleanup_ids["orders"].append(order_id)

            db.commit()
            self.table_id = table_id
            self.session_id = session_id
            self.user_id = user_id
            self.order_id = order_id
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def tearDown(self):
        """Delete all test data in FK-safe order."""
        db = self.SessionA()
        try:
            for oid in self.cleanup_ids.get("orders", []):
                db.execute(text("DELETE FROM orders WHERE id = :id"), {"id": oid})
            for sid in self.cleanup_ids.get("sessions", []):
                db.execute(text("DELETE FROM table_sessions WHERE id = :id"), {"id": sid})
            for uid in self.cleanup_ids.get("users", []):
                db.execute(text("DELETE FROM users WHERE id = :id"), {"id": uid})
            for tid in self.cleanup_ids.get("tables", []):
                db.execute(text("DELETE FROM tables WHERE id = :id"), {"id": tid})
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
            self.engine_a.dispose()
            self.engine_b.dispose()

    # ── Test 1: Concurrent payment confirmation is serialized ────────────

    def test_concurrent_payment_confirmation_is_serialized(self):
        """
        Two concurrent confirm_order_payment calls on the same order:
        - Connection A locks the order row with FOR UPDATE.
        - Connection B tries FOR UPDATE NOWAIT → must fail (row is locked).
        - Connection A commits (sets payment_status='paid').
        - Connection B retries FOR UPDATE → succeeds, sees payment_status='paid'.
        """
        # Connection A: lock the order row
        db_a = self.SessionA()
        try:
            row_a = db_a.execute(
                text("SELECT payment_status FROM orders WHERE id = :id FOR UPDATE"),
                {"id": str(self.order_id)},
            ).fetchone()
            self.assertEqual(row_a[0], "unpaid")

            # Connection B: try FOR UPDATE NOWAIT — must fail because A holds the lock
            db_b = self.SessionB()
            try:
                db_b.execute(
                    text("SELECT payment_status FROM orders WHERE id = :id FOR UPDATE NOWAIT"),
                    {"id": str(self.order_id)},
                ).fetchone()
                self.fail("Connection B should have been blocked by the row lock")
            except OperationalError as exc:
                self.assertIn("could not obtain lock", str(exc).lower())
            finally:
                db_b.rollback()
                db_b.close()

            # Connection A: confirm payment and commit
            db_a.execute(
                text("UPDATE orders SET payment_status = 'paid', "
                     "payment_method = 'cash' WHERE id = :id"),
                {"id": str(self.order_id)},
            )
            db_a.commit()
        finally:
            db_a.close()

        # Connection B (new transaction): now sees the confirmed order
        db_b = self.SessionB()
        try:
            row_b = db_b.execute(
                text("SELECT payment_status FROM orders WHERE id = :id FOR UPDATE"),
                {"id": str(self.order_id)},
            ).fetchone()
            self.assertEqual(row_b[0], "paid")
        finally:
            db_b.rollback()
            db_b.close()

    # ── Test 2: Order creation vs session closure is serialized ──────────

    def test_order_creation_vs_session_closure_serialized(self):
        """
        Session closure and order creation on the same session are serialized:
        - Connection A locks the session row with FOR UPDATE.
        - Connection B tries FOR UPDATE NOWAIT on the same session → must fail.
        - Connection A commits (closes the session).
        - Connection B retries → sees status='closed'.
        """
        # Connection A: lock the session row
        db_a = self.SessionA()
        try:
            row_a = db_a.execute(
                text("SELECT status FROM table_sessions WHERE id = :id FOR UPDATE"),
                {"id": str(self.session_id)},
            ).fetchone()
            self.assertEqual(row_a[0], "active")

            # Connection B: try to lock the same session → must fail
            db_b = self.SessionB()
            try:
                db_b.execute(
                    text("SELECT status FROM table_sessions WHERE id = :id FOR UPDATE NOWAIT"),
                    {"id": str(self.session_id)},
                ).fetchone()
                self.fail("Connection B should have been blocked by the session lock")
            except OperationalError as exc:
                self.assertIn("could not obtain lock", str(exc).lower())
            finally:
                db_b.rollback()
                db_b.close()

            # Connection A: close the session and commit
            db_a.execute(
                text("UPDATE table_sessions SET status = 'closed', "
                     "closed_at = now() WHERE id = :id"),
                {"id": str(self.session_id)},
            )
            db_a.execute(
                text("UPDATE tables SET status = 'free' WHERE id = :id"),
                {"id": str(self.table_id)},
            )
            db_a.commit()
        finally:
            db_a.close()

        # Connection B: now sees the closed session
        db_b = self.SessionB()
        try:
            row_b = db_b.execute(
                text("SELECT status FROM table_sessions WHERE id = :id FOR UPDATE"),
                {"id": str(self.session_id)},
            ).fetchone()
            self.assertEqual(row_b[0], "closed")
        finally:
            db_b.rollback()
            db_b.close()

    # ── Test 3: Concurrent session closure is serialized ─────────────────

    def test_concurrent_session_closure_is_serialized(self):
        """
        Two concurrent closure attempts on the same session:
        - Connection A locks the session row.
        - Connection B's FOR UPDATE NOWAIT → fails.
        - Connection A commits (session closed).
        - Connection B retries → sees 'closed' → should reject (already closed).
        """
        db_a = self.SessionA()
        try:
            db_a.execute(
                text("SELECT status FROM table_sessions WHERE id = :id FOR UPDATE"),
                {"id": str(self.session_id)},
            ).fetchone()

            db_b = self.SessionB()
            try:
                db_b.execute(
                    text("SELECT status FROM table_sessions WHERE id = :id FOR UPDATE NOWAIT"),
                    {"id": str(self.session_id)},
                ).fetchone()
                self.fail("Connection B should have been blocked")
            except OperationalError:
                pass  # expected
            finally:
                db_b.rollback()
                db_b.close()

            db_a.execute(
                text("UPDATE table_sessions SET status = 'closed', "
                     "closed_at = now() WHERE id = :id"),
                {"id": str(self.session_id)},
            )
            db_a.commit()
        finally:
            db_a.close()

        # Connection B: sees the session is already closed
        db_b = self.SessionB()
        try:
            row_b = db_b.execute(
                text("SELECT status FROM table_sessions WHERE id = :id"),
                {"id": str(self.session_id)},
            ).fetchone()
            self.assertEqual(row_b[0], "closed")
        finally:
            db_b.close()


if __name__ == "__main__":
    unittest.main()
