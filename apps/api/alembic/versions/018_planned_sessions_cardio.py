"""Planned sessions + cardio set fields.

- `workout_sessions.status`: 'planned' | 'active' | 'completed' lifecycle,
  NOT NULL with server default 'completed' so every existing row stays a
  completed session. Value set enforced in the API layer.
- `workout_sessions.scheduled_at`: nullable — when a planned session is
  attached to a calendar event this mirrors the event start.
- `workout_sessions.plan`: nullable JSON — intended exercise list for a
  planned session, free-form until the session is logged.
- `set_entries.distance_km` / `set_entries.duration_min`: nullable floats
  for cardio sets (pace = duration/distance is derived, never stored).
- `set_entries.reps`: NOT NULL -> nullable. Cardio sets have no rep count;
  015 made reps required because only strength existed then. The downgrade
  backfills NULL reps to 0 before restoring NOT NULL, so no rows are lost
  (backup plan: pg_dump before downgrading in production — the 0 backfill
  is lossy for cardio rows).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "018"
down_revision: str | Sequence[str] | None = "017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workout_sessions",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="completed"),
    )
    op.add_column(
        "workout_sessions",
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("workout_sessions", sa.Column("plan", sa.JSON(), nullable=True))
    op.add_column("set_entries", sa.Column("distance_km", sa.Float(), nullable=True))
    op.add_column("set_entries", sa.Column("duration_min", sa.Float(), nullable=True))
    op.alter_column(
        "set_entries",
        "reps",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    op.execute("UPDATE set_entries SET reps = 0 WHERE reps IS NULL")
    op.alter_column(
        "set_entries",
        "reps",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.drop_column("set_entries", "duration_min")
    op.drop_column("set_entries", "distance_km")
    op.drop_column("workout_sessions", "plan")
    op.drop_column("workout_sessions", "scheduled_at")
    op.drop_column("workout_sessions", "status")
