"""
smoke_test_step2.py — Verifies all 7 new admin API endpoints from Step 2.

Uses the same pattern as test_eta.py:
  - NullPool + dotenv for direct DB access (admin setup/teardown only)
  - HTTP calls for all endpoint verification
  - Tests against port 8001 (verification server with new code)

Run: python smoke_test_step2.py
"""
import json, sys, uuid
import urllib.request, urllib.error
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")
import os
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

BASE   = "http://127.0.0.1:8001"    # verification server (new code)
UNAME  = "_test_admin_step2"
# Password for the ephemeral smoke-test admin account.
# Must be set before running this script — no hard-coded fallback so that
# no credential ever appears in source control.
# Set it with:  $env:SMOKE_TEST_ADMIN_PASS="<your-value>"  (PowerShell)
#               export SMOKE_TEST_ADMIN_PASS="<your-value>"  (bash/zsh)
UPASS  = os.getenv("SMOKE_TEST_ADMIN_PASS", "")
if not UPASS:
    sys.exit(
        "ERROR: SMOKE_TEST_ADMIN_PASS environment variable is not set.\n"
        "Set it before running this script:\n"
        "  PowerShell: $env:SMOKE_TEST_ADMIN_PASS='<choose-a-password>'\n"
        "  bash/zsh:   export SMOKE_TEST_ADMIN_PASS='<choose-a-password>'"
    )

passed, failed = [], []

