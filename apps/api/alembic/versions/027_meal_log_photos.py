"""Replace the single meal photo with an ordered photo collection.

Revision ID: 027
Revises: 026
"""

import sqlalchemy as sa

from alembic import op

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meal_log_photos",
        sa.Column("meal_log_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("file_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["meal_log_id"], ["meal_logs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"]),
        sa.PrimaryKeyConstraint("meal_log_id", "file_id"),
        sa.UniqueConstraint("file_id", name="uq_meal_log_photos_file"),
        sa.UniqueConstraint("meal_log_id", "position", name="uq_meal_log_photos_position"),
    )
    op.execute(
        """
        INSERT INTO meal_log_photos (meal_log_id, file_id, position)
        SELECT id, photo_file_id, 0
        FROM meal_logs
        WHERE photo_file_id IS NOT NULL
        """
    )
    op.drop_constraint("meal_logs_photo_file_id_fkey", "meal_logs", type_="foreignkey")
    op.drop_column("meal_logs", "photo_file_id")


def downgrade() -> None:
    op.add_column(
        "meal_logs",
        sa.Column("photo_file_id", sa.UUID(as_uuid=False), nullable=True),
    )
    op.create_foreign_key(
        "meal_logs_photo_file_id_fkey",
        "meal_logs",
        "files",
        ["photo_file_id"],
        ["id"],
    )
    op.execute(
        """
        UPDATE meal_logs
        SET photo_file_id = meal_log_photos.file_id
        FROM meal_log_photos
        WHERE meal_log_photos.meal_log_id = meal_logs.id
          AND meal_log_photos.position = 0
        """
    )
    op.drop_table("meal_log_photos")
