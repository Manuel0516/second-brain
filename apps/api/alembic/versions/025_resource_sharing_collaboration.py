"""Add account sharing and durable note collaboration updates.

Revision ID: 025
Revises: 024
"""

import sqlalchemy as sa

from alembic import op

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "resource_shares",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("resource_type", sa.String(16), nullable=False),
        sa.Column("resource_id", sa.UUID(), nullable=False),
        sa.Column("recipient_user_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["recipient_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("resource_type", "resource_id", "recipient_user_id"),
    )
    op.create_index(
        "ix_resource_shares_recipient", "resource_shares", ["recipient_user_id", "resource_type"]
    )
    op.create_index(
        "ix_resource_shares_resource", "resource_shares", ["resource_type", "resource_id"]
    )
    op.create_table(
        "note_collaboration_updates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("page_id", sa.UUID(), nullable=False),
        sa.Column("update", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["page_id"], ["pages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_note_collaboration_updates_page_id", "note_collaboration_updates", ["page_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_note_collaboration_updates_page_id", table_name="note_collaboration_updates")
    op.drop_table("note_collaboration_updates")
    op.drop_index("ix_resource_shares_resource", table_name="resource_shares")
    op.drop_index("ix_resource_shares_recipient", table_name="resource_shares")
    op.drop_table("resource_shares")
