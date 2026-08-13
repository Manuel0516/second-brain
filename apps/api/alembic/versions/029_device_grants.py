"""device grants — OAuth-style device authorization for the Telegram bot

Revision ID: 029
Revises: c3b8d4b570e2
Create Date: 2026-08-13
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "029"
down_revision: str | Sequence[str] | None = "c3b8d4b570e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "device_grants",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_code", sa.String(length=8), nullable=False),
        sa.Column("device_code_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("bot_token_hash", sa.String(length=64), nullable=True),
        sa.Column("bot_token_pending", sa.Text(), nullable=True),
        sa.Column("token_delivered", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_device_grants_user_code", "device_grants", ["user_code"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_device_grants_user_code", table_name="device_grants")
    op.drop_table("device_grants")
