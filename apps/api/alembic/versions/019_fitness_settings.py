"""Add fitness rest timer, weight unit, and weekly session target to user_settings."""

import sqlalchemy as sa

from alembic import op

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column("fitness_rest_seconds", sa.Integer(), nullable=False, server_default="90"),
    )
    op.add_column(
        "user_settings",
        sa.Column(
            "fitness_auto_start_rest", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    op.add_column(
        "user_settings",
        sa.Column("fitness_weight_unit", sa.String(3), nullable=False, server_default="kg"),
    )
    op.add_column(
        "user_settings",
        sa.Column("fitness_weekly_session_target", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_settings", "fitness_weekly_session_target")
    op.drop_column("user_settings", "fitness_weight_unit")
    op.drop_column("user_settings", "fitness_auto_start_rest")
    op.drop_column("user_settings", "fitness_rest_seconds")
