"""Add per-recipient visibility/color overrides to resource_shares.

A calendar shared with a recipient is a single row owned by one user — there
was no way for a recipient to hide it or recolor it in their own view without
mutating the owner's calendar. These columns are null by default (inherit the
owner's value) and are only ever written by the recipient for their own share
row. Safe to drop if this feature is reverted: no other column depends on it.

Revision ID: 026
Revises: 025
"""

import sqlalchemy as sa

from alembic import op

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("resource_shares", sa.Column("visible", sa.Boolean(), nullable=True))
    op.add_column("resource_shares", sa.Column("color", sa.String(7), nullable=True))


def downgrade() -> None:
    op.drop_column("resource_shares", "color")
    op.drop_column("resource_shares", "visible")
