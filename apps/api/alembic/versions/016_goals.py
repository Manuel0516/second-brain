"""Goals table for fitness goal tracking"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "016"
down_revision: str | Sequence[str] | None = "015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "goals",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("target_type", sa.String(length=20), nullable=False),
        sa.Column("exercise_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("metric_key", sa.String(length=50), nullable=True),
        sa.Column("target_value", sa.Float(), nullable=False),
        sa.Column("target_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("goals")
