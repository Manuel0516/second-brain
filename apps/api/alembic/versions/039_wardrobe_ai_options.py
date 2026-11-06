"""Opt-in wardrobe AI and weather planning.

Revision ID: 039
Revises: 038
"""

import sqlalchemy as sa

from alembic import op

revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column(
            "wardrobe_ai_outfits_enabled", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
    )
    op.add_column(
        "user_settings",
        sa.Column(
            "wardrobe_weather_planning_enabled",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column(
        "user_settings",
        sa.Column("wardrobe_weather_city", sa.String(200), server_default="", nullable=False),
    )


def downgrade() -> None:
    # Export wardrobe AI preferences before this destructive rollback.
    op.drop_column("user_settings", "wardrobe_weather_city")
    op.drop_column("user_settings", "wardrobe_weather_planning_enabled")
    op.drop_column("user_settings", "wardrobe_ai_outfits_enabled")
