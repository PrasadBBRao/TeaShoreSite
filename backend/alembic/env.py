import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv

# ── Path setup ────────────────────────────────────────────────────────────────
# Ensure `app/` is importable when Alembic runs from backend/
BASE_DIR = Path(__file__).resolve().parent.parent   # → backend/
sys.path.insert(0, str(BASE_DIR))

# Load .env from backend root
load_dotenv(BASE_DIR / ".env")

# ── Alembic config ────────────────────────────────────────────────────────────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── DATABASE_URL from environment ─────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set — cannot run Alembic migrations.")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

config.set_main_option("sqlalchemy.url", DATABASE_URL)

# ── Import models so autogenerate sees every table and sequence ───────────────
from app.database import Base   # noqa: E402
import app.models               # noqa: E402  — registers all ORM classes on Base.metadata

target_metadata = Base.metadata


# ── Migration runners ─────────────────────────────────────────────────────────

def run_migrations_offline() -> None:
    """Emit SQL to stdout without a live DB connection."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against the live database."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,   # NullPool: Supabase Session Pooler handles pooling
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            # Restrict autogenerate to the public schema only.
            # Supabase also exposes auth.*, storage.*, realtime.* schemas which
            # Alembic must never touch — include_schemas=True without this filter
            # would incorrectly detect those as "removed" tables and try to DROP them.
            include_schemas=False,
            include_object=_include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


def _include_object(obj, name, type_, reflected, compare_to):
    """Only autogenerate for objects in the public schema."""
    if type_ == "table" and getattr(obj, "schema", None) not in (None, "public"):
        return False
    return True


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
