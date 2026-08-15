"""agent web_fetch tool toggle

Revision ID: 035
Revises: 034
Create Date: 2026-08-15 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "035"
down_revision: str | Sequence[str] | None = "034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ai_settings",
        sa.Column("web_fetch_enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("ai_settings", "web_fetch_enabled")
