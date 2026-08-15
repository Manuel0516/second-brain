"""enable or disable agent skills

Revision ID: 033
Revises: 032
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "033"
down_revision: str | Sequence[str] | None = "032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ai_skills", sa.Column("enabled", sa.Boolean(), server_default=sa.true(), nullable=False)
    )


def downgrade() -> None:
    op.drop_column("ai_skills", "enabled")
