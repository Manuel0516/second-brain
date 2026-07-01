"""Add Phase 1 notes pages.

Revision ID: 010
Revises: 009
"""

import sqlalchemy as sa

from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Deferred: workspace, cover image, database page type, and templates.
    op.create_table(
        "pages",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("parent_page_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(255), server_default="Untitled", nullable=False),
        sa.Column("icon", sa.String(16), nullable=True),
        sa.Column("content", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("position", sa.String(255), server_default="a0", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["parent_page_id"], ["pages.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pages_user_id", "pages", ["user_id"])
    op.create_index("ix_pages_parent_page_id", "pages", ["parent_page_id"])


def downgrade() -> None:
    op.drop_index("ix_pages_parent_page_id", table_name="pages")
    op.drop_index("ix_pages_user_id", table_name="pages")
    op.drop_table("pages")
