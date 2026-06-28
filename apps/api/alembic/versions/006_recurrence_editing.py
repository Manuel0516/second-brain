"""Add recurrence editing fields (exceptions, overrides, series end)."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column("recurrence_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "calendar_events",
        sa.Column(
            "recurrence_exdates",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "calendar_events",
        sa.Column("recurrence_parent_id", sa.UUID(as_uuid=False), nullable=True),
    )
    op.add_column(
        "calendar_events",
        sa.Column("recurrence_overridden_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_calendar_events_recurrence_parent",
        "calendar_events",
        "calendar_events",
        ["recurrence_parent_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_calendar_events_recurrence_parent", "calendar_events", type_="foreignkey"
    )
    op.drop_column("calendar_events", "recurrence_overridden_at")
    op.drop_column("calendar_events", "recurrence_parent_id")
    op.drop_column("calendar_events", "recurrence_exdates")
    op.drop_column("calendar_events", "recurrence_until")
