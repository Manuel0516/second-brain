"""Food core: meal_logs, food_daily_extras, food_* settings on user_settings.

Backup plan: meal_logs and food_daily_extras are new tables — dropping them in
downgrade() loses all food data. If this migration must be rolled back in
production, export the data first via the API or a manual pg_dump of these two
tables. The food_* settings columns on user_settings are additive and safe to
drop (they revert to app defaults on next read).
"""

import sqlalchemy as sa

from alembic import op

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- meal_logs ---
    op.create_table(
        "meal_logs",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("meal_type", sa.String(length=20), nullable=False),
        sa.Column("slot_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="planned",
        ),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("photo_file_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("calories", sa.Float(), nullable=True),
        sa.Column("protein_g", sa.Float(), nullable=True),
        sa.Column("carbs_g", sa.Float(), nullable=True),
        sa.Column("fat_g", sa.Float(), nullable=True),
        sa.Column("water_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("veg_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fruit_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("ai_items", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["photo_file_id"], ["files.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- food_daily_extras ---
    op.create_table(
        "food_daily_extras",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("water_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("veg_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fruit_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "date", name="uq_food_daily_extras_user_date"),
    )

    # --- food_* settings columns on user_settings ---
    op.add_column(
        "user_settings",
        sa.Column(
            "food_daily_meal_goal",
            sa.Integer(),
            nullable=False,
            server_default="5",
        ),
    )
    op.add_column(
        "user_settings",
        sa.Column("food_calorie_target", sa.Integer(), nullable=True),
    )
    op.add_column(
        "user_settings",
        sa.Column("food_protein_target_g", sa.Float(), nullable=True),
    )
    op.add_column(
        "user_settings",
        sa.Column("food_carbs_target_g", sa.Float(), nullable=True),
    )
    op.add_column(
        "user_settings",
        sa.Column("food_fat_target_g", sa.Float(), nullable=True),
    )
    op.add_column(
        "user_settings",
        sa.Column("food_water_target_units", sa.Integer(), nullable=True),
    )
    op.add_column(
        "user_settings",
        sa.Column("food_veg_target_units", sa.Integer(), nullable=True),
    )
    op.add_column(
        "user_settings",
        sa.Column("food_fruit_target_units", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    # Remove food_* settings columns (reverse order)
    op.drop_column("user_settings", "food_fruit_target_units")
    op.drop_column("user_settings", "food_veg_target_units")
    op.drop_column("user_settings", "food_water_target_units")
    op.drop_column("user_settings", "food_fat_target_g")
    op.drop_column("user_settings", "food_carbs_target_g")
    op.drop_column("user_settings", "food_protein_target_g")
    op.drop_column("user_settings", "food_calorie_target")
    op.drop_column("user_settings", "food_daily_meal_goal")

    # Drop tables (reverse creation order)
    op.drop_table("food_daily_extras")
    op.drop_table("meal_logs")
