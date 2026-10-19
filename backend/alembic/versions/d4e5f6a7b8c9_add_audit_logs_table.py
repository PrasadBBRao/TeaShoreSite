"""add audit_logs table

Revision ID: d4e5f6a7b8c9
Revises:     c3d4e5f6a7b8
Create Date: 2026-10-07

Creates the append-only audit_logs table used to record admin and staff
actions for security and compliance purposes.

Design:
  - No FK from audit_logs to admins — an admin being deleted must not
    cascade-delete their historical log entries.
  - actor_id / actor_username are stored as plain columns so log entries
    survive admin account deletion.
  - metadata_json is TEXT (not JSONB) for maximum compatibility; the
    application layer serialises / deserialises it.
  - Four indexes cover the expected read patterns:
      actor_id       → "show all actions by this admin"
      action         → "show all menu.create events"
      created_at     → time-range queries (most common)
      resource_type  → "show all changes to orders"
"""

from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id",             sa.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("actor_id",       sa.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_username", sa.String(length=80),  nullable=True),
        sa.Column("actor_role",     sa.String(length=20),  nullable=True),
        sa.Column("action",         sa.String(length=100), nullable=False),
        sa.Column("resource_type",  sa.String(length=60),  nullable=True),
        sa.Column("resource_id",    sa.String(length=100), nullable=True),
        sa.Column("success",        sa.Boolean(),          nullable=False, server_default=sa.true()),
        sa.Column("metadata_json",  sa.Text(),             nullable=True),
        sa.Column("created_at",     sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_actor_id",   "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_action",     "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_resource",   "audit_logs", ["resource_type", "resource_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_resource",   table_name="audit_logs")
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action",     table_name="audit_logs")
    op.drop_index("ix_audit_logs_actor_id",   table_name="audit_logs")
    op.drop_table("audit_logs")
