"""
seed.py — Teashore manual seed script.

Usage (from backend/ directory):
    python seed.py

CRITICAL: This script is NEVER imported or executed automatically.
It must be run manually by a developer or administrator.
It is NOT called during:
  - application startup
  - FastAPI lifespan / startup events
  - Alembic migrations
  - deployment pipelines
  - any automated process

Run it once after the initial deployment to populate reference data.
Re-running is safe — every section uses INSERT … ON CONFLICT DO NOTHING
(or explicit existence checks), so duplicate rows are silently skipped.
Existing real data is never modified or deleted.

Sections seeded:
  1. delivery_zones        — 4 distance/charge bands
  2. reservation_addons    — 5 celebration add-ons
  3. menu_items            — full Teashore café menu (~48 items across 6 categories)
  4. tables                — café floor plan (tables 1-12 with QR secrets)

QR secrets:
  Each table gets a cryptographically random URL-safe token generated at
  seed time. On subsequent runs the secret is NOT regenerated — the existing
  secret is preserved (idempotent). Physical QR codes printed from the first
  run remain valid forever unless a table is explicitly reset.
"""

import os
import secrets
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# ── Load .env ──────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. "
        "Make sure backend/.env exists and contains DATABASE_URL."
    )
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


# ══════════════════════════════════════════════════════════════════════════
#  1. DELIVERY ZONES
# ══════════════════════════════════════════════════════════════════════════

DELIVERY_ZONES = [
    # (min_km, max_km, charge_inr)
    (Decimal("0"),  Decimal("1"),  Decimal("35.00")),
    (Decimal("1"),  Decimal("3"),  Decimal("50.00")),
    (Decimal("3"),  Decimal("5"),  Decimal("60.00")),
    (Decimal("5"),  Decimal("10"), Decimal("70.00")),
]


def seed_delivery_zones(conn):
    ins = skip = 0
    for min_d, max_d, charge in DELIVERY_ZONES:
        exists = conn.execute(text(
            "SELECT 1 FROM delivery_zones WHERE min_distance_km=:a AND max_distance_km=:b LIMIT 1"
        ), {"a": min_d, "b": max_d}).fetchone()
        if exists:
            skip += 1
            continue
        conn.execute(text("""
            INSERT INTO delivery_zones (id, min_distance_km, max_distance_km, charge)
            VALUES (gen_random_uuid(), :a, :b, :c)
        """), {"a": min_d, "b": max_d, "c": charge})
        ins += 1
    return ins, skip


# ══════════════════════════════════════════════════════════════════════════
#  2. RESERVATION ADDONS
# ══════════════════════════════════════════════════════════════════════════

RESERVATION_ADDONS = [
    # (name, description, price, image_url, is_available)
    ("Flowers Bouquet",
     "A beautiful bouquet of fresh flowers to make the occasion extra special.",
     Decimal("99.00"), None, True),
    ("Chocolates",
     "A delightful box of premium chocolates — perfect for any celebration.",
     Decimal("149.00"), None, True),
    ("Balloon Decoration",
     "Colourful balloon decoration to set a festive mood at your table.",
     Decimal("249.00"), None, True),
    ("Bento Cake",
     "A cute, personalised single-serving bento cake — a sweet surprise.",
     Decimal("249.00"), None, True),
    ("Gift Message",
     ("Add a personalised message to your reservation or order. "
      "Choose an occasion (Birthday, Anniversary, Love, Congratulations, "
      "Thank You, Best Wishes, Just Because, or Custom) and write your own "
      "or pick from suggested messages. ₹25 is added only when selected."),
     Decimal("25.00"), None, True),
]


def seed_reservation_addons(conn):
    ins = skip = 0
    for name, desc, price, img, avail in RESERVATION_ADDONS:
        exists = conn.execute(text(
            "SELECT 1 FROM reservation_addons WHERE name=:n LIMIT 1"
        ), {"n": name}).fetchone()
        if exists:
            skip += 1
            continue
        conn.execute(text("""
            INSERT INTO reservation_addons (id, name, description, price, image_url, is_available)
            VALUES (gen_random_uuid(), :n, :d, :p, :i, :a)
        """), {"n": name, "d": desc, "p": price, "i": img, "a": avail})
        ins += 1
    return ins, skip