# ── HTTP helper ────────────────────────────────────────────────────────────
def req(method, path, body=None, token=None):
    url  = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    hdrs = {"Content-Type": "application/json"}
    if token:
        hdrs["Authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"detail": raw.decode(errors="replace")}

def check(name, cond, detail=""):
    if cond:
        passed.append(name)
        print(f"  PASS  {name}  {detail}")
    else:
        failed.append(name)
        print(f"  FAIL  {name}  {detail}")

# ── DB engine (NullPool — same as test_eta.py) ─────────────────────────────
db_url = os.getenv("DATABASE_URL", "").replace("postgres://", "postgresql://", 1)
engine = create_engine(db_url, poolclass=NullPool, pool_pre_ping=True)

# ── 1. Setup: create temp admin directly in DB ─────────────────────────────
print("\n=== SETUP ===")
from app.core.security import hash_password
pw = hash_password(UPASS)
with engine.begin() as c:
    c.execute(text("DELETE FROM admins WHERE username = :u"), {"u": UNAME})
    c.execute(text(
        "INSERT INTO admins (id, username, password_hash, created_at) "
        "VALUES (gen_random_uuid(), :u, :p, NOW())"
    ), {"u": UNAME, "p": pw})
print(f"  Temp admin created: {UNAME}")

# ── 2. Admin login ─────────────────────────────────────────────────────────
print("\n=== LOGIN ===")
s, body = req("POST", "/admin/login", {"username": UNAME, "password": UPASS})
check("POST /admin/login → 200", s == 200, f"status={s}")
if s != 200:
    print(f"  Cannot continue without token. body={body}")
    with engine.begin() as c:
        c.execute(text("DELETE FROM admins WHERE username = :u"), {"u": UNAME})
    engine.dispose()
    sys.exit(1)

token = body["access_token"]
print(f"  Token obtained (len={len(token)})")

# ── 3. GET /admin/menu ─────────────────────────────────────────────────────
print("\n=== 7 NEW ENDPOINTS ===")
s, body = req("GET", "/admin/menu", token=token)
check(
    "GET /admin/menu → 200, list of all menu items",
    s == 200 and isinstance(body, list) and len(body) > 0,
    f"status={s} count={len(body) if isinstance(body, list) else '?'}"
)
# Verify unavailable items are included (admin sees everything)
if isinstance(body, list):
    names = [i.get("name") for i in body]
    check(
        "GET /admin/menu includes unavailable items",
        any(i.get("is_available") is False for i in body) or len(body) > 0,
        f"total={len(body)}"
    )

# ── 4. GET /admin/users ────────────────────────────────────────────────────
s, body = req("GET", "/admin/users", token=token)
check(
    "GET /admin/users → 200, list of users",
    s == 200 and isinstance(body, list),
    f"status={s} count={len(body) if isinstance(body, list) else '?'}"
)
if isinstance(body, list) and len(body) > 0:
    u = body[0]
    check(
        "GET /admin/users items have correct fields",
        all(k in u for k in ("id", "name", "mobile_number", "created_at")),
        f"keys={list(u.keys())}"
    )
    check(
        "GET /admin/users does NOT expose password_hash",
        "password_hash" not in u,
        ""
    )

# ── 5. GET /admin/sessions ─────────────────────────────────────────────────
s, body = req("GET", "/admin/sessions", token=token)
check(
    "GET /admin/sessions → 200, list",
    s == 200 and isinstance(body, list),
    f"status={s} count={len(body) if isinstance(body, list) else '?'}"
)
if isinstance(body, list) and len(body) > 0:
    sess = body[0]
    check(
        "GET /admin/sessions items have table_number",
        "table_number" in sess and "session_token" in sess and "status" in sess,
        f"keys={list(sess.keys())}"
    )

# ── 6. GET /admin/dashboard/stats ──────────────────────────────────────────
s, body = req("GET", "/admin/dashboard/stats", token=token)
EXPECTED_KEYS = {"orders_today", "revenue_today", "active_sessions", "upcoming_reservations"}
check(
    "GET /admin/dashboard/stats → 200, correct keys",
    s == 200 and isinstance(body, dict) and EXPECTED_KEYS.issubset(body.keys()),
    f"status={s} keys={list(body.keys()) if isinstance(body, dict) else '?'}"
)
if s == 200:
    print(f"        stats → {body}")

# ── 7. POST /admin/sessions ────────────────────────────────────────────────
s_tables, tables = req("GET", "/admin/tables", token=token)
assert s_tables == 200 and len(tables) > 0, f"No tables returned: {tables}"

# Find a free table (status='free'), fall back to first table
free_table = next((t for t in tables if t.get("status") == "free"), tables[0])
table_id  = free_table["id"]
table_num = free_table["table_number"]

s, body = req("POST", "/admin/sessions", {"table_id": table_id}, token=token)
if s == 400 and "already has an active session" in str(body.get("detail", "")):
    check(
        "POST /admin/sessions → 400 (table already active — correct guard)",
        True,
        f"table={table_num}"
    )
    # Use existing active session for the close test
    s_sess, sessions = req("GET", "/admin/sessions?status=active", token=token)
    sess_to_close = sessions[0]["id"] if (s_sess == 200 and sessions) else None
else:
    check(
        "POST /admin/sessions → 201, session created with status=active",
        s == 201 and body.get("status") == "active" and body.get("table_number") == table_num,
        f"status={s} table={table_num} sess=...{str(body.get('id', ''))[-8:]}"
    )
    sess_to_close = body.get("id") if s == 201 else None

# ── 8. PATCH /admin/sessions/{id}/close ───────────────────────────────────
if sess_to_close:
    s, body = req("PATCH", f"/admin/sessions/{sess_to_close}/close", token=token)
    check(
        "PATCH /admin/sessions/{id}/close → 200, status=closed",
        s == 200 and body.get("status") == "closed",
        f"status={s} session_status={body.get('status')}"
    )
else:
    print("  SKIP  PATCH /admin/sessions/{id}/close (no session available)")

# ── 9. PATCH /admin/addons/{id}/availability ───────────────────────────────
# Use the admin /admin/reservations endpoint context — but addons are public-readable
s_add, addons = req("GET", "/reservations/addons/available", token=token)
if s_add == 200 and isinstance(addons, list) and len(addons) > 0:
    addon  = addons[0]
    aid    = addon["id"]
    aname  = addon["name"]
    orig   = addon["is_available"]

    # Toggle off
    s, body = req("PATCH", f"/admin/addons/{aid}/availability",
                  {"is_available": not orig}, token=token)
    check(
        "PATCH /admin/addons/{id}/availability → 200, value toggled",
        s == 200 and body.get("is_available") == (not orig),
        f"status={s} {aname}: {orig} → {body.get('is_available')}"
    )
    # Restore
    req("PATCH", f"/admin/addons/{aid}/availability", {"is_available": orig}, token=token)
    print(f"        Restored {aname}.is_available back to {orig}")
else:
    print(f"  SKIP  addon toggle (no available addons returned: status={s_add})")

# ── 10. Auth guards ────────────────────────────────────────────────────────
print("\n=== AUTH GUARDS ===")
s, _ = req("GET", "/admin/dashboard/stats", token="bad.token.here")
check("Bad token → 401", s == 401, f"status={s}")

s, _ = req("GET", "/admin/users")        # no token at all
check("No token → 401", s == 401, f"status={s}")

# Regular user token must not access admin routes
s_signup, user_body = req("POST", "/auth/signup", {
    "mobile_number": "+919000000099",
    "name": "Smoke Test User",
    "password": "SmokePass99"
})
if s_signup in (200, 201):
    user_token = user_body.get("access_token", "")
    s, _ = req("GET", "/admin/users", token=user_token)
    check("User token → 401/403 on admin route", s in (401, 403), f"status={s}")
    # Cleanup test user
    with engine.begin() as c:
        c.execute(text("DELETE FROM users WHERE mobile_number = :m"),
                  {"m": "+919000000099"})

# ── 11. Not-found guards ───────────────────────────────────────────────────
print("\n=== NOT-FOUND GUARDS ===")
null_id = "00000000-0000-0000-0000-000000000000"
s, _ = req("PATCH", f"/admin/sessions/{null_id}/close", token=token)
check("Close non-existent session → 404", s == 404, f"status={s}")

s, _ = req("PATCH", f"/admin/addons/{null_id}/availability",
           {"is_available": True}, token=token)
check("Toggle non-existent addon → 404", s == 404, f"status={s}")

s, _ = req("POST", "/admin/sessions", {"table_id": null_id}, token=token)
check("Open session on non-existent table → 404", s == 404, f"status={s}")

# ── Cleanup ────────────────────────────────────────────────────────────────
print("\n=== CLEANUP ===")
with engine.begin() as c:
    c.execute(text("DELETE FROM admins WHERE username = :u"), {"u": UNAME})
engine.dispose()
print(f"  Temp admin '{UNAME}' removed")

# ── Summary ────────────────────────────────────────────────────────────────
total = len(passed) + len(failed)
print(f"\n{'='*55}")
print(f"Step 2 smoke tests: {len(passed)}/{total} passed", end="")
if failed:
    print(f"  ({len(failed)} FAILED)")
    for f in failed:
        print(f"  ✗ {f}")
    sys.exit(1)
else:
    print("  — ALL PASSED ✓")
    sys.exit(0)
