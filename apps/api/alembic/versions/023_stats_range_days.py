"""Add fitness and food stats graph lookback range settings."""

import sqlalchemy as sa

from alembic import op

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column("fitness_stats_range_days", sa.Integer(), nullable=False, server_default="90"),
    )
    op.add_column(
        "user_settings",
        sa.Column("food_stats_range_days", sa.Integer(), nullable=False, server_default="90"),
    )


def downgrade() -> None:
    op.drop_column("user_settings", "food_stats_range_days")
    op.drop_column("user_settings", "fitness_stats_range_days")
