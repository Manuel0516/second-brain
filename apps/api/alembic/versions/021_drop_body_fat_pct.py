"""Drop body_fat_pct from body_metrics — weight-only body metrics for now.

Backup plan: body fat % was never surfaced as a chart/goal metric beyond the
raw log entry, so no derived data depends on it. If it needs to come back,
re-add the nullable float column via a new migration; historical values are
not recoverable from this drop (no soft-delete/archive), so only run this
against environments where losing existing body_fat_pct values is acceptable.
"""

import sqlalchemy as sa

from alembic import op

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("body_metrics", "body_fat_pct")


def downgrade() -> None:
    op.add_column(
        "body_metrics",
        sa.Column("body_fat_pct", sa.Float(), nullable=True),
    )
