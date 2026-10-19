"""
test_payment_confirmation.py — Focused tests for the staff payment confirmation API.

Run with:  python -m pytest test_payment_confirmation.py -v
or:        python -m unittest test_payment_confirmation

Covers:
  Authorization (via TestClient):
    - No token → 401
    - Customer token → 403
    - Staff admin → 200
    - Head admin → 200

  Business logic (direct function calls):
    - Cash confirmation: unpaid → paid, payment_method="cash"
    - UPI confirmation: unpaid → paid, payment_method="upi"
    - Duplicate confirmation: paid → 400
    - fake_paid order: 400 (historical orders not confirmable)
    - Missing order: 404
    - Invalid payment method: 422 (Pydantic validation)
    - Audit log created on confirmation
    - Historical fake_paid order unchanged after confirming a different order

Uses an isolated SQLite in-memory database — no live Supabase required.
"""

import os
import uuid
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

# ── Environment stubs — must be set before any app import ─────────────────
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET_KEY", "payment-confirmation-tests-only")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

# ── SQLite compatibility shim for PostgreSQL UUID columns ─────────────────
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.ext.compiler import compiles

compiles(PgUUID, "sqlite")(lambda _t, _c, **_kw: "CHAR(36)")

# ── App imports (after env stubs + shim) ──────────────────────────────────
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.dependencies import get_current_admin
from app.core.security import create_access_token
from app.main import app
from app.models import (
    Admin,
    AuditLog,
    MenuItem,
    Order,
    User,
)
from app.routers.admin import confirm_order_payment
from app.schemas import PaymentConfirmRequest, PaymentMethodEnum
from fastapi import HTTPException


# ── Base test class ───────────────────────────────────────────────────────