# ══════════════════════════════════════════════════════════════════════════
#  3. MENU ITEMS  — real Teashore café menu
# ══════════════════════════════════════════════════════════════════════════
# ON CONFLICT uses (name, category) — same item in same category is unique.
# Adding the constraint in the application logic; in the DB we rely on
# the application-level check (no explicit UNIQUE on those columns), so
# we do an explicit existence check before inserting.

MENU_ITEMS = [
    # (name, description, price, category, is_available)

    # ── Teas ──────────────────────────────────────────────────────────────
    ("Normal Milk Tea",   "Classic fresh-brewed milk tea, served hot.",            60,  "Teas", True),
    ("Elachi Milk Tea",   "Fragrant cardamom-infused milk tea.",                    70,  "Teas", True),
    ("Kattan Chai",       "Strong black tea without milk — pure and bold.",         55,  "Teas", True),
    ("Iced Masala Chai",  "Cold-brewed spiced chai over ice — our bestseller.",    180,  "Teas", True),
    ("Ginger Chai",       "Hot tea with freshly crushed ginger for a warm kick.",   65,  "Teas", True),
    ("Lemon Iced Tea",    "Refreshing iced black tea with fresh lemon.",            120, "Teas", True),
    ("Masala Chai",       "Classic Indian spiced tea with ginger and cardamom.",     70, "Teas", True),
    ("Rose Milk Tea",     "Creamy milk tea with rose syrup — sweet and floral.",    110, "Teas", True),
    ("Saffron Chai",      "Seasonal saffron-infused milk tea — warm, aromatic and comforting.", 99, "Teas", True),

    # ── Coffees ────────────────────────────────────────────────────────────
    ("Classic Cappuccino","Espresso topped with velvety steamed milk foam.",        160, "Coffees", True),
    ("Cold Brew Coffee",  "Slow-steeped cold brew — smooth with low acidity.",     200, "Coffees", True),
    ("Espresso",          "Single shot of intense, richly extracted espresso.",     120, "Coffees", True),
    ("Masala Coffee",     "South-Indian style filter coffee with spices.",          140, "Coffees", True),
    ("Mocha",             "Espresso blended with chocolate and steamed milk.",      180, "Coffees", True),
    ("Cold Coffee",       "Chilled blended coffee with milk — creamy delight.",    160, "Coffees", True),
    ("Flat White",        "Double ristretto with silky microfoam.",                 170, "Coffees", True),
    ("Filter Coffee",     "Traditional South Indian filter coffee, decoction-based.",130,"Coffees", True),

    # ── Protein Shakes ─────────────────────────────────────────────────────
    ("Mango Protein Shake",   "Alphonso mango blended with whey protein.",         260, "Protein Shakes", True),
    ("Chocolate Banana Shake","Rich chocolate and banana protein shake.",           240, "Protein Shakes", True),
    ("Peanut Butter Shake",   "High-protein peanut butter blend with oat milk.",   270, "Protein Shakes", True),
    ("Berry Blast Shake",     "Mixed berries with Greek yogurt and protein.",       250, "Protein Shakes", True),
    ("Vanilla Almond Shake",  "Vanilla-flavoured shake with almond butter.",       255, "Protein Shakes", True),
    ("Green Protein Shake",   "Spinach, banana, and plant-based protein powder.",  265, "Protein Shakes", True),
    ("Strawberry Shake",      "Fresh strawberries blended with protein and milk.", 240, "Protein Shakes", True),
    ("Coconut Protein Shake", "Coconut milk base with vanilla protein powder.",    255, "Protein Shakes", True),

    # ── Healthy Vegetarian ─────────────────────────────────────────────────
    ("Avocado Toast",        "Sourdough toast with smashed avocado and micro herbs.",240, "Healthy Veg", True),
    ("Sprouts Salad",        "Mixed sprouts with lemon, cumin and fresh herbs.",     180, "Healthy Veg", True),
    ("Paneer Wrap",          "Grilled paneer with mint chutney in a multigrain wrap.",220,"Healthy Veg",True),
    ("Hummus & Veggie Sticks","House-made hummus with seasonal crudités.",           200, "Healthy Veg", True),
    ("Greek Yogurt Bowl",    "Full-fat Greek yogurt with honey, granola, and berries.",190,"Healthy Veg",True),
    ("Fruit & Nut Bowl",     "Seasonal fruits with mixed nuts and a drizzle of honey.",210,"Healthy Veg",True),
    ("Veggie Sandwich",      "Loaded multigrain sandwich with avocado spread.",      175, "Healthy Veg", True),
    ("Quinoa Salad",         "Protein-rich quinoa with roasted vegetables and tahini.",230,"Healthy Veg",True),
    ("Stuffed Paratha",      "Whole-wheat paratha with spiced potato filling.",      195, "Healthy Veg", True),
    ("Multigrain Toast",     "Thick-cut multigrain toast with nut butter and banana.",155,"Healthy Veg",True),

    # ── Healthy Non-Veg ────────────────────────────────────────────────────
    ("Grilled Chicken Wrap", "Herb-marinated chicken breast in a whole-wheat wrap.", 280, "Healthy Non-Veg", True),
    ("Egg Sandwich",         "Scrambled eggs on sourdough with rocket and tomato.",   190, "Healthy Non-Veg", True),
    ("Chicken Salad Bowl",   "Sliced grilled chicken over mixed greens, citrus dressing.",290,"Healthy Non-Veg",True),
    ("Boiled Egg Bowl",      "Two soft-boiled eggs with avocado, greens and seeds.",  175, "Healthy Non-Veg", True),
    ("Grilled Fish Bites",   "Lemon-pepper fish bites with house tartar sauce.",       310, "Healthy Non-Veg", True),
    ("Chicken Skewers",      "Chargrilled chicken skewers with tzatziki.",             300, "Healthy Non-Veg", True),
    ("Chicken Caesar Salad", "Classic Caesar with grilled chicken and parmesan crisps.",295,"Healthy Non-Veg",True),
    ("Peri Peri Chicken Bites","Spicy peri peri-marinated chicken bites.",             260, "Healthy Non-Veg", True),

    # ── Detox Drinks ──────────────────────────────────────────────────────
    ("Turmeric Latte",       "Golden milk with turmeric, ginger and coconut milk.",   150, "Detox", True),
    ("Matcha Latte",         "Premium ceremonial-grade matcha with oat milk.",        180, "Detox", True),
    ("Detox Green Juice",    "Cucumber, celery, spinach, lemon and ginger.",          160, "Detox", True),
    ("Watermelon Mint Cooler","Fresh watermelon blended with mint and lime.",          130, "Detox", True),
    ("Ashwagandha Latte",    "Adaptogen ashwagandha with warm almond milk.",           170, "Detox", True),
    ("Beetroot Latte",       "Earthy beetroot powder with oat milk and honey.",        160, "Detox", True),
]


