"""
test_qr_sessions.py — Security and functional tests for the QR session system.

Run with:  python -m unittest test_qr_sessions
or:        python -m pytest test_qr_sessions.py -v

Tests use an isolated SQLite in-memory database — no live Supabase required.
The partial unique index (uq_one_active_session_per_table) is created
explicitly in setUp() so the race-condition path is testable without
PostgreSQL.

Coverage
────────
S1  Valid QR scan on a free table → 201, returns session_token
S2  Invalid QR secret → 404
S3  Second scan on an occupied table → 409, no session_token in detail
S4  409 detail carries table_in_use:True and correct table_number
S5  Validate a live session token → valid:True with session/table metadata
S6  Validate an expired session token → valid:False
S7  Validate a closed session token → valid:False
S8  Validate an unknown token → valid:False
S9  Close session with correct token → 200, session status=closed, table=free
S10 Close session with wrong token → 403
S11 Close an already-closed session → 400
S12 Close a non-existent session UUID → 404
S13 Close an empty session (no orders) with correct token → succeeds (bug-fix)
S14 get_session_by_id: owner via started_by_user_id → 200
S15 get_session_by_id: owner via order on session → 200
S16 get_session_by_id: NULL started_by_user_id does NOT grant access → 403
S17 get_session_by_id: wrong user (not owner) → 403
S18 get_session_by_id: session not found → 404
S19 Authenticated scan sets started_by_user_id on the new session
S20 Anonymous scan leaves started_by_user_id NULL
S21 Race-condition simulation: IntegrityError on INSERT → 409 not 500
S22 Expired session is auto-closed on scan, allowing new session creation
S23 _caller_owns_session: NULL started_by_user_id never grants ownership
S24 _caller_owns_session: started_by_user_id match grants ownership
S25 _caller_owns_session: order on session grants ownership when started_by is NULL
"""

import os
import secrets
import uuid
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

# ── Environment stubs — must be set before any app import ─────────────────
os.environ.setdefault("DATABASE_URL",    "sqlite://")
os.environ.setdefault("JWT_SECRET_KEY",  "qr-session-tests-only")
os.environ.setdefault("JWT_ALGORITHM",   "HS256")

# ── SQLite compatibility shim for PostgreSQL UUID columns ─────────────────
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.ext.compiler import compiles

compiles(PgUUID, "sqlite")(lambda _t, _c, **_kw: "CHAR(36)")

# ── App imports (after env stubs + shim) ──────────────────────────────────
from fastapi import HTTPException
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Order, OrderItem, Table, TableSession, User
from app.routers.qr_sessions import (
    _active_session_for_table,
    _caller_owns_session,
    _is_expired,
    close_session,
    get_session_by_id,
    scan_qr,
    validate_session,
)
from app.schemas import SessionCloseRequest


# ── Helpers ────────────────────────────────────────────────────────────────

def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _utc(**kwargs) -> datetime:
    return datetime.now(timezone.utc) + timedelta(**kwargs)


