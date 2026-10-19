"""add started_by_user_id to table_sessions and enforce one active session per table

Revision ID: f1a2b3c4d5e6
Revises: e7f8a9b0c1d2
Create Date: 2026-10-14

Context
-------
QR Ordering Phase 1 — two additive, non-destructive database changes:

1. started_by_user_id (NULLABLE FK → users.id ON DELETE SET NULL)
   Records which authenticated user created the session.
   NULL is valid: anonymous scans (no login) and existing historical rows.

2. uq_one_active_session_per_table (partial unique index)
   CREATE UNIQUE INDEX … ON table_sessions(table_id) WHERE status = 'active'
   Prevents more than one active session per table at the database level,
   closing the race-condition window where two simultaneous POST /qr/scan
   requests could both read "no active session" and both INSERT a new one.

   This is a partial index (not a unique constraint) because:
   - Closed sessions are historical records; many closed sessions per table
     are expected and must continue to be allowed.
   - Only ONE active row per table_id needs to be unique.
   - PostgreSQL partial indexes are fully transactional — the constraint is
     enforced atomically within each INSERT transaction.

Pre-flight verification
-----------------------
Run _check_duplicate_sessions.py before applying. The script confirms:
  - started_by_user_id does not already exist
  - uq_one_active_session_per_table does not already exist
  - No table currently has more than one active session (which would block
    index creation)

The live Supabase database was verified clean before this migration was
authored: 11 total sessions, 0 active, no duplicates.

Downgrade safety
----------------
downgrade() is fully reversible:
  - Drops the partial index (no data loss)
  - Drops the column (nullable, so no data constraint is violated)
Both operations are safe on a live database with no active sessions.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Add started_by_user_id (nullable FK → users.id) ────────────────
    # SET NULL ensures the session record survives if the user is ever deleted.
    # Existing rows get NULL — correct because those sessions predate this column.
    op.add_column(
        "table_sessions",
        sa.Column(
            "started_by_user_id",
            sa.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_table_sessions_started_by_user",   # constraint name
        "table_sessions",                       # source table
        "users",                                # referent table
        ["started_by_user_id"],                 # local column(s)
        ["id"],                                 # referent column(s)
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_table_sessions_started_by_user_id",
        "table_sessions",
        ["started_by_user_id"],
    )

    # ── 2. Partial unique index: at most one active session per table ──────
    # Uses raw SQL because Alembic's op.create_index() does not support
    # partial index WHERE clauses through its standard interface.
    op.execute(
        "CREATE UNIQUE INDEX uq_one_active_session_per_table "
        "ON table_sessions (table_id) "
        "WHERE status = 'active'"
    )


def downgrade() -> None:
    # Drop in reverse order of creation
    op.execute("DROP INDEX IF EXISTS uq_one_active_session_per_table")
    op.drop_index(
        "ix_table_sessions_started_by_user_id",
        table_name="table_sessions",
    )
    op.drop_constraint(
        "fk_table_sessions_started_by_user",
        "table_sessions",
        type_="foreignkey",
    )
    op.drop_column("table_sessions", "started_by_user_id")
