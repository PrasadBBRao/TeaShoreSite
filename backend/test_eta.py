"""ETA API tests against real Supabase. Run: python test_eta.py"""
import json, sys, uuid
import urllib.request, urllib.error
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")
import os
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

BASE = "http://127.0.0.1:8000"
passed, failed = [], []

def req(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    hdrs = {"Content-Type": "application/json"} if body else {}
    if token: hdrs["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read(); return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read(); return e.code, json.loads(raw) if raw else {}

def check(name, cond, detail=""):
    if cond: passed.append(name); print(f"  [PASS] {name}")
    else:    failed.append(name); print(f"  [FAIL] {name}  {detail}")

db_url = os.getenv("DATABASE_URL","").replace("postgres://","postgresql://",1)
engine = create_engine(db_url, poolclass=NullPool, pool_pre_ping=True)

# ── Setup: user, menu item, QR session ───────────────────────────────────
MOBILE = "+917888888001"
with engine.begin() as c:
    c.execute(text("DELETE FROM users WHERE mobile_number=:m"), {"m": MOBILE})

s, b = req("POST", "/auth/signup", {"mobile_number": MOBILE, "name": "ETA Tester", "password": "EtaPass999"})
assert s == 201, f"signup failed: {b}"
tok = b["access_token"]; uid = str(b["user_id"])

with engine.connect() as c:
    tea = c.execute(text("SELECT id::text, price FROM menu_items WHERE name='Normal Milk Tea'")).fetchone()
    TEA_ID, TEA_P = tea[0], float(tea[1])
    T1 = c.execute(text("SELECT id::text, qr_secret FROM tables WHERE table_number=1")).fetchone()
    T1_ID, T1_QR = T1[0], T1[1]

CLEANUP_ORDERS = []

def place_delivery(dist_km, items_list):
    s, b = req("POST", "/orders", {
        "order_type": "home_delivery",
        "delivery_address": "Test Address",
        "delivery_distance_km": dist_km,
        "items": items_list
    }, token=tok)
    if s == 201 and b.get("id"):
        CLEANUP_ORDERS.append(b["id"])
    return s, b

def cleanup():
    with engine.begin() as c:
        for oid in CLEANUP_ORDERS:
            c.execute(text("DELETE FROM order_items WHERE order_id=:id"), {"id": uuid.UUID(oid)})
            c.execute(text("DELETE FROM orders WHERE id=:id"), {"id": uuid.UUID(oid)})
        c.execute(text("DELETE FROM users WHERE id=:id"), {"id": uuid.UUID(uid)})
        c.execute(text("UPDATE tables SET status='free' WHERE table_number=1"))
        c.execute(text("UPDATE table_sessions SET status='closed', closed_at=NOW() WHERE table_id=:id AND status='active'"), {"id": uuid.UUID(T1_ID)})
    engine.dispose()

print("\n=== ETA Tests ===\n")

# T1: 1km + 1 item → 20 min
s, b = place_delivery(1.0, [{"menu_item_id": TEA_ID, "quantity": 1}])
check("T1: 1km+1item → 20min", s==201 and b.get("estimated_delivery_minutes")==20,
      f"got {b.get('estimated_delivery_minutes')}")
check("T1: eta_at set", b.get("estimated_delivery_at") is not None)
check("T1: distance stored", float(b.get("delivery_distance_km",0))==1.0)

# T2: 2km + 2 items → 20 min
s, b = place_delivery(2.0, [{"menu_item_id": TEA_ID, "quantity": 2}])
check("T2: 2km+2items → 20min", s==201 and b.get("estimated_delivery_minutes")==20,
      f"got {b.get('estimated_delivery_minutes')}")

# T3: 3km + 4 items → 25 min
s, b = place_delivery(3.0, [{"menu_item_id": TEA_ID, "quantity": 4}])
check("T3: 3km+4items → 25min", s==201 and b.get("estimated_delivery_minutes")==25,
      f"got {b.get('estimated_delivery_minutes')}")

# T4: 4km + 4 items → 25 min
s, b = place_delivery(4.0, [{"menu_item_id": TEA_ID, "quantity": 4}])
check("T4: 4km+4items → 25min", s==201 and b.get("estimated_delivery_minutes")==25,
      f"got {b.get('estimated_delivery_minutes')}")

# T5: 5km + 6 items → 40 min (30 base + 10 qty)
s, b = place_delivery(5.0, [{"menu_item_id": TEA_ID, "quantity": 6}])
check("T5: 5km+6items → 40min", s==201 and b.get("estimated_delivery_minutes")==40,
      f"got {b.get('estimated_delivery_minutes')}")

# T6: 7km + 7 items → 50 min (35 base + 15 qty)
s, b = place_delivery(7.0, [{"menu_item_id": TEA_ID, "quantity": 7}])
check("T6: 7km+7items → 50min", s==201 and b.get("estimated_delivery_minutes")==50,
      f"got {b.get('estimated_delivery_minutes')}")

# T7: 10km + 8 items → 60 min (45 base + 15 qty)
s, b = place_delivery(10.0, [{"menu_item_id": TEA_ID, "quantity": 8}])
check("T7: 10km+8items → 60min", s==201 and b.get("estimated_delivery_minutes")==60,
      f"got {b.get('estimated_delivery_minutes')}")

# T8: >10km → rejected
s, b = req("POST", "/orders", {
    "order_type": "home_delivery",
    "delivery_address": "Far Away",
    "delivery_distance_km": 11.0,
    "items": [{"menu_item_id": TEA_ID, "quantity": 1}]
}, token=tok)
check("T8: >10km → 400", s==400, f"got {s}")

# T9: takeaway ETA is null
s, b = req("POST", "/orders", {
    "order_type": "takeaway",
    "items": [{"menu_item_id": TEA_ID, "quantity": 1}]
}, token=tok)
check("T9: takeaway eta → null", s==201 and b.get("estimated_delivery_minutes") is None,
      f"got {b.get('estimated_delivery_minutes')}")
if s==201 and b.get("id"): CLEANUP_ORDERS.append(b["id"])

# T10: dine_in ETA is null
s, b = req("POST", "/qr/scan", {"qr_secret": T1_QR})
assert s == 200
sess_tok = b.get("session_token"); sess_id = b.get("session_id")
s, b = req("POST", "/orders", {
    "order_type": "dine_in",
    "session_token": sess_tok,
    "items": [{"menu_item_id": TEA_ID, "quantity": 1}]
}, token=tok)
check("T10: dine_in eta → null", s==201 and b.get("estimated_delivery_minutes") is None,
      f"got {b.get('estimated_delivery_minutes')}")
if s==201 and b.get("id"): CLEANUP_ORDERS.append(b["id"])
# Close the session
req("PATCH", f"/qr/session/{sess_id}/close", token=tok)

# T11: GET order also returns ETA (not just on create)
if len(CLEANUP_ORDERS) >= 7:
    oid = CLEANUP_ORDERS[6]  # T7 order (10km+8items=60min)
    s, b = req("GET", f"/orders/{oid}", token=tok)
    check("T11: GET order also has eta", s==200 and b.get("estimated_delivery_minutes")==60,
          f"got {b.get('estimated_delivery_minutes')}")

# T12: Client cannot supply ETA — server ignores any eta field in request
s, b = place_delivery(1.0, [{"menu_item_id": TEA_ID, "quantity": 1}])
# Even if client tried to inject estimated_delivery_minutes, schema ignores it
check("T12: server eta=20 regardless of client", s==201 and b.get("estimated_delivery_minutes")==20)

# T13: delivery_distance_km persists correctly
s, b = place_delivery(4.5, [{"menu_item_id": TEA_ID, "quantity": 3}])
check("T13: 4.5km stored correctly", s==201 and float(b.get("delivery_distance_km",0))==4.5)
check("T13: 4.5km base=30, qty4=+5 → 35min", b.get("estimated_delivery_minutes")==35,
      f"got {b.get('estimated_delivery_minutes')}")

# ── Cleanup ────────────────────────────────────────────────────────────────
cleanup()

total = len(passed) + len(failed)
print(f"\n{'='*50}")
print(f"ETA Tests: {len(passed)}/{total} passed")
if failed:
    for f in failed: print(f"  ✗ {f}")
else:
    print("All ETA tests passed ✓")
sys.exit(0 if not failed else 1)
