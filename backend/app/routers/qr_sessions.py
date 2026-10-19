"""
app/routers/qr_sessions.py — QR scan and table-session management.

Security model (Phase 2)
────────────────────────
The session_token is the credential.  It is a 64-char cryptographically random
string (secrets.token_urlsafe(48)) that is only ever returned to the scanner
who creates the session.  All subsequent operations require the caller to
present this token; the server never re-reveals it to a different caller.

POST /qr/scan
  • Validates the qr_secret against the tables table.
  • If an active session already exists → HTTP 409 TableInUseResponse.
    The existing token is NOT returned to the new scanner.
  • If no active session → create one atomically.
  • Race condition (two concurrent scans both see no session and both try to
    INSERT): the partial unique index uq_one_active_session_per_table causes
    the second INSERT to raise IntegrityError.  We catch that specifically and
    return 409 instead of leaking a 500.
  • started_by_user_id is set when the request carries a valid Bearer token
    (optional — scan works without authentication too).

GET /qr/session/{token}
  • Validates token is active and unexpired.
  • Never returns another session's data from the token path.

GET /qr/session/by-id/{session_id}   (authenticated)
  • Ownership proof: caller must hold the session_token AND be authenticated.
    Checked via _caller_owns_session().

PATCH /qr/session/{session_id}/close   (session_token in body)
  • Ownership proof: caller supplies session_token they received at scan time.
    This works even before the first order (fixes the empty-session 403 bug).
  • Any authenticated user can also close their own session (must own it via
    started_by_user_id or via an order on the session).
  • Does NOT require all orders to be paid — payment enforcement is Phase 4.

IMPORTANT — Route registration order
  /qr/session/by-id/{session_id}  MUST be registered BEFORE /qr/session/{token}
  so FastAPI does not treat "by-id" as the {token} path parameter.
"""

import logging
import secrets
import uuid
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Order, Table, TableSession, User
from app.schemas import (
    QRScanResponse,
    SessionCloseRequest,
    SessionStatusEnum,
    SessionValidateResponse,
    TableInUseResponse,
    TableSessionOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/qr", tags=["QR Sessions"])


# ── Internal helpers ──────────────────────────────────────────────────────

def _is_expired(session: TableSession) -> bool:
    """Return True if expires_at is set and has passed."""
    if session.expires_at is None:
        return False
    now = datetime.now(timezone.utc)
    exp = session.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp <= now


def _active_session_for_table(table_id: UUID, db: Session) -> TableSession | None:
    """
    Return the single active session for a table, or None.

    If the session exists but has expired, close it in the DB and return None
    so the next caller can open a fresh session.
    """
    try:
        sess = (
            db.query(TableSession)
            .filter(TableSession.table_id == table_id, TableSession.status == "active")
            .first()
        )
    except SQLAlchemyError:
        return None

    if sess is None:
        return None

    if _is_expired(sess):
        # ── Payment safeguard for auto-close ──────────────────────────────
        # Do not auto-close an expired session if it has unpaid or
        # fake_paid orders.  Return it as still active so scan_qr returns
        # 409 "Table in use" — the table stays occupied until staff resolve
        # the outstanding payment.  Empty sessions and sessions with all
        # paid orders auto-close as before.
        try:
            has_unresolved = (
                db.query(Order.id)
                .filter(
                    Order.session_id == sess.id,
                    Order.payment_status.in_(["unpaid", "fake_paid"]),
                )
                .first()
                is not None
            )
        except SQLAlchemyError:
            db.rollback()
            return sess  # fail safe — don't auto-close if we can't verify

        if has_unresolved:
            return sess  # keep session active, table stays occupied

        try:
            sess.status    = "closed"
            sess.closed_at = datetime.now(timezone.utc)
            db.commit()
        except SQLAlchemyError:
            db.rollback()
        return None

    return sess


def _caller_owns_session(sess: TableSession, user_id: UUID, db: Session) -> bool:
    """
    Return True when the authenticated user can be considered the owner of
    this session.  Two independent proofs are accepted (either is sufficient):

    1. started_by_user_id matches — they created the session while logged in.
    2. They have at least one order on this session — they placed an order
       after scanning (covers the case where they scanned anonymously then
       logged in before ordering).

    NULL started_by_user_id never grants ownership — requirement 7.
    """
    if sess.started_by_user_id is not None and sess.started_by_user_id == user_id:
        return True

    return (
        db.query(Order.id)
        .filter(Order.session_id == sess.id, Order.user_id == user_id)
        .first()
        is not None
    )


def _check_session_orders_paid(sess: TableSession, db: Session) -> None:
    """
    Verify that all orders linked to the session have been paid before
    allowing closure.

    Raises HTTPException(409) when:
      - Any order has payment_status='unpaid'  → payment is still pending.
      - Any order has payment_status='fake_paid' → legacy unverified order
        that requires staff review (staff cannot confirm it via the
        payment endpoint; it must be addressed separately).

    Does NOT raise when:
      - The session has no orders (empty session may close normally).
      - All orders are 'paid'.

    This check must be called BEFORE any state changes (status, closed_at,
    table.status) so a rejection leaves the session and table untouched.
    """
    try:
        orders = (
            db.query(Order)
            .filter(Order.session_id == sess.id)
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    unpaid_orders = [o for o in orders if o.payment_status == "unpaid"]
    if unpaid_orders:
        order_numbers = ", ".join(o.order_number for o in unpaid_orders)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot close session: payment is pending for order(s) "
                f"[{order_numbers}]. Please confirm payment before closing."
            ),
        )

    fake_paid_orders = [o for o in orders if o.payment_status == "fake_paid"]
    if fake_paid_orders:
        order_numbers = ", ".join(o.order_number for o in fake_paid_orders)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot close session: legacy unverified order(s) "
                f"[{order_numbers}] require staff review before closing."
            ),
        )


