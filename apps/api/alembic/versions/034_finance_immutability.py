"""Enforce append-only Finance history at the database boundary.

Revision ID: 034
Revises: 033
"""

from collections.abc import Sequence

from alembic import op

revision = "034"
down_revision = "033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_IMMUTABLE_TABLES = (
    "finance_evidence_documents",
    "finance_raw_records",
    "finance_event_revisions",
    "finance_revision_raw_records",
    "finance_event_components",
    "finance_postings",
    "finance_valuations",
    "finance_reconciliations",
    "finance_audit_entries",
    "finance_idempotency_keys",
    "finance_lot_disposals",
    "finance_position_revisions",
    "finance_bot_equity_snapshots",
    "finance_residency_facts",
    "finance_tax_treatment_revisions",
    "finance_report_runs",
    "finance_report_inputs",
    "finance_report_items",
    "finance_guidance_sources",
    "finance_tool_audits",
)


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION prevent_finance_history_change()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
                USING ERRCODE = 'integrity_constraint_violation';
        END;
        $$;
        """
    )
    for table in _IMMUTABLE_TABLES:
        op.execute(
            f"""
            CREATE TRIGGER trg_{table}_append_only
            BEFORE UPDATE OR DELETE ON {table}
            FOR EACH ROW EXECUTE FUNCTION prevent_finance_history_change();
            """
        )

    # A preview becomes one final import exactly once. Source identity, parser
    # provenance and mapping cannot be edited during that transition.
    op.execute(
        """
        CREATE FUNCTION protect_finance_import()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                RAISE EXCEPTION 'finance_imports is append-only'
                    USING ERRCODE = 'integrity_constraint_violation';
            END IF;
            IF OLD.status <> 'previewed'
               OR NEW.user_id <> OLD.user_id
               OR NEW.account_id <> OLD.account_id
               OR NEW.evidence_document_id <> OLD.evidence_document_id
               OR NEW.content_sha256 <> OLD.content_sha256
               OR NEW.parser_id <> OLD.parser_id
               OR NEW.parser_version <> OLD.parser_version
               OR NEW.import_mode <> OLD.import_mode
               OR NEW.import_fingerprint <> OLD.import_fingerprint
               OR NEW.mapping <> OLD.mapping
               OR NEW.preview <> OLD.preview
               OR NEW.created_at <> OLD.created_at
            THEN
                RAISE EXCEPTION 'finance_imports source provenance is immutable'
                    USING ERRCODE = 'integrity_constraint_violation';
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_finance_imports_protect
        BEFORE UPDATE OR DELETE ON finance_imports
        FOR EACH ROW EXECUTE FUNCTION protect_finance_import();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER trg_finance_imports_protect ON finance_imports")
    op.execute("DROP FUNCTION protect_finance_import()")
    for table in reversed(_IMMUTABLE_TABLES):
        op.execute(f"DROP TRIGGER trg_{table}_append_only ON {table}")
    op.execute("DROP FUNCTION prevent_finance_history_change()")
