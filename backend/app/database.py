"""
database.py — SQLAlchemy engine + session for Teashore.

SUPABASE SESSION POOLER NOTES
──────────────────────────────
1.  We use NullPool (pool_class=NullPool) because Supabase's Session Pooler
    already maintains its own connection pool. SQLAlchemy's client-side pool
    would open extra connections on top of that, causing "too many clients"
    errors.  With NullPool every DB call opens a fresh connection through the
    pooler and closes it immediately after — exactly what the Session Pooler
    expects.

2.  pool_pre_ping=True ensures that before each connection is handed to a
    request, SQLAlchemy issues a cheap "SELECT 1" to confirm it is still live.
    Supabase's free tier silently drops idle connections after ~10 minutes;
    without this flag the backend would throw intermittent
    "connection closed / server closed the connection unexpectedly" errors.

3.  pool_recycle=300 (5 minutes) is kept as an extra safety net even under
    NullPool — it has no effect on NullPool itself but documents intent and
    makes it easy to switch back to a regular pool if the deployment changes.

FREE TIER DORMANCY WARNING
───────────────────────────
Supabase free-tier projects are PAUSED after ~7 days of database inactivity.
A periodic health-check ping to the /health endpoint (at least once every
5 days) must be configured in deployment (e.g. UptimeRobot, GitHub Actions
cron, or a scheduled job) to prevent automatic pausing.
This will be set up in a later deployment part — DO NOT FORGET.

SECRETS EXPIRY NOTE
────────────────────
The DATABASE_URL contains database credentials that do not expire on their
own, but if the Supabase project password is ever rotated the .env must be
updated and the backend redeployed. No other secrets are touched in this file.
"""

import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

# ── Load .env from backend root (parent of app/) ──────────────────────────
_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env")

DATABASE_URL: str = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. "
        "Copy backend/.env.example to backend/.env and fill in your connection string."
    )

# Supabase / Neon sometimes return "postgres://" — SQLAlchemy 2.x needs "postgresql://"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# ── Engine ────────────────────────────────────────────────────────────────
# NullPool: do NOT maintain a client-side pool — the Session Pooler handles that.
# pool_pre_ping: verify each connection is alive before use.
# pool_recycle: documented intent; effectively a no-op under NullPool.
engine = create_engine(
    DATABASE_URL,
    poolclass=NullPool,
    pool_pre_ping=True,
    pool_recycle=300,
    echo=False,            # set to True temporarily for SQL debug logging
)

# ── Session factory ───────────────────────────────────────────────────────
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


# ── Declarative base ──────────────────────────────────────────────────────
class Base(DeclarativeBase):
    """All SQLAlchemy ORM models inherit from this class."""
    pass


# ── FastAPI dependency ────────────────────────────────────────────────────
def get_db():
    """
    Yield a database session, then close it after the request completes.
    Usage:  db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
