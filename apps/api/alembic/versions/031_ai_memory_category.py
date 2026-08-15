"""ai memory category

Revision ID: 031
Revises: 030
Create Date: 2026-08-15 00:00:00.000001
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "031"
down_revision: str | Sequence[str] | None = "030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ai_memories",
        sa.Column("category", sa.String(length=16), nullable=False, server_default="fact"),
    )


def downgrade() -> None:
    op.drop_column("ai_memories", "category")
