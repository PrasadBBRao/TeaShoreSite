"""add unpaid and paid payment statuses

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-10-14

Context
-------
Phase 4B: adds real payment tracking to replace the fake_paid placeholder.

Schema changes (all additive — no data is modified):
  1. ALTER TYPE payment_status ADD VALUE 'unpaid'
     Represents an order that has been placed but not yet paid.
  2. ALTER TYPE payment_status ADD VALUE 'paid'
     Represents an order where staff have confirmed cash or UPI receipt.
  3. ALTER TABLE orders ALTER COLUMN payment_status SET DEFAULT 'unpaid'
     New orders are unpaid by default.  Existing rows keep 'fake_paid'.

Safety notes
  - PostgreSQL requires newly added enum values to be committed before they
    can be used in a column DEFAULT.  autocommit_block() ensures the ADD
    VALUE statements are committed before Step 3 references 'unpaid'.
  - IF NOT EXISTS prevents the migration from failing on re-run.
  - All existing 'fake_paid' rows are left completely unchanged.
  - 'fake_paid' remains a valid enum value permanently; it acts as the
    legacy/test bucket in reports.
  - The downgrade intentionally does NOT attempt to remove enum values
    (impossible in PostgreSQL without dropping and recreating the column)
    and only reverts the column default.

Pre-flight: migration f1a2b3c4d5e6 must be the current head.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "g2b3c4d5e6f7"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Step 1 & 2: add enum values ───────────────────────────────────────
    # PostgreSQL requires newly added enum values to be committed before they
    # can be referenced (e.g. in a column DEFAULT).  autocommit_block() runs
    # each statement in its own autocommit transaction so the values are
    # committed immediately and available for Step 3 below.
    # IF NOT EXISTS prevents errors on re-run.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'unpaid'")
        op.execute("ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'paid'")

    # ── Step 3: change the column default ─────────────────────────────────
    # New orders created after this migration will be 'unpaid' by default.
    # Existing rows are untouched (they remain 'fake_paid').
    op.execute(
        "ALTER TABLE orders "
        "ALTER COLUMN payment_status SET DEFAULT 'unpaid'"
    )


def downgrade() -> None:
    # PostgreSQL cannot remove enum values without dropping and recreating
    # the type, which would require dropping every column that uses it.
    # We only revert the default; the enum values remain.
    op.execute(
        "ALTER TABLE orders "
        "ALTER COLUMN payment_status SET DEFAULT 'fake_paid'"
    )
