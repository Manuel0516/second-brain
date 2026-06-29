"""Add is_test_account and role columns to users table.

Revision ID: 009
Revises: 008
"""

import sqlalchemy as sa

from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_test_account column
    op.add_column(
        "users",
        sa.Column("is_test_account", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # Add role column
    op.add_column(
        "users",
        sa.Column("role", sa.String(20), nullable=False, server_default="'user'"),
    )

    # Set the first user (by creation date) as admin
    op.execute(
        "UPDATE users SET role = 'admin' "
        "WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)"
    )


def downgrade() -> None:
    op.drop_column("users", "role")
    op.drop_column("users", "is_test_account")
