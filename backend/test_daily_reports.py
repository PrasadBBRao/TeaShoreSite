"""Isolated daily-report tests; run with python -m unittest test_daily_reports."""

import os
import uuid
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET_KEY", "daily-report-tests-only")

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

compiles(PostgreSQLUUID, "sqlite")(
    lambda _type, _compiler, **_kwargs: "CHAR(36)"
)

from app.database import Base
from app.dependencies import get_head_admin
from app.core.security import hash_password
from app.main import app
from app.models import (
    Admin,
    AuditLog,
    DailyReportSnapshot,
    MenuItem,
    Order,
    OrderItem,
    Reservation,
    ReservationAddon,
    ReservationAddonSelection,
    User,
)
from app.routers.admin import admin_dashboard_stats
from app.daily_reports import (
    BUSINESS_TIMEZONE,
    BusinessDateNotComplete,
    DailyReportAlreadyFinalized,
    business_day_bounds,
    finalize_daily_report,
)
from app.routers.reports import (
    download_daily_report,
    finalize_daily_report_endpoint,
    get_daily_report,
    list_daily_reports,
)
from app.schemas import ReportDownloadRequest


class DailyReportTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        self.head_admin = Admin(
            id=uuid.uuid4(),
            username="report-head",
            password_hash="not-used",
            role="head_admin",
            is_active=True,
        )
        self.staff = Admin(
            id=uuid.uuid4(),
            username="report-staff",
            password_hash="not-used",
            role="staff",
            is_active=True,
        )
        self.session.add_all([self.head_admin, self.staff])
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def seed_report_data(self):
        report_date = date(2025, 1, 10)
        user = User(id=uuid.uuid4(), name="Private Customer", mobile_number="5550100")
        tea = MenuItem(
            id=uuid.uuid4(), name="Milk Tea", price=Decimal("4.00"), category="Tea"
        )
        pastry = MenuItem(
            id=uuid.uuid4(), name="Pastry", price=Decimal("5.00"), category="Food"
        )
        addon = ReservationAddon(
            id=uuid.uuid4(), name="Cake", price=Decimal("20.00"), is_available=True
        )
        first_order = Order(
            id=uuid.uuid4(), order_number="R-T-1", order_type="takeaway",
            status="placed", total_price=Decimal("8.00"), payment_status="fake_paid",
            created_at=datetime(2025, 1, 10, 0, 10, tzinfo=timezone.utc),
        )
        second_order = Order(
            id=uuid.uuid4(), order_number="R-T-2", order_type="takeaway",
            status="delivered", total_price=Decimal("5.00"), payment_status="fake_paid",
            created_at=datetime(2025, 1, 10, 23, 50, tzinfo=timezone.utc),
        )
        next_day_order = Order(
            id=uuid.uuid4(), order_number="R-T-3", order_type="takeaway",
            status="placed", total_price=Decimal("100.00"), payment_status="fake_paid",
            created_at=datetime(2025, 1, 11, 0, 0, tzinfo=timezone.utc),
        )
        confirmed = Reservation(
            id=uuid.uuid4(), user_id=user.id, party_size=2,
            reservation_time=datetime(2025, 1, 10, 18, tzinfo=timezone.utc),
            status="confirmed", extra_chair=False,
            created_at=datetime(2025, 1, 9, 12, tzinfo=timezone.utc),
        )
        cancelled = Reservation(
            id=uuid.uuid4(), user_id=user.id, party_size=4,
            reservation_time=datetime(2025, 1, 10, 19, tzinfo=timezone.utc),
            status="cancelled", extra_chair=False,
            created_at=datetime(2025, 1, 10, 12, tzinfo=timezone.utc),
        )
        self.session.add_all([
            user, tea, pastry, addon, first_order, second_order, next_day_order,
            confirmed, cancelled,
        ])
        self.session.flush()
        self.session.add_all([
            OrderItem(
                id=uuid.uuid4(), order_id=first_order.id, menu_item_id=tea.id,
                quantity=2, price_at_order=Decimal("4.00"),
            ),
            OrderItem(
                id=uuid.uuid4(), order_id=second_order.id, menu_item_id=pastry.id,
                quantity=1, price_at_order=Decimal("5.00"),
            ),
            OrderItem(
                id=uuid.uuid4(), order_id=next_day_order.id, menu_item_id=tea.id,
                quantity=20, price_at_order=Decimal("5.00"),
            ),
            ReservationAddonSelection(
                id=uuid.uuid4(), reservation_id=confirmed.id,
                addon_id=addon.id, quantity=2,
            ),
            ReservationAddonSelection(
                id=uuid.uuid4(), reservation_id=cancelled.id,
                addon_id=addon.id, quantity=8,
            ),
        ])
        self.session.commit()
        return report_date

    def test_utc_bounds_and_reliable_aggregates(self):
        report_date = self.seed_report_data()
        start, end = business_day_bounds(report_date)
        self.assertEqual(BUSINESS_TIMEZONE, timezone.utc)
        self.assertEqual(start.isoformat(), "2025-01-10T00:00:00+00:00")
        self.assertEqual(end.isoformat(), "2025-01-11T00:00:00+00:00")

        snapshot = finalize_daily_report(self.session, report_date, actor=self.head_admin)
        data = snapshot.report_data
        self.assertEqual(data["orders"]["total_count"], 2)
        self.assertEqual(data["orders"]["status_counts"]["placed"], 1)
        self.assertEqual(data["orders"]["status_counts"]["delivered"], 1)
        self.assertEqual(data["orders"]["order_value_all_orders"], "13.00")
        self.assertIsNone(data["orders"]["revenue_total"])
        self.assertFalse(data["orders"]["revenue_available"])
        self.assertEqual(data["popular_menu_items"][0]["quantity_ordered"], 2)
        self.assertEqual(data["reservations"]["scheduled_count"], 2)
        self.assertEqual(data["reservations"]["created_on_business_date_count"], 1)
        self.assertEqual(data["popular_addons"][0]["quantity_selected"], 2)
        self.assertIsNone(data["reservations"]["addon_fees_total"])
        self.assertNotIn("Private Customer", str(data))

    def test_finalization_is_unique_and_audited(self):
        report_date = self.seed_report_data()
        snapshot = finalize_daily_report_endpoint(
            report_date, self.head_admin, self.session
        )
        self.assertIsNotNone(snapshot.generated_at)
        original_id = snapshot.id

        with self.assertRaises(HTTPException) as duplicate_response:
            finalize_daily_report_endpoint(report_date, self.head_admin, self.session)
        self.assertEqual(duplicate_response.exception.status_code, 409)

        self.assertEqual(
            self.session.query(DailyReportSnapshot)
            .filter_by(business_date=report_date)
            .count(),
            1,
        )
        self.assertEqual(
            self.session.query(DailyReportSnapshot)
            .filter_by(business_date=report_date)
            .one().id,
            original_id,
        )
        self.assertEqual(
            self.session.query(AuditLog).filter_by(action="report.generate").count(), 1
        )

    def test_current_and_future_dates_cannot_be_finalized(self):
        with self.assertRaises(BusinessDateNotComplete):
            finalize_daily_report(self.session, date(2999, 1, 1))

    def test_dashboard_separates_order_value_from_unverified_revenue(self):
        self.session.add(Order(
            id=uuid.uuid4(),
            order_number="DASH-QA-1",
            order_type="takeaway",
            status="placed",
            total_price=Decimal("24.50"),
            payment_status="fake_paid",
            created_at=datetime.now(timezone.utc),
        ))
        self.session.commit()

        stats = admin_dashboard_stats(self.head_admin, self.session)

        self.assertEqual(stats.orders_today, 1)
        self.assertEqual(stats.order_value_today, Decimal("24.50"))
        self.assertIsNone(stats.revenue_today)
        self.assertFalse(stats.revenue_available)

    def test_report_api_is_head_admin_only_and_audits_views(self):
        report_date = self.seed_report_data()
        finalize_daily_report(self.session, report_date, actor=self.head_admin)

        request = Request({
            "type": "http",
            "method": "GET",
            "path": "/admin/reports/daily",
            "headers": [],
            "query_string": b"",
        })
        with self.assertRaises(HTTPException) as denied:
            get_head_admin(request, current_admin=self.staff, db=self.session)
        self.assertEqual(denied.exception.status_code, 403)
        self.assertEqual(
            self.session.query(AuditLog).filter_by(action="permission.denied").count(), 1
        )

        request.scope["path"] = f"/admin/reports/daily/{report_date.isoformat()}/download"
        with self.assertRaises(HTTPException) as download_denied:
            get_head_admin(request, current_admin=self.staff, db=self.session)
        self.assertEqual(download_denied.exception.status_code, 403)
        self.assertEqual(
            self.session.query(AuditLog).filter_by(action="permission.denied").count(), 2
        )

        listing = list_daily_reports(50, 0, self.head_admin, self.session)
        detail = get_daily_report(report_date, self.head_admin, self.session)
        self.assertEqual(listing[0].business_date, report_date)
        self.assertEqual(detail.report_data["orders"]["total_count"], 2)
        self.assertEqual(self.session.query(AuditLog).filter_by(action="report.view").count(), 2)

    def test_report_routes_are_registered(self):
        paths = app.openapi()["paths"]
        self.assertIn("/admin/reports/daily", paths)
        self.assertIn("/admin/reports/daily/{business_date}", paths)
        self.assertIn("/admin/reports/daily/{business_date}/finalize", paths)
        self.assertIn("/admin/reports/daily/{business_date}/download", paths)

    def test_pdf_download_uses_saved_snapshot_and_audits_success(self):
        report_date = self.seed_report_data()
        finalize_daily_report(self.session, report_date, actor=self.head_admin)
        secret_hash = hash_password("correct-secret-value")
        with patch.dict(os.environ, {"REPORT_DOWNLOAD_SECRET_HASH": secret_hash}):
            response = download_daily_report(
                report_date,
                ReportDownloadRequest(secret="correct-secret-value"),
                self.head_admin,
                self.session,
            )

        self.assertEqual(response.media_type, "application/pdf")
        self.assertTrue(response.body.startswith(b"%PDF-"))
        self.assertEqual(
            response.headers["content-disposition"],
            'attachment; filename="daily-report-2025-01-10.pdf"',
        )
        self.assertEqual(
            self.session.query(AuditLog).filter_by(action="report.download.success").count(), 1
        )
        audit_row = self.session.query(AuditLog).filter_by(action="report.download.success").one()
        self.assertNotIn("correct-secret-value", audit_row.metadata_json or "")
        self.assertNotIn(secret_hash, audit_row.metadata_json or "")

    def test_incorrect_secret_is_audited_without_secret_material(self):
        report_date = self.seed_report_data()
        secret_hash = hash_password("correct-secret-value")
        with patch.dict(os.environ, {"REPORT_DOWNLOAD_SECRET_HASH": secret_hash}):
            with self.assertRaises(HTTPException) as denied:
                download_daily_report(
                    report_date,
                    ReportDownloadRequest(secret="wrong-secret-value"),
                    self.head_admin,
                    self.session,
                )

        self.assertEqual(denied.exception.status_code, 401)
        audit_row = self.session.query(AuditLog).filter_by(
            action="report.download.secret_failed"
        ).one()
        self.assertFalse(audit_row.success)
        self.assertNotIn("wrong-secret-value", audit_row.metadata_json or "")
        self.assertNotIn(secret_hash, audit_row.metadata_json or "")

    def test_repeated_incorrect_secrets_are_rate_limited(self):
        report_date = self.seed_report_data()
        with patch.dict(os.environ, {"REPORT_DOWNLOAD_SECRET_HASH": "test-hash"}), \
             patch("app.routers.reports.verify_password", return_value=False):
            for _ in range(5):
                with self.assertRaises(HTTPException) as denied:
                    download_daily_report(
                        report_date,
                        ReportDownloadRequest(secret="wrong-secret-value"),
                        self.head_admin,
                        self.session,
                    )
                self.assertEqual(denied.exception.status_code, 401)

            with self.assertRaises(HTTPException) as limited:
                download_daily_report(
                    report_date,
                    ReportDownloadRequest(secret="another-guess"),
                    self.head_admin,
                    self.session,
                )

        self.assertEqual(limited.exception.status_code, 429)
        self.assertEqual(
            self.session.query(AuditLog)
            .filter_by(action="report.download.secret_failed")
            .count(),
            5,
        )
        self.assertEqual(
            self.session.query(AuditLog)
            .filter_by(action="report.download.rate_limited")
            .count(),
            1,
        )

    def test_download_requires_a_finalized_snapshot(self):
        report_date = date(2025, 1, 10)
        with patch.dict(os.environ, {"REPORT_DOWNLOAD_SECRET_HASH": "test-hash"}), \
             patch("app.routers.reports.verify_password", return_value=True):
            with self.assertRaises(HTTPException) as missing:
                download_daily_report(
                    report_date,
                    ReportDownloadRequest(secret="correct-secret"),
                    self.head_admin,
                    self.session,
                )

        self.assertEqual(missing.exception.status_code, 404)
        self.assertEqual(
            self.session.query(AuditLog)
            .filter_by(action="report.download.not_found")
            .count(),
            1,
        )

    def test_downloads_are_disabled_without_server_hash(self):
        report_date = date(2025, 1, 10)
        with patch.dict(os.environ, {"REPORT_DOWNLOAD_SECRET_HASH": ""}):
            with self.assertRaises(HTTPException) as disabled:
                download_daily_report(
                    report_date,
                    ReportDownloadRequest(secret="submitted-secret"),
                    self.head_admin,
                    self.session,
                )

        self.assertEqual(disabled.exception.status_code, 503)
        self.assertIn("disabled", disabled.exception.detail.lower())
        self.assertEqual(
            self.session.query(AuditLog)
            .filter(AuditLog.action.like("report.download.%"))
            .count(),
            0,
        )


if __name__ == "__main__":
    unittest.main()