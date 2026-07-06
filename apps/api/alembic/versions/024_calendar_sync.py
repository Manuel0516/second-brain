"""Add Google Calendar sync and ICS subscription columns.

Revision ID: 024
Revises: 023
"""

import sqlalchemy as sa

from alembic import op

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("calendars", sa.Column("google_calendar_id", sa.String(255), nullable=True))
    op.add_column("calendars", sa.Column("google_refresh_token", sa.Text(), nullable=True))
    op.add_column("calendars", sa.Column("sync_token", sa.Text(), nullable=True))
    op.add_column(
        "calendars",
        sa.Column("sync_direction", sa.String(4), nullable=False, server_default="pull"),
    )
    op.add_column("calendars", sa.Column("ics_url", sa.Text(), nullable=True))
    op.add_column(
        "calendars", sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True)
    )

    op.add_column("calendar_events", sa.Column("external_id", sa.String(255), nullable=True))
    op.add_column("calendar_events", sa.Column("google_etag", sa.String(255), nullable=True))
    op.add_column(
        "calendar_events",
        sa.Column("source", sa.String(20), nullable=False, server_default="user"),
    )
    op.add_column(
        "calendar_events", sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        "ix_calendar_events_calendar_external",
        "calendar_events",
        ["calendar_id", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_calendar_events_calendar_external", table_name="calendar_events")
    op.drop_column("calendar_events", "last_synced_at")
    op.drop_column("calendar_events", "source")
    op.drop_column("calendar_events", "google_etag")
    op.drop_column("calendar_events", "external_id")

    op.drop_column("calendars", "last_synced_at")
    op.drop_column("calendars", "ics_url")
    op.drop_column("calendars", "sync_direction")
    op.drop_column("calendars", "sync_token")
    op.drop_column("calendars", "google_refresh_token")
    op.drop_column("calendars", "google_calendar_id")