def seed_menu_items(conn):
    ins = skip = 0
    for name, desc, price, cat, avail in MENU_ITEMS:
        # Check existence by (name, category) — idempotent without a DB unique constraint
        exists = conn.execute(text(
            "SELECT 1 FROM menu_items WHERE name = :n AND category = :c LIMIT 1"
        ), {"n": name, "c": cat}).fetchone()
        if exists:
            skip += 1
            continue
        conn.execute(text("""
            INSERT INTO menu_items (id, name, description, price, category, is_available)
            VALUES (gen_random_uuid(), :n, :d, :p, :c, :a)
        """), {"n": name, "d": desc, "p": Decimal(str(price)), "c": cat, "a": avail})
        ins += 1
    return ins, skip


# ══════════════════════════════════════════════════════════════════════════
#  4. TABLES  — Teashore café floor plan
# ══════════════════════════════════════════════════════════════════════════
# QR secrets are generated once and preserved on subsequent runs.
# Physical QR codes printed from the first run remain valid permanently.
# Table layout: mix of 2-seat, 4-seat, and 6-seat tables.

TABLES = [
    # (table_number, capacity, label)       label is for documentation only
    (1,  2, "Window seat A"),
    (2,  2, "Window seat B"),
    (3,  4, "Centre table A"),
    (4,  4, "Centre table B"),
    (5,  4, "Centre table C"),
    (6,  4, "Corner table A"),
    (7,  4, "Corner table B"),
    (8,  6, "Group table A"),
    (9,  6, "Group table B"),
    (10, 6, "Group table C"),
    (11, 2, "Outdoor A"),
    (12, 4, "Outdoor B"),
]