def _make_table(db, table_number: int = 1, qr_secret: str | None = None) -> Table:
    t = Table(
        id=_uuid(),
        table_number=table_number,
        capacity=4,
        status="free",
        qr_secret=qr_secret or secrets.token_urlsafe(16),
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
    started_by_user_id: uuid.UUID | None = None,
) -> TableSession:
    sess = TableSession(
        id=_uuid(),
        table_id=table.id,
        session_token=secrets.token_urlsafe(48),
        status=status,
        expires_at=expires_at,
        started_by_user_id=started_by_user_id,
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


def _make_order(db, session: TableSession, user: User) -> Order:
    o = Order(
        id=_uuid(),
        order_number=f"T-{secrets.randbelow(9000) + 1000}",
        session_id=session.id,
        user_id=user.id,
        order_type="dine_in",
        status="placed",
        total_price=100,
        payment_status="fake_paid",
    )
    db.add(o)
    db.flush()
    return o


def _fake_request(bearer_token: str | None = None) -> MagicMock:
    """Build a minimal Starlette Request mock for scan_qr."""
    req = MagicMock()
    if bearer_token:
        req.headers = {"Authorization": f"Bearer {bearer_token}"}
    else:
        req.headers = {}
    return req


# ── Base test class ────────────────────────────────────────────────────────

class QRSessionTestBase(unittest.TestCase):
    """
    Shared setUp/tearDown for all QR session tests.

    Uses SQLite in-memory with a StaticPool (same connection for all threads).
    Explicitly creates the partial unique index that Phase 1 added to
    PostgreSQL so the race-condition path is exercisable here.
    """

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        # Enable FK enforcement in SQLite (off by default)
        @event.listens_for(self.engine, "connect")
        def _fk_pragma(conn, _):
            conn.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(self.engine)

        # Replicate the Phase 1 partial unique index.
        # SQLite does not support WHERE in CREATE UNIQUE INDEX, so we use a
        # plain unique index that is good enough to trigger IntegrityError on
        # duplicate (table_id, status='active') in controlled tests.
        # The real partial index is tested in integration against PostgreSQL.
        with self.engine.connect() as conn:
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_session_per_table "
                "ON table_sessions (table_id, status) "
                "WHERE status = 'active'"
            ))
            # SQLite 3.8.9+ supports partial indexes; fall back silently if not
            # (the race-condition test mocks IntegrityError instead).

        Session = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        self.db = Session()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)


# ══════════════════════════════════════════════════════════════════════════
#  S1–S4 · POST /qr/scan
# ══════════════════════════════════════════════════════════════════════════

