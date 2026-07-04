"""Add favorite text/highlight/block colors and favorite covers to user_settings."""

import sqlalchemy as sa

from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default backfills existing rows; columns stay NOT NULL.
    for column in (
        "favorite_text_colors",
        "favorite_highlight_colors",
        "favorite_block_colors",
        "favorite_covers",
    ):
        op.add_column(
            "user_settings",
            sa.Column(column, sa.JSON(), nullable=False, server_default="[]"),
        )


def downgrade() -> None:
    for column in (
        "favorite_covers",
        "favorite_block_colors",
        "favorite_highlight_colors",
        "favorite_text_colors",
    ):
        op.drop_column("user_settings", column)