def seed_tables(conn):
    ins = skip = 0
    for num, cap, label in TABLES:
        existing = conn.execute(text(
            "SELECT id, qr_secret FROM tables WHERE table_number = :n"
        ), {"n": num}).fetchone()

        if existing:
            # Table already exists — preserve the existing QR secret
            skip += 1
            continue

        # Generate a cryptographically secure QR secret (URL-safe, 48 chars)
        qr_secret = secrets.token_urlsafe(36)

        conn.execute(text("""
            INSERT INTO tables (id, table_number, capacity, status, qr_secret)
            VALUES (gen_random_uuid(), :num, :cap, 'free', :qr)
        """), {"num": num, "cap": cap, "qr": qr_secret})
        ins += 1

    return ins, skip


# ══════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════

def main():
    print("Teashore seed script")
    print("=" * 60)

    with engine.begin() as conn:

        # ── Delivery zones ────────────────────────────────────────────
        print("\n1. Delivery zones")
        ins, skip = seed_delivery_zones(conn)
        print(f"   Inserted: {ins}  Skipped: {skip}")
        rows = conn.execute(text(
            "SELECT min_distance_km, max_distance_km, charge FROM delivery_zones ORDER BY min_distance_km"
        )).fetchall()
        for r in rows:
            print(f"   {r[0]}–{r[1]} km  →  ₹{r[2]}")

        # ── Reservation addons ────────────────────────────────────────
        print("\n2. Reservation addons")
        ins, skip = seed_reservation_addons(conn)
        print(f"   Inserted: {ins}  Skipped: {skip}")
        rows = conn.execute(text(
            "SELECT name, price, is_available FROM reservation_addons ORDER BY price"
        )).fetchall()
        for r in rows:
            flag = "✓" if r[2] else "✗"
            print(f"   [{flag}] {r[0]:30s}  ₹{r[1]}")

        # ── Menu items ────────────────────────────────────────────────
        print("\n3. Menu items")
        ins, skip = seed_menu_items(conn)
        print(f"   Inserted: {ins}  Skipped: {skip}")
        rows = conn.execute(text(
            "SELECT category, COUNT(*) FROM menu_items GROUP BY category ORDER BY category"
        )).fetchall()
        for cat, n in rows:
            print(f"   {cat}: {n} items")

        # ── Tables ────────────────────────────────────────────────────
        print("\n4. Café tables")
        ins, skip = seed_tables(conn)
        print(f"   Inserted: {ins}  Skipped: {skip}")
        rows = conn.execute(text(
            "SELECT table_number, capacity, status, LEFT(qr_secret,12)||'…' AS qr_preview "
            "FROM tables ORDER BY table_number"
        )).fetchall()
        for tnum, cap, st, qr in rows:
            print(f"   Table {tnum:>2}  ({cap}-seat)  status={st}  qr={qr}")

    print("\nSeed complete — no duplicates created on re-run.")
    engine.dispose()


if __name__ == "__main__":
    main()
