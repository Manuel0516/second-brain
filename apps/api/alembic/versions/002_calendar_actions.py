"""Add local calendar editing and event detail fields."""

import sqlalchemy as sa

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "calendars", sa.Column("source", sa.String(20), nullable=False, server_default="local")
    )
    op.add_column("calendar_events", sa.Column("color_override", sa.String(7), nullable=True))
    op.add_column("calendar_events", sa.Column("link", sa.String(2048), nullable=True))
    op.add_column("calendar_events", sa.Column("reminder_minutes", sa.Integer(), nullable=True))
    op.add_column("calendar_events", sa.Column("rrule", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("calendar_events", "rrule")
    op.drop_column("calendar_events", "reminder_minutes")
    op.drop_column("calendar_events", "link")
    op.drop_column("calendar_events", "color_override")
    op.drop_column("calendars", "source")
