"""Add User.username and UserSettings table.

Revision ID: 008
Revises: 007
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add username column to users table (nullable initially for backfill)
    op.add_column(
        "users",
        sa.Column("username", sa.String(50), nullable=True),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # Backfill username from email local-part
    op.execute("UPDATE users SET username = SPLIT_PART(email, '@', 1) WHERE username IS NULL")

    # Set NOT NULL after backfill
    op.alter_column("users", "username", nullable=False)

    # Create user_settings table
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("theme", sa.String(10), nullable=False, server_default="system"),
        sa.Column("timezone", sa.String(63), nullable=False, server_default="Europe/Stockholm"),
        sa.Column("week_start", sa.String(8), nullable=False, server_default="monday"),
        sa.Column("default_view", sa.String(8), nullable=False, server_default="week"),
        sa.Column("time_format", sa.String(3), nullable=False, server_default="24h"),
        sa.Column(
            "favorite_emojis",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "favorite_colors",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("default_event_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column(
            "default_calendar_id",
            sa.Uuid(),
            sa.ForeignKey("calendars.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("default_reminder_minutes", sa.Integer(), nullable=True),
        sa.Column("show_weekends", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("dim_past_events", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("user_settings")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_column("users", "username")
