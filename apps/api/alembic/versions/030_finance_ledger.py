"""Add Finance canonical events, ledger, review and reconciliation.

Revision ID: 030
Revises: 029
"""

import sqlalchemy as sa

from alembic import op

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "finance_events",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("current_revision_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_finance_events_user_created", "finance_events", ["user_id", "created_at"])

    op.create_table(
        "finance_event_revisions",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("event_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_local_time", sa.String(64), nullable=True),
        sa.Column("source_timezone", sa.String(63), nullable=True),
        sa.Column("tax_date", sa.Date(), nullable=False),
        sa.Column("tax_day_policy", sa.String(100), nullable=False),
        sa.Column("source_account_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=True),
        sa.Column("semantic_fingerprint", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("derivation_type", sa.String(50), nullable=False),
        sa.Column("derivation_version", sa.String(50), nullable=False),
        sa.Column("supersedes_revision_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("created_by_type", sa.String(32), nullable=False),
        sa.Column("created_by_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "event_type IN "
            "('income','expense','transfer','trade','staking_reward','interest','dividend',"
            "'funding_payment','derivative_fill','fee','withholding','corporate_action',"
            "'valuation_adjustment','other')",
            name="ck_finance_event_revision_type",
        ),
        sa.CheckConstraint("revision_number > 0", name="ck_finance_event_revision_positive"),
        sa.CheckConstraint(
            "status IN ('proposed','confirmed','superseded','voided')",
            name="ck_finance_event_revision_status",
        ),
        sa.ForeignKeyConstraint(["event_id"], ["finance_events.id"]),
        sa.ForeignKeyConstraint(["source_account_id"], ["finance_accounts.id"]),
        sa.ForeignKeyConstraint(["supersedes_revision_id"], ["finance_event_revisions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "event_id",
            "revision_number",
            name="uq_finance_event_revision_number",
        ),
        sa.UniqueConstraint(
            "user_id",
            "semantic_fingerprint",
            "derivation_version",
            name="uq_finance_event_revision_semantic",
        ),
    )
    op.create_index(
        "ix_finance_event_revisions_user_effective",
        "finance_event_revisions",
        ["user_id", "effective_at"],
    )
    op.create_foreign_key(
        "fk_finance_events_current_revision",
        "finance_events",
        "finance_event_revisions",
        ["current_revision_id"],
        ["id"],
    )

    op.create_table(
        "finance_revision_raw_records",
        sa.Column("event_revision_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("raw_record_id", sa.UUID(as_uuid=False), nullable=False),
        sa.ForeignKeyConstraint(["event_revision_id"], ["finance_event_revisions.id"]),
        sa.ForeignKeyConstraint(["raw_record_id"], ["finance_raw_records.id"]),
        sa.PrimaryKeyConstraint("event_revision_id", "raw_record_id"),
    )

    op.create_table(
        "finance_event_components",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("event_revision_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("account_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("asset_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("quantity", sa.Numeric(38, 18), nullable=False),
        sa.Column("fiat_value", sa.Numeric(24, 8), nullable=True),
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.CheckConstraint(
            "role IN ('asset_in','asset_out','fee','withholding','collateral','funding',"
            "'reward','transfer','disposal','income','expense','other')",
            name="ck_finance_event_components_role",
        ),
        sa.ForeignKeyConstraint(["account_id"], ["finance_accounts.id"]),
        sa.ForeignKeyConstraint(["asset_id"], ["finance_assets.id"]),
        sa.ForeignKeyConstraint(["event_revision_id"], ["finance_event_revisions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_finance_event_components_event_revision_id",
        "finance_event_components",
        ["event_revision_id"],
    )

    op.create_table(
        "finance_postings",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("event_revision_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("account_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("ledger_account", sa.String(100), nullable=False),
        sa.Column("asset_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("quantity", sa.Numeric(38, 18), nullable=False),
        sa.Column("fiat_value", sa.Numeric(24, 8), nullable=True),
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("posting_role", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["finance_accounts.id"]),
        sa.ForeignKeyConstraint(["asset_id"], ["finance_assets.id"]),
        sa.ForeignKeyConstraint(["event_revision_id"], ["finance_event_revisions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_finance_postings_event_revision_id",
        "finance_postings",
        ["event_revision_id"],
    )
    op.create_index(
        "ix_finance_postings_user_account_asset",
        "finance_postings",
        ["user_id", "account_id", "asset_id"],
    )

    op.create_table(
        "finance_valuations",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("event_revision_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("asset_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("source_currency", sa.String(32), nullable=False),
        sa.Column("target_currency", sa.String(3), nullable=False),
        sa.Column("rate", sa.Numeric(38, 18), nullable=False),
        sa.Column("value", sa.Numeric(24, 8), nullable=True),
        sa.Column("valued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("provider", sa.String(100), nullable=False),
        sa.Column("provider_reference", sa.String(255), nullable=False),
        sa.Column("valuation_policy", sa.String(100), nullable=False),
        sa.Column("tax_year", sa.Integer(), nullable=True),
        sa.Column("jurisdiction", sa.String(2), nullable=True),
        sa.Column("override_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["finance_assets.id"]),
        sa.ForeignKeyConstraint(["event_revision_id"], ["finance_event_revisions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "asset_id",
            "valued_at",
            "target_currency",
            "provider_reference",
            name="uq_finance_valuation_provenance",
        ),
    )

    op.create_table(
        "finance_review_policies",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("policy_key", sa.String(64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("criteria", sa.JSON(), nullable=False),
        sa.Column("decision", sa.JSON(), nullable=False),
        sa.Column("source_group_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('active','revoked')",
            name="ck_finance_review_policies_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "policy_key",
            "version",
            name="uq_finance_review_policy_version",
        ),
    )

    op.create_table(
        "finance_review_groups",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("grouping_key", sa.String(64), nullable=False),
        sa.Column("grouping_rule_version", sa.String(50), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("account_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("asset_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("tax_date", sa.Date(), nullable=False),
        sa.Column("first_effective_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_effective_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("native_quantity", sa.Numeric(38, 18), nullable=False),
        sa.Column("report_value", sa.Numeric(24, 8), nullable=True),
        sa.Column("report_currency", sa.String(3), nullable=True),
        sa.Column("materiality", sa.Numeric(24, 8), nullable=False),
        sa.Column("evidence_coverage", sa.Numeric(7, 6), nullable=False),
        sa.Column("confidence_explanation", sa.Text(), nullable=False),
        sa.Column("candidate_treatment", sa.String(100), nullable=True),
        sa.Column("warnings", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deferred_until", sa.Date(), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending','confirmed','split','deferred')",
            name="ck_finance_review_groups_status",
        ),
        sa.ForeignKeyConstraint(["account_id"], ["finance_accounts.id"]),
        sa.ForeignKeyConstraint(["asset_id"], ["finance_assets.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "grouping_key", name="uq_finance_review_group_key"),
    )
    op.create_index(
        "ix_finance_review_groups_user_status",
        "finance_review_groups",
        ["user_id", "status"],
    )

    op.create_table(
        "finance_review_group_members",
        sa.Column("group_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("event_revision_id", sa.UUID(as_uuid=False), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["finance_review_groups.id"]),
        sa.ForeignKeyConstraint(["event_revision_id"], ["finance_event_revisions.id"]),
        sa.PrimaryKeyConstraint("group_id", "event_revision_id"),
        sa.UniqueConstraint(
            "event_revision_id",
            name="uq_finance_review_group_member_revision",
        ),
    )

    op.create_table(
        "finance_transfer_matches",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("outgoing_revision_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("incoming_revision_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("score", sa.Numeric(7, 6), nullable=False),
        sa.Column("fee_quantity", sa.Numeric(38, 18), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("explanation", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('proposed','confirmed','rejected')",
            name="ck_finance_transfer_matches_status",
        ),
        sa.ForeignKeyConstraint(["incoming_revision_id"], ["finance_event_revisions.id"]),
        sa.ForeignKeyConstraint(["outgoing_revision_id"], ["finance_event_revisions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "outgoing_revision_id",
            "incoming_revision_id",
            name="uq_finance_transfer_match_pair",
        ),
    )

    op.create_table(
        "finance_reconciliations",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("account_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("asset_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("opening_balance", sa.Numeric(38, 18), nullable=False),
        sa.Column("movement_total", sa.Numeric(38, 18), nullable=False),
        sa.Column("closing_balance", sa.Numeric(38, 18), nullable=False),
        sa.Column("difference", sa.Numeric(38, 18), nullable=False),
        sa.Column("tolerance", sa.Numeric(38, 18), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("source_revision_ids", sa.JSON(), nullable=False),
        sa.Column("open_question_ids", sa.JSON(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("run_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending','reconciled','warning','blocked')",
            name="ck_finance_reconciliations_status",
        ),
        sa.ForeignKeyConstraint(["account_id"], ["finance_accounts.id"]),
        sa.ForeignKeyConstraint(["asset_id"], ["finance_assets.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_finance_reconciliations_user_period",
        "finance_reconciliations",
        ["user_id", "period_start", "period_end"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_finance_reconciliations_user_period",
        table_name="finance_reconciliations",
    )
    op.drop_table("finance_reconciliations")
    op.drop_table("finance_transfer_matches")
    op.drop_table("finance_review_group_members")
    op.drop_index(
        "ix_finance_review_groups_user_status",
        table_name="finance_review_groups",
    )
    op.drop_table("finance_review_groups")
    op.drop_table("finance_review_policies")
    op.drop_table("finance_valuations")
    op.drop_index(
        "ix_finance_postings_user_account_asset",
        table_name="finance_postings",
    )
    op.drop_index(
        "ix_finance_postings_event_revision_id",
        table_name="finance_postings",
    )
    op.drop_table("finance_postings")
    op.drop_index(
        "ix_finance_event_components_event_revision_id",
        table_name="finance_event_components",
    )
    op.drop_table("finance_event_components")
    op.drop_table("finance_revision_raw_records")
    op.drop_constraint(
        "fk_finance_events_current_revision",
        "finance_events",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_finance_event_revisions_user_effective",
        table_name="finance_event_revisions",
    )
    op.drop_table("finance_event_revisions")
    op.drop_index("ix_finance_events_user_created", table_name="finance_events")
    op.drop_table("finance_events")
