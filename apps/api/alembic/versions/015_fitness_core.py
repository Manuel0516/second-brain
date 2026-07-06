"""Fitness core: exercises, workout_sessions, set_entries, body_metrics, calendar_events.created_by"""  # noqa: E501

import sqlalchemy as sa

from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- calendar_events.created_by ---
    op.add_column(
        "calendar_events",
        sa.Column("created_by", sa.String(length=50), nullable=False, server_default="'user'"),
    )

    # --- exercises ---
    op.create_table(
        "exercises",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- workout_sessions ---
    op.create_table(
        "workout_sessions",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("type", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- set_entries ---
    op.create_table(
        "set_entries",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("workout_session_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("exercise_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("set_number", sa.Integer(), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=True),
        sa.Column("rpe", sa.Integer(), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"]),
        sa.ForeignKeyConstraint(["workout_session_id"], ["workout_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- body_metrics ---
    op.create_table(
        "body_metrics",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("weight", sa.Float(), nullable=True),
        sa.Column("body_fat_pct", sa.Float(), nullable=True),
        sa.Column("measurements", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("body_metrics")
    op.drop_table("set_entries")
    op.drop_table("workout_sessions")
    op.drop_table("exercises")
    op.drop_column("calendar_events", "created_by")
