"""Database pages: page type/template/cover/properties + property and view tables.

Revision ID: 011
Revises: 010
"""

import sqlalchemy as sa

from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pages",
        sa.Column("type", sa.String(16), server_default="page", nullable=False),
    )
    op.add_column(
        "pages",
        sa.Column("is_template", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column("pages", sa.Column("cover", sa.String(512), nullable=True))
    op.add_column(
        "pages",
        sa.Column("properties", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
    )
    op.create_table(
        "database_properties",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("page_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("config", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("position", sa.String(255), server_default="a0", nullable=False),
        sa.ForeignKeyConstraint(["page_id"], ["pages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_database_properties_page_id", "database_properties", ["page_id"])
    op.create_table(
        "database_views",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("page_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(255), server_default="Table", nullable=False),
        sa.Column("type", sa.String(32), server_default="table", nullable=False),
        sa.Column("config", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("position", sa.String(255), server_default="a0", nullable=False),
        sa.ForeignKeyConstraint(["page_id"], ["pages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_database_views_page_id", "database_views", ["page_id"])


def downgrade() -> None:
    # Dropping these loses database schemas/views and page covers/templates —
    # records themselves survive as plain pages.
    op.drop_index("ix_database_views_page_id", table_name="database_views")
    op.drop_table("database_views")
    op.drop_index("ix_database_properties_page_id", table_name="database_properties")
    op.drop_table("database_properties")
    op.drop_column("pages", "properties")
    op.drop_column("pages", "cover")
    op.drop_column("pages", "is_template")
    op.drop_column("pages", "type")
