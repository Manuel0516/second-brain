"""Validate Finance tax, report and assistant lineage.

Revision ID: 037
Revises: 036
"""

from collections.abc import Sequence

from alembic import op

revision = "037"
down_revision = "036"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_CHECKS = (
    (
        "ck_finance_tax_treatment_jurisdiction",
        "finance_tax_treatment_revisions",
        "jurisdiction IN ('SE','ES')",
    ),
    (
        "ck_finance_report_manifest_hash",
        "finance_report_runs",
        "length(manifest_sha256) = 64",
    ),
    (
        "ck_finance_report_file_hash",
        "finance_report_runs",
        "file_sha256 IS NULL OR length(file_sha256) = 64",
    ),
    (
        "ck_finance_report_input_type",
        "finance_report_inputs",
        "input_type IN ('event_revision','valuation','tax_treatment_revision',"
        "'evidence_document','residency_fact','reconciliation','open_question')",
    ),
    (
        "ck_finance_report_input_hash",
        "finance_report_inputs",
        "length(input_hash) = 64",
    ),
    (
        "ck_finance_report_input_ordinal",
        "finance_report_inputs",
        "ordinal >= 0",
    ),
    (
        "ck_finance_guidance_source_policy",
        "finance_guidance_sources",
        "source_policy IN ('official_only','primary_preferred','broader_web')",
    ),
    (
        "ck_finance_guidance_content_hash",
        "finance_guidance_sources",
        "length(content_hash) = 64",
    ),
    (
        "ck_finance_tool_audit_status",
        "finance_tool_audits",
        "status IN ('complete','failed','rejected')",
    ),
    (
        "ck_finance_tool_audit_arguments_hash",
        "finance_tool_audits",
        "length(arguments_hash) = 64",
    ),
    (
        "ck_finance_assistant_proposal_token_hash",
        "finance_assistant_proposals",
        "length(confirmation_token_hash) = 64",
    ),
)


