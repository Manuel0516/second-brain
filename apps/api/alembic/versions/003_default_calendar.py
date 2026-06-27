"""Add an editable Default calendar for existing users."""

from datetime import UTC, datetime
from uuid import uuid4

import sqlalchemy as sa

from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    user_ids = connection.execute(sa.text("SELECT id FROM users")).scalars()
    now = datetime.now(UTC)
    for user_id in user_ids:
        exists = connection.execute(
            sa.text(
                "SELECT 1 FROM calendars "
                "WHERE user_id = :user_id AND lower(name) = 'default' LIMIT 1"
            ),
            {"user_id": user_id},
        ).scalar()
        if not exists:
            connection.execute(
                sa.text(
                    "INSERT INTO calendars "
                    "(id, user_id, name, color, is_visible, source, created_at, updated_at) "
                    "VALUES (:id, :user_id, 'Default', '#8B5CF6', true, 'local', :now, :now)"
                ),
                {"id": str(uuid4()), "user_id": user_id, "now": now},
            )


def downgrade() -> None:
    # The calendar may have been renamed or populated, so removing it would risk data loss.
    pass
