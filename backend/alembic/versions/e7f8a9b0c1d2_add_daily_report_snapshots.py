"""add daily report snapshots

Revision ID: e7f8a9b0c1d2
Revises: d4e5f6a7b8c9
Create Date: 2026-10-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "daily_report_snapshots",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column(
            "business_timezone",
            sa.String(length=64),
            server_default="UTC",
            nullable=False,
        ),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("report_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_date", name="uq_daily_report_business_date"),
    )
    op.create_index(
        "ix_daily_report_generated_at",
        "daily_report_snapshots",
        ["generated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_daily_report_generated_at", table_name="daily_report_snapshots")
    op.drop_table("daily_report_snapshots")