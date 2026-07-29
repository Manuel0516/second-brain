"""Add Finance investment lots, derivative revisions and bot equity snapshots.

Revision ID: 031
Revises: 030
"""

import sqlalchemy as sa

from alembic import op

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "finance_lots",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("account_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("asset_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("acquisition_revision_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("acquisition_valuation_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("jurisdiction", sa.String(2), nullable=False),
        sa.Column("tax_year", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(50), nullable=False),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acquired_quantity", sa.Numeric(38, 18), nullable=False),
        sa.Column("remaining_quantity", sa.Numeric(38, 18), nullable=False),
        sa.Column("cost_basis", sa.Numeric(24, 8), nullable=False),
        sa.Column("reporting_currency", sa.String(3), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("provenance", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("acquired_quantity > 0", name="ck_finance_lots_quantity_positive"),
        sa.CheckConstraint(
            "remaining_quantity >= 0 AND remaining_quantity <= acquired_quantity",
            name="ck_finance_lots_remaining",
        ),
        sa.CheckConstraint("status IN ('open','depleted','voided')", name="ck_finance_lots_status"),
        sa.ForeignKeyConstraint(["account_id"], ["finance_accounts.id"]),
        sa.ForeignKeyConstraint(["acquisition_revision_id"], ["finance_event_revisions.id"]),
        sa.ForeignKeyConstraint(["acquisition_valuation_id"], ["finance_valuations.id"]),
        sa.ForeignKeyConstraint(["asset_id"], ["finance_assets.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "asset_id",
            "acquisition_revision_id",
            "jurisdiction",
            "method",
            name="uq_finance_lot_identity",
        ),
    )
    op.create_index(
        "ix_finance_lots_user_asset_status",
        "finance_lots",
        ["user_id", "asset_id", "status"],
    )

    op.create_table(
        "finance_lot_disposals",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("lot_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("disposal_revision_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("jurisdiction", sa.String(2), nullable=False),
        sa.Column("tax_year", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(50), nullable=False),
        sa.Column("allocated_quantity", sa.Numeric(38, 18), nullable=False),
        sa.Column("cost_basis", sa.Numeric(24, 8), nullable=False),
        sa.Column("proceeds", sa.Numeric(24, 8), nullable=False),
        sa.Column("gain_loss", sa.Numeric(24, 8), nullable=False),
        sa.Column("reporting_currency", sa.String(3), nullable=False),
        sa.Column("calculation_trace", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "allocated_quantity > 0",
            name="ck_finance_lot_disposals_quantity_positive",
        ),
        sa.ForeignKeyConstraint(["disposal_revision_id"], ["finance_event_revisions.id"]),
        sa.ForeignKeyConstraint(["lot_id"], ["finance_lots.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "lot_id",
            "disposal_revision_id",
            "jurisdiction",
            "method",
            name="uq_finance_lot_disposal_allocation",
        ),
    )

    op.create_table(
        "finance_positions",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("account_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("asset_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("provider_position_id", sa.String(255), nullable=False),
        sa.Column("current_revision_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["finance_accounts.id"]),
        sa.ForeignKeyConstraint(["asset_id"], ["finance_assets.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "account_id",
            "provider_position_id",
            name="uq_finance_position_provider",
        ),
    )
    op.create_index(
        "ix_finance_positions_user_account",
        "finance_positions",
        ["user_id", "account_id"],
    )

    op.create_table(
        "finance_position_revisions",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("position_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("contract_type", sa.String(20), nullable=False),
        sa.Column("direction", sa.String(8), nullable=False),
        sa.Column("leverage", sa.Numeric(18, 8), nullable=False),
        sa.Column("margin_mode", sa.String(20), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("entry_price", sa.Numeric(38, 18), nullable=False),
        sa.Column("exit_price", sa.Numeric(38, 18), nullable=True),
        sa.Column("size", sa.Numeric(38, 18), nullable=False),
        sa.Column("collateral", sa.Numeric(38, 18), nullable=False),
        sa.Column("realized_pnl", sa.Numeric(24, 8), nullable=True),
        sa.Column("unrealized_pnl", sa.Numeric(24, 8), nullable=True),
        sa.Column("funding_total", sa.Numeric(24, 8), nullable=False),
        sa.Column("fee_total", sa.Numeric(24, 8), nullable=False),
        sa.Column("liquidation_price", sa.Numeric(38, 18), nullable=True),
        sa.Column("reporting_currency", sa.String(3), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("source_revision_ids", sa.JSON(), nullable=False),
        sa.Column("supersedes_revision_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "contract_type IN ('perpetual','dated','cfd','option','other')",
            name="ck_finance_position_contract_type",
        ),
        sa.CheckConstraint("direction IN ('long','short')", name="ck_finance_position_direction"),
        sa.CheckConstraint("revision_number > 0", name="ck_finance_position_revision_positive"),
        sa.CheckConstraint(
            "status IN ('open','closed','liquidated','superseded','voided')",
            name="ck_finance_position_status",
        ),
        sa.ForeignKeyConstraint(["position_id"], ["finance_positions.id"]),
        sa.ForeignKeyConstraint(["supersedes_revision_id"], ["finance_position_revisions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "position_id",
            "revision_number",
            name="uq_finance_position_revision",
        ),
    )
    op.create_foreign_key(
        "fk_finance_positions_current_revision",
        "finance_positions",
        "finance_position_revisions",
        ["current_revision_id"],
        ["id"],
    )

    op.create_table(
        "finance_bot_equity_snapshots",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("account_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("as_of", sa.DateTime(timezone=True), nullable=False),
        sa.Column("opening_equity", sa.Numeric(24, 8), nullable=False),
        sa.Column("deposits", sa.Numeric(24, 8), nullable=False),
        sa.Column("withdrawals", sa.Numeric(24, 8), nullable=False),
        sa.Column("transfers", sa.Numeric(24, 8), nullable=False),
        sa.Column("trading_pnl", sa.Numeric(24, 8), nullable=False),
        sa.Column("funding", sa.Numeric(24, 8), nullable=False),
        sa.Column("fees", sa.Numeric(24, 8), nullable=False),
        sa.Column("expected_equity", sa.Numeric(24, 8), nullable=False),
        sa.Column("observed_equity", sa.Numeric(24, 8), nullable=False),
        sa.Column("difference", sa.Numeric(24, 8), nullable=False),
        sa.Column("reporting_currency", sa.String(3), nullable=False),
        sa.Column("source_revision_ids", sa.JSON(), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["finance_accounts.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "account_id",
            "as_of",
            "source_hash",
            name="uq_finance_bot_equity_snapshot",
        ),
    )


def downgrade() -> None:
    op.drop_table("finance_bot_equity_snapshots")
    op.drop_constraint(
        "fk_finance_positions_current_revision",
        "finance_positions",
        type_="foreignkey",
    )
    op.drop_table("finance_position_revisions")
    op.drop_index("ix_finance_positions_user_account", table_name="finance_positions")
    op.drop_table("finance_positions")
    op.drop_table("finance_lot_disposals")
    op.drop_index("ix_finance_lots_user_asset_status", table_name="finance_lots")
    op.drop_table("finance_lots")
