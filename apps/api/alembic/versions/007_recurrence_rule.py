"""Add structured recurrence rule fields (interval, byday, count)."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column(
            "recurrence_interval",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )
    op.add_column(
        "calendar_events",
        sa.Column(
            "recurrence_byday",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "calendar_events",
        sa.Column("recurrence_count", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("calendar_events", "recurrence_count")
    op.drop_column("calendar_events", "recurrence_byday")
    op.drop_column("calendar_events", "recurrence_interval")
