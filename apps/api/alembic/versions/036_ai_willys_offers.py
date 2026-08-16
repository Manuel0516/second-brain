"""agent willys_offers tool toggle

Defaults to true, unlike web_fetch_enabled (035), which is opt-in because it
fetches whatever URL the model asks for. willys_offers only ever reads one
hardcoded public host with no user-controlled URL, so it carries none of that
SSRF surface and is on unless the user turns it off.

Revision ID: 036
Revises: 035
Create Date: 2026-08-16 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "036"
down_revision: str | Sequence[str] | None = "035"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ai_settings",
        sa.Column("willys_offers_enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("ai_settings", "willys_offers_enabled")