def upgrade() -> None:
    for name, table, condition in _CHECKS:
        op.create_check_constraint(name, table, condition)

    op.execute(
        """
        CREATE FUNCTION validate_finance_tax_report_inputs()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            owner_a uuid;
            owner_b uuid;
            profile_year integer;
            profile_jurisdiction text;
            profile_currency text;
            related_event uuid;
            related_profile uuid;
            related_status text;
        BEGIN
            IF TG_TABLE_NAME = 'finance_tax_treatments' THEN
                SELECT revision.user_id, revision.status, revision.event_id
                  INTO owner_a, related_status, related_event
                  FROM finance_event_revisions revision
                 WHERE revision.id = NEW.event_revision_id;
                IF owner_a IS DISTINCT FROM NEW.user_id OR related_status <> 'confirmed'
                   OR NOT EXISTS (
                       SELECT 1 FROM finance_events event
                        WHERE event.id = related_event
                          AND event.current_revision_id = NEW.event_revision_id
                   )
                THEN
                    RAISE EXCEPTION 'finance tax treatment requires current confirmed event'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_tax_treatment_revisions' THEN
                SELECT treatment.user_id, treatment.event_revision_id,
                       treatment.tax_profile_id
                  INTO owner_a, related_event, related_profile
                  FROM finance_tax_treatments treatment
                 WHERE treatment.id = NEW.treatment_id;
                SELECT profile.user_id, profile.tax_year, profile.jurisdiction
                  INTO owner_b, profile_year, profile_jurisdiction
                  FROM finance_tax_profiles profile
                 WHERE profile.id = NEW.tax_profile_id;
                IF owner_a IS DISTINCT FROM NEW.user_id OR owner_b IS DISTINCT FROM NEW.user_id
                   OR related_event IS DISTINCT FROM NEW.event_revision_id
                   OR related_profile IS DISTINCT FROM NEW.tax_profile_id
                   OR profile_year IS DISTINCT FROM NEW.tax_year
                   OR profile_jurisdiction IS DISTINCT FROM NEW.jurisdiction
                THEN
                    RAISE EXCEPTION 'finance tax treatment revision lineage mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_report_runs' THEN
                SELECT profile.user_id, profile.tax_year, profile.jurisdiction,
                       profile.reporting_currency
                  INTO owner_a, profile_year, profile_jurisdiction, profile_currency
                  FROM finance_tax_profiles profile
                 WHERE profile.id = NEW.tax_profile_id;
                IF owner_a IS DISTINCT FROM NEW.user_id
                   OR profile_year IS DISTINCT FROM NEW.tax_year
                   OR profile_jurisdiction IS DISTINCT FROM NEW.jurisdiction
                   OR profile_currency IS DISTINCT FROM NEW.reporting_currency
                THEN
                    RAISE EXCEPTION 'finance report tax profile mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_report_inputs' THEN
                SELECT user_id INTO owner_a FROM finance_report_runs
                 WHERE id = NEW.report_run_id;
                IF NEW.input_type = 'event_revision' THEN
                    SELECT user_id, status INTO owner_b, related_status
                      FROM finance_event_revisions WHERE id = NEW.input_id;
                    IF related_status <> 'confirmed' OR NOT EXISTS (
                        SELECT 1 FROM finance_events
                         WHERE current_revision_id = NEW.input_id
                    ) THEN
                        owner_b := NULL;
                    END IF;
                ELSIF NEW.input_type = 'valuation' THEN
                    SELECT user_id INTO owner_b FROM finance_valuations WHERE id = NEW.input_id;
                ELSIF NEW.input_type = 'tax_treatment_revision' THEN
                    SELECT user_id, status INTO owner_b, related_status
                      FROM finance_tax_treatment_revisions WHERE id = NEW.input_id;
                    IF related_status <> 'confirmed' THEN owner_b := NULL; END IF;
                ELSIF NEW.input_type = 'evidence_document' THEN
                    SELECT user_id INTO owner_b FROM finance_evidence_documents
                     WHERE id = NEW.input_id;
                ELSIF NEW.input_type = 'residency_fact' THEN
                    SELECT user_id INTO owner_b FROM finance_residency_facts
                     WHERE id = NEW.input_id;
                ELSIF NEW.input_type = 'reconciliation' THEN
                    SELECT user_id INTO owner_b FROM finance_reconciliations
                     WHERE id = NEW.input_id;
                ELSIF NEW.input_type = 'open_question' THEN
                    SELECT user_id INTO owner_b FROM finance_open_questions
                     WHERE id = NEW.input_id;
                END IF;
                IF owner_a IS NULL OR owner_b IS DISTINCT FROM owner_a THEN
                    RAISE EXCEPTION 'finance report input owner or state mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_report_items' THEN
                IF EXISTS (
                    SELECT 1 FROM json_array_elements_text(NEW.event_revision_ids)
                         AS source(input_id)
                     WHERE NOT EXISTS (
                         SELECT 1 FROM finance_report_inputs input
                          WHERE input.report_run_id = NEW.report_run_id
                            AND input.input_type = 'event_revision'
                            AND input.input_id = source.input_id::uuid
                     )
                ) OR EXISTS (
                    SELECT 1 FROM json_array_elements_text(NEW.valuation_ids)
                         AS source(input_id)
                     WHERE NOT EXISTS (
                         SELECT 1 FROM finance_report_inputs input
                          WHERE input.report_run_id = NEW.report_run_id
                            AND input.input_type = 'valuation'
                            AND input.input_id = source.input_id::uuid
                     )
                ) OR EXISTS (
                    SELECT 1 FROM json_array_elements_text(NEW.treatment_revision_ids)
                         AS source(input_id)
                     WHERE NOT EXISTS (
                         SELECT 1 FROM finance_report_inputs input
                          WHERE input.report_run_id = NEW.report_run_id
                            AND input.input_type = 'tax_treatment_revision'
                            AND input.input_id = source.input_id::uuid
                     )
                ) OR EXISTS (
                    SELECT 1 FROM json_array_elements_text(NEW.evidence_document_ids)
                         AS source(input_id)
                     WHERE NOT EXISTS (
                         SELECT 1 FROM finance_report_inputs input
                          WHERE input.report_run_id = NEW.report_run_id
                            AND input.input_type = 'evidence_document'
                            AND input.input_id = source.input_id::uuid
                     )
                ) THEN
                    RAISE EXCEPTION 'finance report item input lineage mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    for table in (
        "finance_tax_treatments",
        "finance_tax_treatment_revisions",
        "finance_report_runs",
        "finance_report_inputs",
        "finance_report_items",
    ):
        op.execute(
            f"""
            CREATE CONSTRAINT TRIGGER trg_{table}_tax_report_inputs
            AFTER INSERT OR UPDATE ON {table}
            DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION validate_finance_tax_report_inputs();
            """
        )


def downgrade() -> None:
    for table in reversed(
        (
            "finance_tax_treatments",
            "finance_tax_treatment_revisions",
            "finance_report_runs",
            "finance_report_inputs",
            "finance_report_items",
        )
    ):
        op.execute(f"DROP TRIGGER trg_{table}_tax_report_inputs ON {table}")
    op.execute("DROP FUNCTION validate_finance_tax_report_inputs()")
    for name, table, _condition in reversed(_CHECKS):
        op.drop_constraint(name, table, type_="check")
