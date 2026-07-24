"""Add visual_style (neon/monochrome) to user_settings.

Revision ID: 028
Revises: 027
"""

import sqlalchemy as sa

from alembic import op

revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column("visual_style", sa.String(length=16), nullable=False, server_default="neon"),
    )


def downgrade() -> None:
    op.drop_column("user_settings", "visual_style")
