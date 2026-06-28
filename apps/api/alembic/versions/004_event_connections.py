"""Add graph links and structured event connection drafts."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column(
            "connections",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.create_table(
        "links",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=False),
        sa.Column("target_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("relation", sa.String(100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_type",
            "source_id",
            "target_type",
            "target_id",
            "relation",
            name="uq_links_edge",
        ),
    )
    op.create_index("ix_links_source_id", "links", ["source_id"])
    op.create_index("ix_links_target_id", "links", ["target_id"])


def downgrade() -> None:
    op.drop_index("ix_links_target_id", table_name="links")
    op.drop_index("ix_links_source_id", table_name="links")
    op.drop_table("links")
    op.drop_column("calendar_events", "connections")
