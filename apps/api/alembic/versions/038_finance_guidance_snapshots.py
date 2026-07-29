"""Store immutable official-guidance HTTP response snapshots.

Revision ID: 038
Revises: 037
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision = "038"
down_revision = "037"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_CHECKS = (
    (
        "ck_finance_guidance_retrieved_url",
        "length(retrieved_url) > 0",
    ),
    (
        "ck_finance_guidance_media_type",
        "media_type IS NULL OR length(media_type) > 0",
    ),
    (
        "ck_finance_guidance_http_status",
        "http_status BETWEEN 200 AND 299",
    ),
    (
        "ck_finance_guidance_body_size",
        "body_size > 0 AND body_size = length(body)",
    ),
)


def upgrade() -> None:
    # A network response cannot be reconstructed faithfully inside a migration.
    # Fail instead of fabricating bytes or changing historical content hashes. If
    # this guard ever fires, export and back up the rows, fetch and validate each
    # source outside Alembic, then backfill through a reviewed one-off migration.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM finance_guidance_sources LIMIT 1) THEN
                RAISE EXCEPTION
                    'migration 038 requires empty finance_guidance_sources; '
                    'back up and explicitly backfill real response snapshots first';
            END IF;
        END;
        $$;
        """
    )
    op.add_column(
        "finance_guidance_sources",
        sa.Column("retrieved_url", sa.Text(), nullable=False),
    )
    op.add_column(
        "finance_guidance_sources",
        sa.Column("media_type", sa.String(255), nullable=True),
    )
    op.add_column(
        "finance_guidance_sources",
        sa.Column("http_status", sa.Integer(), nullable=False),
    )
    op.add_column(
        "finance_guidance_sources",
        sa.Column("body_size", sa.Integer(), nullable=False),
    )
    op.add_column(
        "finance_guidance_sources",
        sa.Column("body", sa.LargeBinary(), nullable=False),
    )
    for name, condition in _CHECKS:
        op.create_check_constraint(name, "finance_guidance_sources", condition)


def downgrade() -> None:
    # Dropping these columns would destroy immutable source evidence. Require an
    # explicit, reviewed export/removal workflow instead of silently losing it.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM finance_guidance_sources LIMIT 1) THEN
                RAISE EXCEPTION
                    'cannot downgrade 038 with finance guidance snapshots present; '
                    'export and preserve the immutable response bodies first';
            END IF;
        END;
        $$;
        """
    )
    for name, _condition in reversed(_CHECKS):
        op.drop_constraint(name, "finance_guidance_sources", type_="check")
    op.drop_column("finance_guidance_sources", "body")
    op.drop_column("finance_guidance_sources", "body_size")
    op.drop_column("finance_guidance_sources", "http_status")
    op.drop_column("finance_guidance_sources", "media_type")
    op.drop_column("finance_guidance_sources", "retrieved_url")
