"""Add notes list marker style preferences to user_settings."""

import sqlalchemy as sa

from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default backfills existing rows; columns stay NOT NULL.
    op.add_column(
        "user_settings",
        sa.Column("notes_bullet_style", sa.String(16), nullable=False, server_default="disc"),
    )
    op.add_column(
        "user_settings",
        sa.Column("notes_numbered_style", sa.String(16), nullable=False, server_default="decimal"),
    )


def downgrade() -> None:
    op.drop_column("user_settings", "notes_numbered_style")
    op.drop_column("user_settings", "notes_bullet_style")
