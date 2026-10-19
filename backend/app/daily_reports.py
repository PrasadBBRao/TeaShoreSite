"""Build and finalize immutable daily report snapshots."""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.audit import audit
from app.models import (
    Admin,
    DailyReportSnapshot,
    MenuItem,
    Order,
    OrderItem,
    Reservation,
    ReservationAddon,
    ReservationAddonSelection,
)

BUSINESS_TIMEZONE = timezone.utc
BUSINESS_TIMEZONE_NAME = "UTC"


class DailyReportAlreadyFinalized(Exception):
    """Raised when a snapshot already exists for the requested business date."""


class BusinessDateNotComplete(Exception):
    """Raised when a snapshot is requested for the current or a future date."""


def business_day_bounds(business_date: date) -> tuple[datetime, datetime]:
    start = datetime.combine(business_date, time.min, tzinfo=BUSINESS_TIMEZONE)
    return start, start + timedelta(days=1)


def business_today() -> date:
    return datetime.now(BUSINESS_TIMEZONE).date()


def _money_text(value: Decimal | int | None) -> str:
    amount = Decimal(value or 0).quantize(Decimal("0.01"))
    return format(amount, "f")


def _is_business_date_conflict(exc: IntegrityError) -> bool:
    diagnostic = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
    if diagnostic is not None:
        return diagnostic == "uq_daily_report_business_date"
    return "daily_report_snapshots.business_date" in str(exc.orig)


def build_daily_report_data(db: Session, business_date: date) -> dict[str, Any]:
    """Aggregate operational rows without exposing customer-identifying data."""
    start, end = business_day_bounds(business_date)

    order_rows = (
        db.query(
            Order.status,
            func.count(Order.id),
            func.coalesce(func.sum(Order.total_price), 0),
        )
        .filter(Order.created_at >= start, Order.created_at < end)
        .group_by(Order.status)
        .all()
    )
    order_status_counts = {state: 0 for state in Order.status.type.enums}
    total_orders = 0
    order_value_total = Decimal("0.00")
    for status_value, count, value in order_rows:
        order_status_counts[str(status_value)] = int(count)
        total_orders += int(count)
        order_value_total += Decimal(value or 0)

    payment_rows = (
        db.query(Order.payment_status, func.count(Order.id))
        .filter(Order.created_at >= start, Order.created_at < end)
        .group_by(Order.payment_status)
        .all()
    )
    payment_status_counts = {state: 0 for state in Order.payment_status.type.enums}
    for payment_status, count in payment_rows:
        payment_status_counts[str(payment_status)] = int(count)

    popular_items = (
        db.query(
            OrderItem.menu_item_id,
            MenuItem.name,
            func.sum(OrderItem.quantity),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .join(MenuItem, MenuItem.id == OrderItem.menu_item_id)
        .filter(Order.created_at >= start, Order.created_at < end)
        .group_by(OrderItem.menu_item_id, MenuItem.name)
        .order_by(func.sum(OrderItem.quantity).desc(), MenuItem.name.asc())
        .limit(10)
        .all()
    )

    reservation_status_rows = (
        db.query(Reservation.status, func.count(Reservation.id))
        .filter(Reservation.reservation_time >= start, Reservation.reservation_time < end)
        .group_by(Reservation.status)
        .all()
    )
    reservation_status_counts = {state: 0 for state in Reservation.status.type.enums}
    for reservation_status, count in reservation_status_rows:
        reservation_status_counts[str(reservation_status)] = int(count)
    scheduled_reservations = sum(reservation_status_counts.values())

    reservations_created = (
        db.query(func.count(Reservation.id))
        .filter(Reservation.created_at >= start, Reservation.created_at < end)
        .scalar()
    ) or 0

    popular_addons = (
        db.query(
            ReservationAddonSelection.addon_id,
            ReservationAddon.name,
            func.sum(ReservationAddonSelection.quantity),
        )
        .join(Reservation, Reservation.id == ReservationAddonSelection.reservation_id)
        .join(ReservationAddon, ReservationAddon.id == ReservationAddonSelection.addon_id)
        .filter(
            Reservation.reservation_time >= start,
            Reservation.reservation_time < end,
            Reservation.status == "confirmed",
        )
        .group_by(ReservationAddonSelection.addon_id, ReservationAddon.name)
        .order_by(func.sum(ReservationAddonSelection.quantity).desc(), ReservationAddon.name.asc())
        .limit(10)
        .all()
    )

    return {
        "business_date": business_date.isoformat(),
        "business_timezone": BUSINESS_TIMEZONE_NAME,
        "orders": {
            "total_count": total_orders,
            "status_counts": order_status_counts,
            "payment_status_counts": payment_status_counts,
            "order_value_all_orders": _money_text(order_value_total),
            "revenue_total": None,
            "revenue_available": False,
            "revenue_unavailable_reason": (
                "The payment model only records fake_paid and has no verified settlement ledger."
            ),
        },
        "popular_menu_items": [
            {
                "menu_item_id": str(item_id),
                "name_at_finalization": name,
                "quantity_ordered": int(quantity or 0),
            }
            for item_id, name, quantity in popular_items
        ],
        "reservations": {
            "scheduled_count": scheduled_reservations,
            "created_on_business_date_count": int(reservations_created),
            "status_counts": reservation_status_counts,
            "addon_fees_total": None,
            "addon_fees_available": False,
            "addon_fees_unavailable_reason": (
                "Reservation add-on selections do not preserve their purchase-time prices."
            ),
        },
        "popular_addons": [
            {
                "addon_id": str(addon_id),
                "name_at_finalization": name,
                "quantity_selected": int(quantity or 0),
            }
            for addon_id, name, quantity in popular_addons
        ],
    }


def finalize_daily_report(
    db: Session,
    business_date: date,
    *,
    actor: Admin | None = None,
) -> DailyReportSnapshot:
    """Create one finalized snapshot; safe to call from an API or scheduler."""
    if business_date >= business_today():
        raise BusinessDateNotComplete(business_date.isoformat())

    existing = (
        db.query(DailyReportSnapshot)
        .filter(DailyReportSnapshot.business_date == business_date)
        .first()
    )
    if existing is not None:
        raise DailyReportAlreadyFinalized(business_date.isoformat())

    snapshot = DailyReportSnapshot(
        business_date=business_date,
        business_timezone=BUSINESS_TIMEZONE_NAME,
        report_data=build_daily_report_data(db, business_date),
    )
    try:
        db.add(snapshot)
        db.flush()
        audit(
            db,
            actor=actor,
            action="report.generate",
            resource_type="daily_report",
            resource_id=business_date.isoformat(),
            metadata={
                "orders_count": snapshot.report_data["orders"]["total_count"],
                "reservations_count": snapshot.report_data["reservations"]["scheduled_count"],
                "business_timezone": BUSINESS_TIMEZONE_NAME,
            },
            required=True,
        )
        db.commit()
        db.refresh(snapshot)
        return snapshot
    except IntegrityError as exc:
        db.rollback()
        if _is_business_date_conflict(exc):
            raise DailyReportAlreadyFinalized(business_date.isoformat()) from exc
        raise
    except SQLAlchemyError:
        db.rollback()
        raise