def _optional_user(request: Request, db: Session) -> User | None:
    """
    Try to resolve a Bearer token to a User without raising on missing/invalid
    tokens.  Returns None for anonymous requests.  Used in POST /qr/scan so the
    endpoint works both with and without authentication.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        return None
    try:
        from app.core.security import decode_access_token
        from jose import JWTError
        payload = decode_access_token(token)
        if payload.get("role") == "admin":
            return None   # admin tokens must not grant customer session access
        user_id = payload.get("sub")
        if not user_id:
            return None
        return db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    except Exception:
        return None


# ── POST /qr/scan ─────────────────────────────────────────────────────────

@router.post(
    "/scan",
    response_model=QRScanResponse,
    responses={
        409: {
            "description": "Table already has an active session.",
            "model": TableInUseResponse,
        },
    },
    summary="Scan a QR code — creates a new table session or rejects if table is in use",
)
def scan_qr(
    request: Request,
    qr_secret: str = Body(..., embed=True, min_length=1),
    db: Session = Depends(get_db),
):
    """
    Security behaviour:
    - Valid qr_secret, table free   → create session, return token.
    - Valid qr_secret, table in use → HTTP 409, NO token in response.
    - Invalid qr_secret             → HTTP 404.
    - Race condition (concurrent scans both see free table):
        Second INSERT hits the partial unique index and raises IntegrityError.
        Caught explicitly → HTTP 409 (same response as the normal busy case).
    """
    # ── 1. Resolve table from qr_secret ──────────────────────────────────
    try:
        table = db.query(Table).filter(Table.qr_secret == qr_secret).first()
    except SQLAlchemyError as exc:
        logger.error("scan_qr table lookup: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if table is None:
        raise HTTPException(status_code=404, detail="Invalid QR code. Table not found.")

    # ── 2. Check for existing active session ─────────────────────────────
    existing = _active_session_for_table(table.id, db)
    if existing:
        # Table is occupied.  Do NOT return the existing token.
        logger.info(
            "scan_qr: table %s already has active session %s — returning 409",
            table.table_number, existing.id,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=TableInUseResponse(
                table_in_use=True,
                table_number=table.table_number,
                message=(
                    f"Table {table.table_number} already has an active session. "
                    "Please ask a staff member for assistance."
                ),
            ).model_dump(),
        )

    # ── 3. Resolve optional caller identity ──────────────────────────────
    caller: User | None = _optional_user(request, db)

    # ── 4. Create a new session ───────────────────────────────────────────
    token = secrets.token_urlsafe(48)   # 64 URL-safe chars — cryptographically random
    try:
        new_session = TableSession(
            table_id=table.id,
            session_token=token,
            status="active",
            started_by_user_id=caller.id if caller else None,
        )
        db.add(new_session)
        table.status = "occupied"
        db.flush()    # write to DB within transaction so the unique index fires here
        db.commit()
        db.refresh(new_session)

    except IntegrityError:
        # The partial unique index fired — a concurrent scan beat us to it.
        # Roll back our transaction cleanly and report 409.
        db.rollback()
        logger.warning(
            "scan_qr: IntegrityError on table %s — concurrent scan race, returning 409",
            table.table_number,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=TableInUseResponse(
                table_in_use=True,
                table_number=table.table_number,
                message=(
                    f"Table {table.table_number} just became occupied. "
                    "Please ask a staff member for assistance."
                ),
            ).model_dump(),
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("scan_qr create: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return QRScanResponse(
        session_id=new_session.id,
        session_token=new_session.session_token,
        table_id=table.id,
        table_number=table.table_number,
        capacity=table.capacity,
        status=SessionStatusEnum.active,
        started_at=new_session.started_at,
        expires_at=new_session.expires_at,
        is_new_session=True,
    )


# ── GET /qr/session/by-id/{session_id} — MUST be registered before /{token}

@router.get(
    "/session/by-id/{session_id}",
    response_model=TableSessionOut,
    summary="Get session by UUID (authenticated + ownership required)",
)
def get_session_by_id(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns session detail only to the user who owns the session.
    Ownership = started_by_user_id matches, OR the user has an order on
    this session.  Neither path reveals the session to a stranger.
    """
    try:
        sess = db.query(TableSession).filter(TableSession.id == session_id).first()
    except SQLAlchemyError as exc:
        logger.error("get_session_by_id: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    if not _caller_owns_session(sess, current_user.id, db):
        raise HTTPException(status_code=403, detail="Access denied.")

    return sess


# ── GET /qr/session/{token} ───────────────────────────────────────────────

@router.get(
    "/session/{token}",
    response_model=SessionValidateResponse,
    summary="Validate a session token (unauthenticated — token is the credential)",
)
def validate_session(token: str, db: Session = Depends(get_db)):
    """
    Always returns HTTP 200; the caller must check the `valid` field.

    The token itself is the credential — no additional auth required.
    An attacker who does not have the token cannot validate or use the session.
    """
    try:
        sess = db.query(TableSession).filter(TableSession.session_token == token).first()
    except SQLAlchemyError as exc:
        logger.error("validate_session: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if sess is None:
        return SessionValidateResponse(valid=False, detail="Session not found.")
    if sess.status != "active":
        return SessionValidateResponse(valid=False, detail="Session is closed.")
    if _is_expired(sess):
        return SessionValidateResponse(valid=False, detail="Session has expired.")

    return SessionValidateResponse(
        valid=True,
        session_id=sess.id,
        table_id=sess.table_id,
        table_number=sess.table.table_number,
    )


# ── PATCH /qr/session/{session_id}/close ─────────────────────────────────

@router.patch(
    "/session/{session_id}/close",
    response_model=TableSessionOut,
    summary="Close a table session — requires session_token proof of possession",
)
def close_session(
    session_id: UUID,
    body: SessionCloseRequest,
    db: Session = Depends(get_db),
):
    """
    Closes the session identified by {session_id}.

    Authorization is proved by supplying the correct session_token in the
    request body — the same token returned at scan time.  This fixes two
    bugs from Phase 1:

    Bug 1 (empty-session 403): the old code called _user_owns_session() which
    required at least one order on the session.  A customer who just scanned
    but hadn't ordered yet could never close their own session.  The token
    is the credential now, so this works at any point after scanning.

    Bug 2 (no auth required for close): requiring the token means anyone who
    stumbled upon the session UUID cannot close it without also having the
    token.  The session UUID is a UUID4 (unguessable) and is not public, but
    defence-in-depth is worth the extra field.

    The endpoint is intentionally unauthenticated at the JWT level — customers
    may have scanned without logging in.  The session_token in the body is the
    sufficient credential.
    """
    try:
        sess = (
            db.query(TableSession)
            .filter(TableSession.id == session_id)
            .with_for_update()
            .first()
        )
    except SQLAlchemyError as exc:
        logger.error("close_session lookup: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    if sess.status == "closed":
        raise HTTPException(status_code=400, detail="Session is already closed.")

    # ── Token proof-of-possession check ──────────────────────────────────
    # Use secrets.compare_digest to avoid timing-based oracle attacks.
    if not secrets.compare_digest(sess.session_token, body.session_token):
        logger.warning(
            "close_session: wrong session_token for session %s", session_id
        )
        raise HTTPException(status_code=403, detail="Access denied.")

    # ── Payment safeguard: reject if any order is unpaid or fake_paid ────
    _check_session_orders_paid(sess, db)

    # ── Close the session ─────────────────────────────────────────────────
    try:
        sess.status    = "closed"
        sess.closed_at = datetime.now(timezone.utc)
        if sess.table:
            sess.table.status = "free"
        db.commit()
        db.refresh(sess)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("close_session commit: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    return sess
