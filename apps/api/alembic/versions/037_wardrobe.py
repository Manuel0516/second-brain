"""Native wardrobe catalog and outfit membership.

Revision ID: 037
Revises: 036
"""

import sqlalchemy as sa

from alembic import op

revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wardrobe_garments",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", sa.UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("brand", sa.String(100), nullable=False),
        sa.Column("size", sa.String(50), nullable=False),
        sa.Column("color", sa.String(100), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.Column(
            "photo_file_id", sa.UUID(as_uuid=False), sa.ForeignKey("files.id", ondelete="SET NULL")
        ),
    )
    op.create_index("ix_wardrobe_garments_user_id", "wardrobe_garments", ["user_id"])
    op.create_table(
        "wardrobe_outfits",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", sa.UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
    )
    op.create_index("ix_wardrobe_outfits_user_id", "wardrobe_outfits", ["user_id"])
    op.create_table(
        "wardrobe_outfit_garments",
        sa.Column(
            "outfit_id",
            sa.UUID(as_uuid=False),
            sa.ForeignKey("wardrobe_outfits.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "garment_id",
            sa.UUID(as_uuid=False),
            sa.ForeignKey("wardrobe_garments.id"),
            primary_key=True,
        ),
    )


def downgrade() -> None:
    # Destructive rollback: export wardrobe rows and linked events before downgrading.
    op.drop_table("wardrobe_outfit_garments")
    op.drop_table("wardrobe_outfits")
    op.drop_table("wardrobe_garments")
