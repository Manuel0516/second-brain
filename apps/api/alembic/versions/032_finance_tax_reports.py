"""Add Finance tax workspaces, versioned treatments and frozen reports.

Revision ID: 032
Revises: 031
"""

import sqlalchemy as sa

from alembic import op

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "finance_tax_profiles",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("tax_year", sa.Integer(), nullable=False),
        sa.Column("jurisdiction", sa.String(2), nullable=False),
        sa.Column("reporting_currency", sa.String(3), nullable=False),
        sa.Column("materiality_threshold", sa.Numeric(24, 8), nullable=False),
        sa.Column("reconciliation_tolerance", sa.Numeric(38, 18), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("valuation_policy", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "jurisdiction IN ('SE','ES')",
            name="ck_finance_tax_profile_jurisdiction",
        ),
        sa.CheckConstraint(
            "status IN ('draft','active','closed')",
            name="ck_finance_tax_profile_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "tax_year", "jurisdiction", name="uq_finance_tax_profile"),
    )

    op.create_table(
        "finance_residency_facts",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("tax_profile_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("fact_type", sa.String(100), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.Column("evidence_document_ids", sa.JSON(), nullable=False),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('observed','adviser_confirmed','disputed')",
            name="ck_finance_residency_fact_status",
        ),
        sa.ForeignKeyConstraint(["tax_profile_id"], ["finance_tax_profiles.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_finance_residency_facts_profile",
        "finance_residency_facts",
        ["user_id", "tax_profile_id"],
    )

    op.create_table(
        "finance_tax_treatments",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("event_revision_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("tax_profile_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("current_revision_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["event_revision_id"], ["finance_event_revisions.id"]),
        sa.ForeignKeyConstraint(["tax_profile_id"], ["finance_tax_profiles.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "event_revision_id",
            "tax_profile_id",
            name="uq_finance_tax_treatment_event_profile",
        ),
    )

    op.create_table(
        "finance_tax_treatment_revisions",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("treatment_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("event_revision_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("tax_profile_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("jurisdiction", sa.String(2), nullable=False),
        sa.Column("tax_year", sa.Integer(), nullable=False),
        sa.Column("ruleset_id", sa.String(100), nullable=False),
        sa.Column("ruleset_version", sa.String(50), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("inputs", sa.JSON(), nullable=False),
        sa.Column("output", sa.JSON(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("source_citations", sa.JSON(), nullable=False),
        sa.Column("missing_facts", sa.JSON(), nullable=False),
        sa.Column("confirmed_by", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("supersedes_revision_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('candidate','confirmed','rejected','superseded')",
            name="ck_finance_tax_treatment_revision_status",
        ),
        sa.ForeignKeyConstraint(["confirmed_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["event_revision_id"], ["finance_event_revisions.id"]),
        sa.ForeignKeyConstraint(["supersedes_revision_id"], ["finance_tax_treatment_revisions.id"]),
        sa.ForeignKeyConstraint(["tax_profile_id"], ["finance_tax_profiles.id"]),
        sa.ForeignKeyConstraint(["treatment_id"], ["finance_tax_treatments.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "treatment_id",
            "revision_number",
            name="uq_finance_tax_treatment_revision",
        ),
    )
    op.create_foreign_key(
        "fk_finance_tax_treatments_current_revision",
        "finance_tax_treatments",
        "finance_tax_treatment_revisions",
        ["current_revision_id"],
        ["id"],
    )

    op.create_table(
        "finance_open_questions",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("tax_profile_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("question_type", sa.String(100), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("owner_role", sa.String(32), nullable=False),
        sa.Column("related_entities", sa.JSON(), nullable=False),
        sa.Column("resolution", sa.Text(), nullable=True),
        sa.Column("resolution_audit_entry_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "severity IN ('info','warning','blocking')",
            name="ck_finance_open_question_severity",
        ),
        sa.CheckConstraint(
            "status IN ('open','resolved','deferred')",
            name="ck_finance_open_question_status",
        ),
        sa.ForeignKeyConstraint(["tax_profile_id"], ["finance_tax_profiles.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_finance_open_questions_user_status",
        "finance_open_questions",
        ["user_id", "status"],
    )

    op.create_table(
        "finance_report_runs",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("tax_profile_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("tax_year", sa.Integer(), nullable=False),
        sa.Column("jurisdiction", sa.String(2), nullable=False),
        sa.Column("reporting_currency", sa.String(3), nullable=False),
        sa.Column("format", sa.String(20), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("ruleset_versions", sa.JSON(), nullable=False),
        sa.Column("algorithm_version", sa.String(50), nullable=False),
        sa.Column("blockers", sa.JSON(), nullable=False),
        sa.Column("warnings", sa.JSON(), nullable=False),
        sa.Column("manifest", sa.JSON(), nullable=False),
        sa.Column("manifest_sha256", sa.String(64), nullable=False),
        sa.Column("file_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("file_sha256", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "format IN ('zip','csv','pdf_summary')",
            name="ck_finance_report_run_format",
        ),
        sa.CheckConstraint(
            "status IN ('ready','ready_with_warnings','blocked')",
            name="ck_finance_report_run_status",
        ),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"]),
        sa.ForeignKeyConstraint(["tax_profile_id"], ["finance_tax_profiles.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "manifest_sha256",
            "format",
            name="uq_finance_report_manifest",
        ),
    )
    op.create_index(
        "ix_finance_report_runs_user_created",
        "finance_report_runs",
        ["user_id", "created_at"],
    )

    op.create_table(
        "finance_report_inputs",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("report_run_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("input_type", sa.String(50), nullable=False),
        sa.Column("input_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("input_hash", sa.String(64), nullable=True),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["report_run_id"], ["finance_report_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "report_run_id",
            "input_type",
            "input_id",
            name="uq_finance_report_input",
        ),
    )

    op.create_table(
        "finance_report_items",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("report_run_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("schedule", sa.String(100), nullable=False),
        sa.Column("line_key", sa.String(255), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("value", sa.Numeric(24, 8), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("event_revision_ids", sa.JSON(), nullable=False),
        sa.Column("valuation_ids", sa.JSON(), nullable=False),
        sa.Column("treatment_revision_ids", sa.JSON(), nullable=False),
        sa.Column("evidence_document_ids", sa.JSON(), nullable=False),
        sa.Column("calculation_trace", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["report_run_id"], ["finance_report_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "report_run_id",
            "schedule",
            "line_key",
            name="uq_finance_report_item_line",
        ),
    )


def downgrade() -> None:
    op.drop_table("finance_report_items")
    op.drop_table("finance_report_inputs")
    op.drop_index("ix_finance_report_runs_user_created", table_name="finance_report_runs")
    op.drop_table("finance_report_runs")
    op.drop_index("ix_finance_open_questions_user_status", table_name="finance_open_questions")
    op.drop_table("finance_open_questions")
    op.drop_constraint(
        "fk_finance_tax_treatments_current_revision",
        "finance_tax_treatments",
        type_="foreignkey",
    )
    op.drop_table("finance_tax_treatment_revisions")
    op.drop_table("finance_tax_treatments")
    op.drop_index("ix_finance_residency_facts_profile", table_name="finance_residency_facts")
    op.drop_table("finance_residency_facts")
    op.drop_table("finance_tax_profiles")
