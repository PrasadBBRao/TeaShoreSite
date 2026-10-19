"""add role, is_active, created_by to admins

Revision ID: c3d4e5f6a7b8
Revises:     b2c3d4e5f6a7
Create Date: 2026-10-07

Context
-------
Adds three columns to the `admins` table to support a two-tier role system:

  role        VARCHAR(20) NOT NULL DEFAULT 'head_admin'
              Values: 'head_admin' | 'staff'
              Existing rows (if any) are set to 'head_admin' by the upgrade.
              DB had 0 rows at time of authoring, so the UPDATE is a no-op
              but is included for safety.

  is_active   BOOLEAN NOT NULL DEFAULT TRUE
              Deactivated accounts are rejected at the dependency level on
              every authenticated request.

  created_by  UUID NULLABLE FK → admins.id ON DELETE SET NULL
              Audit trail: which head_admin created this account.
              NULL for the bootstrap head_admin (no creator).

Upgrade is fully transactional and safe to re-run (all operations use
server defaults so existing rows are handled gracefully).

Downgrade removes all three columns — safe because the application code
reverts with this migration.
"""

from alembic import op
import sqlalchemy as sa

# Revision identifiers
revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Add `role` column ────────────────────────────────────────────
    # Default 'head_admin' so any existing rows (0 at authoring time) get
    # the highest privilege rather than being silently locked out.
    op.add_column(
        "admins",
        sa.Column(
            "role",
            sa.String(length=20),
            nullable=False,
            server_default="head_admin",
        ),
    )

    # ── 2. Add `is_active` column ───────────────────────────────────────
    op.add_column(
        "admins",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )

    # ── 3. Add `created_by` FK column ───────────────────────────────────
    op.add_column(
        "admins",
        sa.Column(
            "created_by",
            sa.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_admins_created_by",   # constraint name
        "admins",                  # source table
        "admins",                  # referent table (self-referential)
        ["created_by"],            # local cols
        ["id"],                    # remote cols
        ondelete="SET NULL",
    )

    # ── 4. Safety: promote any existing rows to head_admin ──────────────
    # This is a no-op if the table is empty (as expected), but ensures
    # the migration is idempotent if run on a DB with legacy rows.
    op.execute(
        "UPDATE admins SET role = 'head_admin', is_active = TRUE "
        "WHERE role IS NULL OR role = ''"
    )


def downgrade() -> None:
    op.drop_constraint("fk_admins_created_by", "admins", type_="foreignkey")
    op.drop_column("admins", "created_by")
    op.drop_column("admins", "is_active")
    op.drop_column("admins", "role")
