"""add gift_message to reservations

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-10-03

Adds an optional gift_message column to the reservations table.
Stores the customer's personalised gift message (occasion + text)
so it can be printed/displayed for the café staff.
NULL when no Gift Message add-on was selected.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'reservations',
        sa.Column('gift_message', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('reservations', 'gift_message')