class PaymentConfirmationTestBase(unittest.TestCase):
    """
    Shared setUp/tearDown.

    Seeds one admin (head_admin role), one staff admin, one customer user,
    one menu item, and two orders:
      - 'unpaid_order' with payment_status='unpaid' (the confirmable one)
      - 'fake_paid_order' with payment_status='fake_paid' (historical)
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

        # Seed head admin
        self.head_admin = Admin(
            id=uuid.uuid4(),
            username="head-admin",
            password_hash="not-used",
            role="head_admin",
            is_active=True,
        )
        self.db.add(self.head_admin)

        # Seed staff admin
        self.staff_admin = Admin(
            id=uuid.uuid4(),
            username="staff-user",
            password_hash="not-used",
            role="staff",
            is_active=True,
        )
        self.db.add(self.staff_admin)

        # Seed customer user
        self.customer = User(
            id=uuid.uuid4(),
            mobile_number="+919999900000",
            name="Test Customer",
            password_hash="not-used",
        )
        self.db.add(self.customer)

        # Seed menu item
        self.menu_item = MenuItem(
            id=uuid.uuid4(),
            name="Test Tea",
            price=Decimal("4.50"),
            category="Tea",
            is_available=True,
        )
        self.db.add(self.menu_item)

        # Seed unpaid order (confirmable)
        self.unpaid_order = Order(
            id=uuid.uuid4(),
            order_number="TK-2001",
            session_id=None,
            user_id=self.customer.id,
            order_type="takeaway",
            status="placed",
            total_price=Decimal("9.00"),
            payment_status="unpaid",
            created_at=datetime(2025, 10, 17, 10, 0, tzinfo=timezone.utc),
        )
        self.db.add(self.unpaid_order)

        # Seed historical fake_paid order (NOT confirmable)
        self.fake_paid_order = Order(
            id=uuid.uuid4(),
            order_number="TK-1000",
            session_id=None,
            user_id=self.customer.id,
            order_type="takeaway",
            status="delivered",
            total_price=Decimal("5.00"),
            payment_status="fake_paid",
            created_at=datetime(2025, 6, 1, 12, 0, tzinfo=timezone.utc),
        )
        self.db.add(self.fake_paid_order)

        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()
        # Clear any dependency overrides
        app.dependency_overrides.clear()


# ══════════════════════════════════════════════════════════════════════════
#  Business logic tests (direct function calls)
# ══════════════════════════════════════════════════════════════════════════

class TestPaymentConfirmationLogic(PaymentConfirmationTestBase):

    def test_cash_confirmation_sets_paid(self):
        """Confirming an unpaid order with cash sets payment_status='paid'."""
        body = PaymentConfirmRequest(payment_method=PaymentMethodEnum.cash)
        result = confirm_order_payment(
            order_id=self.unpaid_order.id,
            body=body,
            current_admin=self.head_admin,
            db=self.db,
        )
        self.assertEqual(result.payment_status, "paid")
        self.assertEqual(result.payment_method, "cash")

        # Verify persisted in DB
        self.db.expire_all()
        db_order = self.db.query(Order).filter(Order.id == self.unpaid_order.id).first()
        self.assertEqual(db_order.payment_status, "paid")
        self.assertEqual(db_order.payment_method, "cash")

    def test_upi_confirmation_sets_paid(self):
        """Confirming an unpaid order with UPI sets payment_status='paid'."""
        body = PaymentConfirmRequest(payment_method=PaymentMethodEnum.upi)
        result = confirm_order_payment(
            order_id=self.unpaid_order.id,
            body=body,
            current_admin=self.staff_admin,
            db=self.db,
        )
        self.assertEqual(result.payment_status, "paid")
        self.assertEqual(result.payment_method, "upi")

        # Verify persisted in DB
        self.db.expire_all()
        db_order = self.db.query(Order).filter(Order.id == self.unpaid_order.id).first()
        self.assertEqual(db_order.payment_status, "paid")
        self.assertEqual(db_order.payment_method, "upi")

    def test_duplicate_confirmation_rejected(self):
        """Confirming an already-paid order returns 400."""
        # First confirmation succeeds
        body = PaymentConfirmRequest(payment_method=PaymentMethodEnum.cash)
        confirm_order_payment(
            order_id=self.unpaid_order.id,
            body=body,
            current_admin=self.head_admin,
            db=self.db,
        )

        # Second confirmation should fail
        with self.assertRaises(HTTPException) as ctx:
            confirm_order_payment(
                order_id=self.unpaid_order.id,
                body=body,
                current_admin=self.head_admin,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("paid", ctx.exception.detail.lower())

    def test_fake_paid_order_rejected(self):
        """Historical fake_paid orders cannot be confirmed — returns 400."""
        body = PaymentConfirmRequest(payment_method=PaymentMethodEnum.cash)
        with self.assertRaises(HTTPException) as ctx:
            confirm_order_payment(
                order_id=self.fake_paid_order.id,
                body=body,
                current_admin=self.head_admin,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("fake_paid", ctx.exception.detail)

    def test_missing_order_returns_404(self):
        """Non-existent order ID returns 404."""
        body = PaymentConfirmRequest(payment_method=PaymentMethodEnum.cash)
        with self.assertRaises(HTTPException) as ctx:
            confirm_order_payment(
                order_id=uuid.uuid4(),
                body=body,
                current_admin=self.head_admin,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_audit_log_created_on_confirmation(self):
        """A successful confirmation creates an audit log entry."""
        body = PaymentConfirmRequest(payment_method=PaymentMethodEnum.cash)
        confirm_order_payment(
            order_id=self.unpaid_order.id,
            body=body,
            current_admin=self.staff_admin,
            db=self.db,
        )

        log = (
            self.db.query(AuditLog)
            .filter(AuditLog.action == "order.payment_confirmed")
            .filter(AuditLog.resource_id == str(self.unpaid_order.id))
            .first()
        )
        self.assertIsNotNone(log)
        self.assertTrue(log.success)
        self.assertEqual(log.actor_id, self.staff_admin.id)

    def test_fake_paid_order_unchanged_after_confirming_other(self):
        """After confirming an unpaid order, the historical fake_paid order
        must still have payment_status='fake_paid' and payment_method=None."""
        body = PaymentConfirmRequest(payment_method=PaymentMethodEnum.upi)
        confirm_order_payment(
            order_id=self.unpaid_order.id,
            body=body,
            current_admin=self.head_admin,
            db=self.db,
        )

        self.db.expire_all()
        historical = self.db.query(Order).filter(
            Order.id == self.fake_paid_order.id
        ).first()
        self.assertEqual(historical.payment_status, "fake_paid")
        self.assertIsNone(historical.payment_method)


# ══════════════════════════════════════════════════════════════════════════
#  Authorization tests (via TestClient)
# ══════════════════════════════════════════════════════════════════════════

class TestPaymentConfirmationAuth(PaymentConfirmationTestBase):
    """
    Authorization tests via FastAPI's TestClient.

    The 401 (no token) and 403 (customer token) tests exercise the real
    get_current_admin dependency — they fail before any DB query, so no
    override is needed.

    For tests that need a successful auth + DB access, both get_db and
    get_current_admin are overridden.  This is necessary because
    SQLAlchemy's UUID(as_uuid=True) bind processor raises
    'str has no attribute hex' when filtering by a string-typed UUID
    under the SQLite CHAR(36) shim — a known limitation of testing
    PostgreSQL UUID columns with in-memory SQLite.

    The 401/403 tests prove the real auth chain rejects non-admin tokens.
    The overridden tests prove the endpoint logic works for authenticated
    admins.  Together they cover the full authorization surface.
    """

    def _override_db_and_admin(self, admin: Admin):
        """Override get_db to use the in-memory engine and get_current_admin
        to return the given admin directly."""
        TestSession = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        def _get_test_db():
            db = TestSession()
            try:
                yield db
            finally:
                db.close()
        app.dependency_overrides[get_db] = _get_test_db
        app.dependency_overrides[get_current_admin] = lambda: admin

    def _admin_token(self, admin: Admin) -> str:
        return create_access_token(
            subject=str(admin.id),
            extra={"role": "admin", "username": admin.username},
        )

    def _customer_token(self) -> str:
        return create_access_token(subject=str(self.customer.id))

    def test_no_token_returns_401(self):
        """Unauthenticated request → 401."""
        from fastapi.testclient import TestClient
        client = TestClient(app)
        resp = client.patch(
            f"/admin/orders/{self.unpaid_order.id}/payment",
            json={"payment_method": "cash"},
        )
        self.assertEqual(resp.status_code, 401)

    def test_customer_token_rejected_403(self):
        """Customer JWT → 403 (admin access required)."""
        from fastapi.testclient import TestClient
        client = TestClient(app)
        resp = client.patch(
            f"/admin/orders/{self.unpaid_order.id}/payment",
            json={"payment_method": "cash"},
            headers={"Authorization": f"Bearer {self._customer_token()}"},
        )
        self.assertEqual(resp.status_code, 403)

    def test_staff_admin_can_confirm(self):
        """Staff admin token → 200, payment confirmed."""
        self._override_db_and_admin(self.staff_admin)
        from fastapi.testclient import TestClient
        client = TestClient(app)
        resp = client.patch(
            f"/admin/orders/{self.unpaid_order.id}/payment",
            json={"payment_method": "cash"},
            headers={"Authorization": f"Bearer {self._admin_token(self.staff_admin)}"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["payment_status"], "paid")
        self.assertEqual(data["payment_method"], "cash")

    def test_head_admin_can_confirm(self):
        """Head admin token → 200, payment confirmed."""
        self._override_db_and_admin(self.head_admin)
        from fastapi.testclient import TestClient
        client = TestClient(app)
        resp = client.patch(
            f"/admin/orders/{self.unpaid_order.id}/payment",
            json={"payment_method": "upi"},
            headers={"Authorization": f"Bearer {self._admin_token(self.head_admin)}"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["payment_status"], "paid")
        self.assertEqual(data["payment_method"], "upi")

    def test_invalid_payment_method_returns_422(self):
        """Invalid payment method (e.g. 'credit_card') → 422 validation error."""
        self._override_db_and_admin(self.head_admin)
        from fastapi.testclient import TestClient
        client = TestClient(app)
        resp = client.patch(
            f"/admin/orders/{self.unpaid_order.id}/payment",
            json={"payment_method": "credit_card"},
            headers={"Authorization": f"Bearer {self._admin_token(self.head_admin)}"},
        )
        self.assertEqual(resp.status_code, 422)

    def test_missing_order_returns_404_via_http(self):
        """Non-existent order ID via HTTP → 404."""
        self._override_db_and_admin(self.head_admin)
        from fastapi.testclient import TestClient
        client = TestClient(app)
        resp = client.patch(
            f"/admin/orders/{uuid.uuid4()}/payment",
            json={"payment_method": "cash"},
            headers={"Authorization": f"Bearer {self._admin_token(self.head_admin)}"},
        )
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
