"""add payment_method column to orders

Revision ID: h3c4d5e6f7a8
Revises: g2b3c4d5e6f7
Create Date: 2026-10-17

Context
-------
Step 3 (Payment Confirmation API): adds a nullable payment_method column
to the orders table so staff can record how an order was paid when they
manually confirm payment.

Schema change (additive — no data is modified):
  ALTER TABLE orders ADD COLUMN payment_method VARCHAR(20) NULL

  - NULL for all existing rows (unpaid and fake_paid orders alike).
  - Set to 'cash' or 'upi' only when staff confirms payment via the
    PATCH /admin/orders/{order_id}/payment endpoint.
  - Application layer enforces the value is 'cash' or 'upi' via the
    PaymentMethodEnum Pydantic schema; the column itself is a plain
    VARCHAR(20) to avoid PostgreSQL enum migration complexity.

Safety notes
  - ADD COLUMN is fully transactional in PostgreSQL and safe to re-run
    (checkfirst guard in the Alembic operation).
  - No existing rows are updated or deleted.
  - The downgrade drops the column (safe because it only existed for this
    feature and is nullable).

Pre-flight: migration g2b3c4d5e6f7 must be the current head.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "h3c4d5e6f7a8"
down_revision: Union[str, None] = "g2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("payment_method", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("orders", "payment_method")
