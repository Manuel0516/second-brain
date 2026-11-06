"""Per-user wardrobe categories and default calendar.

Revision ID: 038
Revises: 037
"""

import sqlalchemy as sa

from alembic import op

revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column(
            "wardrobe_categories",
            sa.JSON(),
            nullable=False,
            server_default='["Tops","Bottoms","Dresses","Outerwear","Shoes","Accessories","Activewear","Other"]',
        ),
    )
    op.add_column(
        "user_settings",
        sa.Column("wardrobe_default_calendar_id", sa.UUID(as_uuid=False), nullable=True),
    )
    op.create_foreign_key(
        "fk_wardrobe_default_calendar",
        "user_settings",
        "calendars",
        ["wardrobe_default_calendar_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Export wardrobe preferences before this destructive rollback.
    op.drop_constraint("fk_wardrobe_default_calendar", "user_settings", type_="foreignkey")
    op.drop_column("user_settings", "wardrobe_default_calendar_id")
    op.drop_column("user_settings", "wardrobe_categories")
