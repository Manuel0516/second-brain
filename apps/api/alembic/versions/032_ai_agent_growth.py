"""agent policy, metrics, and retrieval settings

Revision ID: 032
Revises: 031
"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op

revision: str = "032"
down_revision: str | Sequence[str] | None = "031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.add_column("ai_messages", sa.Column("metrics", sa.JSON(), nullable=True))
    op.add_column("ai_messages", sa.Column("feedback", sa.String(8), nullable=True))
    op.add_column("ai_memories", sa.Column("normalized_key", sa.String(64), nullable=True))
    op.add_column(
        "ai_actions",
        sa.Column("risk_level", sa.String(16), server_default="ordinary", nullable=False),
    )
    op.add_column(
        "ai_actions", sa.Column("origin", sa.String(16), server_default="tool", nullable=False)
    )
    op.add_column(
        "ai_actions",
        sa.Column("confirmations_required", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column(
        "ai_actions",
        sa.Column("confirmations_received", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "ai_settings",
        sa.Column("embedding_provider", sa.String(32), server_default="openrouter", nullable=False),
    )
    op.add_column(
        "ai_settings",
        sa.Column(
            "embedding_model",
            sa.String(255),
            server_default="openai/text-embedding-3-small",
            nullable=False,
        ),
    )
    op.add_column("ai_settings", sa.Column("embedding_endpoint_url", sa.Text(), nullable=True))
    op.add_column(
        "ai_settings",
        sa.Column("embedding_dimensions", sa.Integer(), server_default="1536", nullable=False),
    )
    op.create_table(
        "ai_search_documents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("embedding_model", sa.String(255), nullable=True),
        sa.Column("embedding", Vector(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "source_type", "source_id", name="uq_ai_search_source"),
    )
    op.create_index("ix_ai_search_documents_user_id", "ai_search_documents", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_search_documents_user_id", table_name="ai_search_documents")
    op.drop_table("ai_search_documents")
    for table, columns in (
        (
            "ai_settings",
            (
                "embedding_dimensions",
                "embedding_endpoint_url",
                "embedding_model",
                "embedding_provider",
            ),
        ),
        (
            "ai_actions",
            ("confirmations_received", "confirmations_required", "origin", "risk_level"),
        ),
        ("ai_memories", ("normalized_key",)),
        ("ai_messages", ("feedback", "metrics")),
    ):
        for column in columns:
            op.drop_column(table, column)
