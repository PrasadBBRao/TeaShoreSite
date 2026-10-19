"""
app/audit.py — Append-only audit logging helper.

Usage in route handlers:
    from app.audit import audit

    audit(db, actor=current_admin, action="menu.create",
          resource_type="menu_item", resource_id=str(item.id),
          metadata={"name": item.name, "price": str(item.price)})

Design rules:
  - Never include passwords, password_hashes, JWTs, or tokens in metadata.
  - Metadata is a plain dict — serialised to JSON here.
  - Failures in the audit write must NEVER propagate to the caller;
    they are logged to the Python logger only.
  - actor may be None for unauthenticated / pre-auth events (login failures).
"""

import json
import logging
from typing import Any, Optional
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.models import Admin, AuditLog, User

logger = logging.getLogger(__name__)

# Sensitive key names that are stripped from metadata before storage.
_BLOCKED_KEYS = frozenset({
    "password", "password_hash", "passwd", "secret",
    "token", "access_token", "jwt", "authorization",
    "refresh_token", "session_token", "qr_secret", "hash",
})


def sanitise_metadata(data: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Remove sensitive keys recursively from metadata."""
    if not data:
        return {}

    def sanitise_value(value: Any) -> Any:
        if isinstance(value, dict):
            return sanitise_metadata(value)
        if isinstance(value, list):
            return [sanitise_value(item) for item in value]
        return value

    safe: dict[str, Any] = {}
    for key, value in data.items():
        if key.lower() in _BLOCKED_KEYS:
            continue
        safe[key] = sanitise_value(value)
    return safe


def _sanitise(data: Optional[dict[str, Any]]) -> Optional[str]:
    """Remove blocked keys and serialise to JSON string."""
    safe = sanitise_metadata(data)
    if not safe:
        return None
    try:
        return json.dumps(safe, default=str)
    except Exception:
        return None


class AuditWriteError(SQLAlchemyError):
    """Raised when an action that requires an audit record cannot be logged."""


def audit(
    db: Session,
    *,
    action: str,
    actor: Optional[Admin | User] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    success: bool = True,
    metadata: Optional[dict[str, Any]] = None,
    required: bool = False,
) -> bool:
    """
    Write one audit log row inside a savepoint so a best-effort audit failure
    does not poison the business transaction. Required records raise
    AuditWriteError so the caller can fail closed.

    Parameters
    ----------
    db            SQLAlchemy Session (already open in the request).
    action        Dot-separated event name, e.g. 'menu.create'.
    actor         Admin ORM object (may be None for pre-auth events).
    resource_type Short resource label, e.g. 'menu_item', 'order'.
    resource_id   String representation of the resource PK (UUID / int).
    success       False for denied / failed attempts.
    metadata      Extra context dict.  Sensitive keys are stripped.
    required      Raise AuditWriteError if this record cannot be persisted.
    """
    try:
        log = AuditLog(
            actor_id       = actor.id if actor else None,
            actor_username = (actor.username if isinstance(actor, Admin)
                              else actor.name if actor else None),
            actor_role     = (actor.role if isinstance(actor, Admin)
                              else "customer" if actor else None),
            action         = action,
            resource_type  = resource_type,
            resource_id    = resource_id,
            success        = success,
            metadata_json  = _sanitise(metadata),
        )
        with db.begin_nested():
            db.add(log)
            db.flush()
        return True
    except Exception as exc:
        logger.exception("audit write failed — action=%s", action)
        if required:
            raise AuditWriteError(f"Required audit write failed for {action}") from exc
        return False
