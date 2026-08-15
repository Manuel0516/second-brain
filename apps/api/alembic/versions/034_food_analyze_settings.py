"""food analyze settings

Revision ID: 034
Revises: 033
Create Date: 2026-08-15 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "034"
down_revision: str | Sequence[str] | None = "033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Kept as a literal (not imported from app.models) so this migration stays a frozen,
# self-contained historical artifact — see apps/api/alembic/AGENTS.md.
_DEFAULT_PROMPT = (
    "Analyze all of these meal photos as one meal. Each image may show a different dish; "
    "include every dish once and return combined totals. Return JSON with: "
    "calories (int), protein_g (float), carbs_g (float), fat_g (float), "
    "water_units (int, glasses of water visible), "
    "veg_units (int, vegetable portions), "
    "fruit_units (int, fruit portions), "
    "items (array of {name, quantity, calories, protein, carbs, fat}). "
    "Only return valid JSON."
)


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column(
            "food_analyze_model",
            sa.String(length=255),
            nullable=False,
            server_default="google/gemini-2.5-flash",
        ),
    )
    op.add_column(
        "user_settings",
        sa.Column(
            "food_analyze_prompt",
            sa.Text(),
            nullable=False,
            server_default=_DEFAULT_PROMPT,
        ),
    )


def downgrade() -> None:
    op.drop_column("user_settings", "food_analyze_prompt")
    op.drop_column("user_settings", "food_analyze_model")
