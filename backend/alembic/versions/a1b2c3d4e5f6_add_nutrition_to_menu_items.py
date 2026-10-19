"""add nutrition fields to menu_items

Revision ID: a1b2c3d4e5f6
Revises: 903ab19db2c0
Create Date: 2026-09-05

Adds four nullable integer columns to menu_items:
  calories   — kcal per serving
  protein_g  — grams of protein
  carbs_g    — grams of carbohydrates
  fat_g      — grams of fat

All columns are nullable so existing rows are unaffected until seeded.
"""

from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: str = '903ab19db2c0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('menu_items', sa.Column('calories',  sa.Integer(), nullable=True))
    op.add_column('menu_items', sa.Column('protein_g', sa.Integer(), nullable=True))
    op.add_column('menu_items', sa.Column('carbs_g',   sa.Integer(), nullable=True))
    op.add_column('menu_items', sa.Column('fat_g',     sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('menu_items', 'fat_g')
    op.drop_column('menu_items', 'carbs_g')
    op.drop_column('menu_items', 'protein_g')
    op.drop_column('menu_items', 'calories')