class TestScanQR(QRSessionTestBase):

    def test_s1_valid_secret_free_table_returns_token(self):
        """S1: Valid QR on free table → session created, token in response."""
        table = _make_table(self.db, table_number=1)
        self.db.commit()

        result = scan_qr(
            request=_fake_request(),
            qr_secret=table.qr_secret,
            db=self.db,
        )

        self.assertTrue(result.is_new_session)
        self.assertIsNotNone(result.session_token)
        self.assertGreater(len(result.session_token), 32)
        self.assertEqual(result.table_number, 1)
        self.assertEqual(str(result.table_id), str(table.id))

        # Verify session was persisted
        sess = self.db.query(TableSession).filter(
            TableSession.table_id == table.id,
            TableSession.status == "active",
        ).first()
        self.assertIsNotNone(sess)
        self.assertEqual(sess.session_token, result.session_token)

        # Verify table status flipped to occupied
        self.db.refresh(table)
        self.assertEqual(table.status, "occupied")

    def test_s2_invalid_qr_secret_returns_404(self):
        """S2: Unknown qr_secret → 404."""
        with self.assertRaises(HTTPException) as ctx:
            scan_qr(
                request=_fake_request(),
                qr_secret="absolutely-not-a-real-secret",
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_s3_occupied_table_returns_409_no_token(self):
        """S3: Table already has an active session → 409, existing token NOT returned."""
        table = _make_table(self.db, table_number=2)
        existing = _make_session(self.db, table)
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            scan_qr(
                request=_fake_request(),
                qr_secret=table.qr_secret,
                db=self.db,
            )

        exc = ctx.exception
        self.assertEqual(exc.status_code, 409)

        # The existing session_token must NOT appear anywhere in the response
        detail_str = str(exc.detail)
        self.assertNotIn(existing.session_token, detail_str)

    def test_s4_409_detail_has_table_in_use_flag_and_table_number(self):
        """S4: 409 detail carries table_in_use:True and the correct table_number."""
        table = _make_table(self.db, table_number=3)
        _make_session(self.db, table)
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            scan_qr(
                request=_fake_request(),
                qr_secret=table.qr_secret,
                db=self.db,
            )

        detail = ctx.exception.detail
        self.assertIsInstance(detail, dict)
        self.assertTrue(detail.get("table_in_use"))
        self.assertEqual(detail.get("table_number"), 3)
        self.assertIn("message", detail)
        # The token field must be absent from the 409 detail dict
        self.assertNotIn("session_token", detail)


# ══════════════════════════════════════════════════════════════════════════
#  S5–S8 · GET /qr/session/{token}
# ══════════════════════════════════════════════════════════════════════════

class TestValidateSession(QRSessionTestBase):

    def test_s5_valid_active_token_returns_valid_true(self):
        """S5: Active session token → valid:True with session and table metadata."""
        table = _make_table(self.db, table_number=1)
        sess  = _make_session(self.db, table)
        self.db.commit()

        result = validate_session(token=sess.session_token, db=self.db)

        self.assertTrue(result.valid)
        self.assertEqual(str(result.session_id), str(sess.id))
        self.assertEqual(str(result.table_id),   str(table.id))
        self.assertEqual(result.table_number, 1)

    def test_s6_expired_token_returns_valid_false(self):
        """S6: Expired session → valid:False (detail: expired)."""
        table = _make_table(self.db)
        past  = _utc(hours=-2)
        sess  = _make_session(self.db, table, expires_at=past)
        self.db.commit()

        result = validate_session(token=sess.session_token, db=self.db)

        self.assertFalse(result.valid)
        self.assertIn("expir", result.detail.lower())

    def test_s7_closed_token_returns_valid_false(self):
        """S7: Closed session → valid:False (detail: closed)."""
        table = _make_table(self.db)
        sess  = _make_session(self.db, table, status="closed")
        self.db.commit()

        result = validate_session(token=sess.session_token, db=self.db)

        self.assertFalse(result.valid)
        self.assertIn("closed", result.detail.lower())

    def test_s8_unknown_token_returns_valid_false(self):
        """S8: Token not in DB → valid:False (detail: not found)."""
        result = validate_session(token="no-such-token-xyz", db=self.db)

        self.assertFalse(result.valid)
        self.assertIn("not found", result.detail.lower())


# ══════════════════════════════════════════════════════════════════════════
#  S9–S13 · PATCH /qr/session/{session_id}/close
# ══════════════════════════════════════════════════════════════════════════

class TestCloseSession(QRSessionTestBase):

    def test_s9_correct_token_closes_session_and_frees_table(self):
        """S9: Correct session_token closes session and sets table.status=free."""
        table = _make_table(self.db, table_number=1)
        table.status = "occupied"
        sess  = _make_session(self.db, table)
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

    def test_s10_wrong_token_returns_403(self):
        """S10: Wrong session_token → 403 Access denied."""
        table = _make_table(self.db)
        sess  = _make_session(self.db, table)
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            close_session(
                session_id=sess.id,
                body=SessionCloseRequest(session_token="wrong-token-value"),
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 403)

    def test_s11_already_closed_returns_400(self):
        """S11: Closing an already-closed session → 400."""
        table = _make_table(self.db)
        sess  = _make_session(self.db, table, status="closed")
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            close_session(
                session_id=sess.id,
                body=SessionCloseRequest(session_token=sess.session_token),
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("already closed", ctx.exception.detail.lower())

    def test_s12_unknown_session_id_returns_404(self):
        """S12: Non-existent session UUID → 404."""
        with self.assertRaises(HTTPException) as ctx:
            close_session(
                session_id=_uuid(),
                body=SessionCloseRequest(session_token="any-token"),
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 404)

    def test_s13_empty_session_no_orders_can_be_closed(self):
        """S13 (bug-fix): Session with zero orders can be closed with correct token.

        The old code required at least one order to establish ownership, making
        it impossible for a customer who hadn't yet ordered to cancel their scan.
        Now the session_token is the credential, not order ownership.
        """
        table = _make_table(self.db)
        sess  = _make_session(self.db, table)
        self.db.commit()

        # Confirm there are no orders on this session
        order_count = self.db.query(Order).filter(
            Order.session_id == sess.id
        ).count()
        self.assertEqual(order_count, 0)

        # Should succeed with the correct token
        result = close_session(
            session_id=sess.id,
            body=SessionCloseRequest(session_token=sess.session_token),
            db=self.db,
        )

        self.assertEqual(result.status, "closed")


# ══════════════════════════════════════════════════════════════════════════
#  S14–S18 · GET /qr/session/by-id/{session_id}
# ══════════════════════════════════════════════════════════════════════════

class TestGetSessionById(QRSessionTestBase):

    def test_s14_owner_via_started_by_user_id_gets_200(self):
        """S14: User who started the session (started_by_user_id) can fetch it."""
        user  = _make_user(self.db)
        table = _make_table(self.db)
        sess  = _make_session(self.db, table, started_by_user_id=user.id)
        self.db.commit()

        result = get_session_by_id(
            session_id=sess.id,
            current_user=user,
            db=self.db,
        )

        self.assertEqual(str(result.id), str(sess.id))

    def test_s15_owner_via_order_gets_200(self):
        """S15: User who has an order on the session can fetch it."""
        user  = _make_user(self.db)
        table = _make_table(self.db)
        sess  = _make_session(self.db, table)    # started_by_user_id=None
        _make_order(self.db, sess, user)
        self.db.commit()

        result = get_session_by_id(
            session_id=sess.id,
            current_user=user,
            db=self.db,
        )

        self.assertEqual(str(result.id), str(sess.id))

    def test_s16_null_started_by_does_not_grant_access(self):
        """S16: NULL started_by_user_id is NOT treated as matching any user → 403."""
        user  = _make_user(self.db)
        table = _make_table(self.db)
        sess  = _make_session(self.db, table)    # started_by_user_id=None, no orders
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            get_session_by_id(
                session_id=sess.id,
                current_user=user,
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 403)

    def test_s17_wrong_user_returns_403(self):
        """S17: Authenticated user who is not the owner → 403."""
        owner  = _make_user(self.db)
        other  = _make_user(self.db)
        table  = _make_table(self.db)
        sess   = _make_session(self.db, table, started_by_user_id=owner.id)
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            get_session_by_id(
                session_id=sess.id,
                current_user=other,
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 403)

    def test_s18_session_not_found_returns_404(self):
        """S18: Non-existent session UUID → 404."""
        user = _make_user(self.db)
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            get_session_by_id(
                session_id=_uuid(),
                current_user=user,
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 404)


# ══════════════════════════════════════════════════════════════════════════
#  S19–S22 · Behavioural / edge-case tests
# ══════════════════════════════════════════════════════════════════════════

class TestScanBehaviour(QRSessionTestBase):

    def test_s19_authenticated_scan_sets_started_by_user_id(self):
        """S19: Scan with a valid Bearer token sets started_by_user_id on the session."""
        from app.core.security import create_access_token

        user  = _make_user(self.db)
        table = _make_table(self.db, table_number=5)
        self.db.commit()

        token = create_access_token(subject=str(user.id))
        result = scan_qr(
            request=_fake_request(bearer_token=token),
            qr_secret=table.qr_secret,
            db=self.db,
        )

        sess = self.db.query(TableSession).filter(
            TableSession.id == result.session_id
        ).first()
        self.assertIsNotNone(sess)
        self.assertEqual(str(sess.started_by_user_id), str(user.id))

    def test_s20_anonymous_scan_leaves_started_by_null(self):
        """S20: Scan without auth header leaves started_by_user_id NULL."""
        table = _make_table(self.db, table_number=6)
        self.db.commit()

        result = scan_qr(
            request=_fake_request(),   # no Bearer token
            qr_secret=table.qr_secret,
            db=self.db,
        )

        sess = self.db.query(TableSession).filter(
            TableSession.id == result.session_id
        ).first()
        self.assertIsNone(sess.started_by_user_id)

    def test_s21_race_condition_integrity_error_returns_409(self):
        """S21: IntegrityError on INSERT (concurrent scan race) → 409 not 500."""
        table = _make_table(self.db, table_number=7)
        self.db.commit()

        # Patch db.flush() to raise IntegrityError, simulating the partial
        # unique index firing when a concurrent transaction already committed
        # a session between our SELECT (saw free) and our INSERT.
        original_flush = self.db.flush
        call_count = {"n": 0}

        def _patched_flush():
            call_count["n"] += 1
            # Raise on the first flush — this is the session INSERT flush inside
            # scan_qr, simulating the partial unique index firing when a concurrent
            # transaction already committed a session between our SELECT and INSERT.
            if call_count["n"] >= 1:
                raise IntegrityError("unique constraint", {}, None)
            return original_flush()

        with patch.object(self.db, "flush", side_effect=_patched_flush):
            with self.assertRaises(HTTPException) as ctx:
                scan_qr(
                    request=_fake_request(),
                    qr_secret=table.qr_secret,
                    db=self.db,
                )

        exc = ctx.exception
        self.assertEqual(exc.status_code, 409)
        self.assertTrue(exc.detail.get("table_in_use"))

    def test_s22_expired_session_allows_new_scan(self):
        """S22: Expired active session is auto-closed on scan, allowing a new session."""
        table = _make_table(self.db, table_number=8)
        table.status = "occupied"
        past_exp = _utc(hours=-1)
        _make_session(self.db, table, expires_at=past_exp)
        self.db.commit()

        # Scan should succeed (not return 409) because the expired session
        # is cleaned up inside _active_session_for_table
        result = scan_qr(
            request=_fake_request(),
            qr_secret=table.qr_secret,
            db=self.db,
        )

        self.assertTrue(result.is_new_session)
        self.assertIsNotNone(result.session_token)


# ══════════════════════════════════════════════════════════════════════════
#  S23–S25 · _caller_owns_session unit tests
# ══════════════════════════════════════════════════════════════════════════

class TestCallerOwnsSession(QRSessionTestBase):

    def test_s23_null_started_by_never_grants_ownership(self):
        """S23: NULL started_by_user_id never grants ownership to any user."""
        user  = _make_user(self.db)
        table = _make_table(self.db)
        sess  = _make_session(self.db, table, started_by_user_id=None)
        self.db.commit()

        result = _caller_owns_session(sess, user.id, self.db)

        self.assertFalse(result, "NULL started_by_user_id must not grant ownership")

    def test_s24_matching_started_by_grants_ownership(self):
        """S24: started_by_user_id == caller.id → True."""
        user  = _make_user(self.db)
        table = _make_table(self.db)
        sess  = _make_session(self.db, table, started_by_user_id=user.id)
        self.db.commit()

        result = _caller_owns_session(sess, user.id, self.db)

        self.assertTrue(result)

    def test_s25_order_on_session_grants_ownership_when_started_by_null(self):
        """S25: When started_by is NULL, having an order on the session grants ownership."""
        user  = _make_user(self.db)
        table = _make_table(self.db)
        sess  = _make_session(self.db, table, started_by_user_id=None)
        _make_order(self.db, sess, user)
        self.db.commit()

        result = _caller_owns_session(sess, user.id, self.db)

        self.assertTrue(result)


# ══════════════════════════════════════════════════════════════════════════
#  Route registration sanity check
# ══════════════════════════════════════════════════════════════════════════

class TestRouteRegistration(unittest.TestCase):

    def test_qr_routes_registered_in_main_app(self):
        """Verifies all four QR endpoints are registered in the FastAPI app."""
        from app.main import app

        routes = {r.path for r in app.routes}
        self.assertIn("/qr/scan",                        routes)
        self.assertIn("/qr/session/{token}",             routes)
        self.assertIn("/qr/session/by-id/{session_id}",  routes)
        self.assertIn("/qr/session/{session_id}/close",  routes)

    def test_by_id_route_registered_before_token_route(self):
        """
        /qr/session/by-id/{session_id} must appear before /qr/session/{token}
        in the router so FastAPI does not swallow 'by-id' as the token value.
        """
        from app.main import app

        qr_paths = [r.path for r in app.routes if r.path.startswith("/qr/session")]
        by_id_idx = next(
            (i for i, p in enumerate(qr_paths) if "by-id" in p), None
        )
        token_idx = next(
            (i for i, p in enumerate(qr_paths)
             if "{token}" in p and "by-id" not in p), None
        )
        self.assertIsNotNone(by_id_idx, "by-id route not found")
        self.assertIsNotNone(token_idx, "token route not found")
        self.assertLess(
            by_id_idx, token_idx,
            "by-id route must be registered before the {token} wildcard route",
        )


if __name__ == "__main__":
    unittest.main()
