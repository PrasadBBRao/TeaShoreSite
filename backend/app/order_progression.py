"""Development-only automatic order status progression."""

import logging
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.database import SessionLocal
from app.models import Order

logger = logging.getLogger(__name__)

PLACED_DELAY = timedelta(seconds=20)
PREPARING_DELAY = timedelta(seconds=50)
ACTIVE_DELAY = timedelta(seconds=80)


def advance_order_statuses(db, now: datetime | None = None) -> int:
    """Persist every status that is due based on the order creation time."""
    now = now or datetime.now(timezone.utc)
    changed = 0

    transitions = (
        ("placed", "preparing", now - PLACED_DELAY),
        ("preparing", "active", now - PREPARING_DELAY),
        ("active", "delivered", now - ACTIVE_DELAY),
    )

    for current, next_status, cutoff in transitions:
        result = db.execute(
            update(Order)
            .where(Order.status == current, Order.created_at <= cutoff)
            .values(status=next_status, updated_at=now)
        )
        changed += result.rowcount or 0

    if changed:
        db.commit()
    return changed


def run_order_progression_worker(stop_event: threading.Event) -> None:
    """Poll the database once per second until the application shuts down."""
    while not stop_event.is_set():
        db = SessionLocal()
        try:
            advance_order_statuses(db)
        except Exception:
            db.rollback()
            logger.exception("Automatic order status progression failed")
        finally:
            db.close()
        stop_event.wait(1)