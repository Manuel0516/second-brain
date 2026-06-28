"""Add icon field to calendar_events."""

import sqlalchemy as sa

from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column("icon", sa.String(32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("calendar_events", "icon")
