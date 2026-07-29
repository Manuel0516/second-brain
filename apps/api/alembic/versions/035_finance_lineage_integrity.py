"""Preserve reusable valuation lineage and validate ledger ownership.

Revision ID: 035
Revises: 034
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "035"
down_revision = "034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "finance_revision_valuations",
        sa.Column(
            "event_revision_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("finance_event_revisions.id"),
            primary_key=True,
        ),
        sa.Column(
            "valuation_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("finance_valuations.id"),
            primary_key=True,
        ),
    )
    op.execute(
        """
        INSERT INTO finance_revision_valuations (event_revision_id, valuation_id)
        SELECT event_revision_id, id
        FROM finance_valuations
        WHERE event_revision_id IS NOT NULL
        """
    )
    op.add_column(
        "finance_review_groups",
        sa.Column("supersedes_group_id", postgresql.UUID(as_uuid=False), nullable=True),
    )
    op.create_foreign_key(
        "fk_finance_review_groups_supersedes",
        "finance_review_groups",
        "finance_review_groups",
        ["supersedes_group_id"],
        ["id"],
    )
    op.create_index(
        "ix_finance_review_groups_supersedes",
        "finance_review_groups",
        ["supersedes_group_id"],
    )
    op.drop_constraint(
        "uq_finance_review_group_member_revision",
        "finance_review_group_members",
        type_="unique",
    )
    op.create_check_constraint(
        "ck_finance_tax_profile_materiality_nonnegative",
        "finance_tax_profiles",
        "materiality_threshold >= 0",
    )
    op.create_check_constraint(
        "ck_finance_tax_profile_tolerance_nonnegative",
        "finance_tax_profiles",
        "reconciliation_tolerance >= 0",
    )
    op.create_check_constraint(
        "ck_finance_residency_fact_period",
        "finance_residency_facts",
        "period_end IS NULL OR period_start IS NULL OR period_end >= period_start",
    )
    op.create_check_constraint(
        "ck_finance_tax_treatment_revision_number",
        "finance_tax_treatment_revisions",
        "revision_number > 0",
    )
    op.create_check_constraint(
        "ck_finance_tax_treatment_confirmation",
        "finance_tax_treatment_revisions",
        "(status = 'confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL) "
        "OR (status <> 'confirmed' AND confirmed_by IS NULL AND confirmed_at IS NULL)",
    )
    op.create_check_constraint(
        "ck_finance_report_run_file_state",
        "finance_report_runs",
        "(status = 'blocked' AND file_id IS NULL AND file_sha256 IS NULL) OR "
        "(status IN ('ready','ready_with_warnings') AND file_id IS NOT NULL "
        "AND file_sha256 IS NOT NULL)",
    )
    op.execute(
        "UPDATE finance_report_inputs SET input_hash = repeat('0', 64) WHERE input_hash IS NULL"
    )
    op.alter_column(
        "finance_report_inputs",
        "input_hash",
        existing_type=sa.String(length=64),
        nullable=False,
    )
    op.create_check_constraint(
        "ck_finance_assistant_proposal_resolution",
        "finance_assistant_proposals",
        "(status = 'pending' AND resolved_at IS NULL) OR "
        "(status <> 'pending' AND resolved_at IS NOT NULL)",
    )
    op.create_check_constraint(
        "ck_finance_assistant_proposal_affected_count",
        "finance_assistant_proposals",
        "affected_record_count >= 0",
    )

    for table in ("finance_revision_valuations", "finance_review_group_members"):
        op.execute(
            f"""
            CREATE TRIGGER trg_{table}_append_only
            BEFORE UPDATE OR DELETE ON {table}
            FOR EACH ROW EXECUTE FUNCTION prevent_finance_history_change();
            """
        )

    op.execute(
        """
        CREATE FUNCTION validate_finance_owner_lineage()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            owner_a uuid;
            owner_b uuid;
            owner_c uuid;
        BEGIN
            IF TG_TABLE_NAME = 'finance_event_revisions' THEN
                SELECT user_id INTO owner_a FROM finance_events WHERE id = NEW.event_id;
                SELECT user_id INTO owner_b FROM finance_accounts WHERE id = NEW.source_account_id;
                IF owner_a IS DISTINCT FROM NEW.user_id OR owner_b IS DISTINCT FROM NEW.user_id THEN
                    RAISE EXCEPTION 'finance event revision owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_event_components' THEN
                SELECT user_id INTO owner_a FROM finance_event_revisions
                    WHERE id = NEW.event_revision_id;
                SELECT user_id INTO owner_b FROM finance_assets WHERE id = NEW.asset_id;
                SELECT user_id INTO owner_c FROM finance_accounts WHERE id = NEW.account_id;
                IF owner_a IS DISTINCT FROM NEW.user_id OR owner_b IS DISTINCT FROM NEW.user_id
                   OR (NEW.account_id IS NOT NULL AND owner_c IS DISTINCT FROM NEW.user_id) THEN
                    RAISE EXCEPTION 'finance component owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_postings' THEN
                SELECT user_id INTO owner_a FROM finance_event_revisions
                    WHERE id = NEW.event_revision_id;
                SELECT user_id INTO owner_b FROM finance_assets WHERE id = NEW.asset_id;
                SELECT user_id INTO owner_c FROM finance_accounts WHERE id = NEW.account_id;
                IF owner_a IS DISTINCT FROM NEW.user_id OR owner_b IS DISTINCT FROM NEW.user_id
                   OR (NEW.account_id IS NOT NULL AND owner_c IS DISTINCT FROM NEW.user_id) THEN
                    RAISE EXCEPTION 'finance posting owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_valuations' THEN
                SELECT user_id INTO owner_a FROM finance_assets WHERE id = NEW.asset_id;
                SELECT user_id INTO owner_b FROM finance_event_revisions
                    WHERE id = NEW.event_revision_id;
                IF owner_a IS DISTINCT FROM NEW.user_id
                   OR (NEW.event_revision_id IS NOT NULL AND owner_b IS DISTINCT FROM NEW.user_id)
                THEN
                    RAISE EXCEPTION 'finance valuation owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_revision_raw_records' THEN
                SELECT user_id INTO owner_a FROM finance_event_revisions
                    WHERE id = NEW.event_revision_id;
                SELECT user_id INTO owner_b FROM finance_raw_records WHERE id = NEW.raw_record_id;
                IF owner_a IS DISTINCT FROM owner_b THEN
                    RAISE EXCEPTION 'finance raw lineage owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_revision_valuations' THEN
                SELECT user_id INTO owner_a FROM finance_event_revisions
                    WHERE id = NEW.event_revision_id;
                SELECT user_id INTO owner_b FROM finance_valuations WHERE id = NEW.valuation_id;
                IF owner_a IS DISTINCT FROM owner_b THEN
                    RAISE EXCEPTION 'finance valuation lineage owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_review_group_members' THEN
                SELECT user_id INTO owner_a FROM finance_review_groups WHERE id = NEW.group_id;
                SELECT user_id INTO owner_b FROM finance_event_revisions
                    WHERE id = NEW.event_revision_id;
                IF owner_a IS DISTINCT FROM owner_b THEN
                    RAISE EXCEPTION 'finance review membership owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    for table in (
        "finance_event_revisions",
        "finance_event_components",
        "finance_postings",
        "finance_valuations",
        "finance_revision_raw_records",
        "finance_revision_valuations",
        "finance_review_group_members",
    ):
        op.execute(
            f"""
            CREATE CONSTRAINT TRIGGER trg_{table}_owner_lineage
            AFTER INSERT OR UPDATE ON {table}
            DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION validate_finance_owner_lineage();
            """
        )

    op.execute(
        """
        CREATE FUNCTION validate_finance_current_event()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            revision_status text;
            revision_owner uuid;
            revision_event uuid;
        BEGIN
            IF NEW.current_revision_id IS NULL THEN
                RETURN NEW;
            END IF;
            SELECT status, user_id, event_id
              INTO revision_status, revision_owner, revision_event
              FROM finance_event_revisions
             WHERE id = NEW.current_revision_id;
            IF revision_owner IS DISTINCT FROM NEW.user_id OR revision_event IS DISTINCT FROM NEW.id
            THEN
                RAISE EXCEPTION 'finance current revision owner or event mismatch'
                    USING ERRCODE = 'integrity_constraint_violation';
            END IF;
            IF revision_status = 'confirmed' THEN
                IF NOT EXISTS (
                    SELECT 1 FROM finance_postings
                     WHERE event_revision_id = NEW.current_revision_id
                ) THEN
                    RAISE EXCEPTION 'confirmed finance revision requires postings'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
                IF EXISTS (
                    SELECT asset_id
                      FROM finance_postings
                     WHERE event_revision_id = NEW.current_revision_id
                     GROUP BY asset_id
                    HAVING sum(quantity) <> 0
                ) THEN
                    RAISE EXCEPTION 'confirmed finance revision has unbalanced asset postings'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
                IF EXISTS (
                    SELECT currency
                      FROM finance_postings
                     WHERE event_revision_id = NEW.current_revision_id
                       AND fiat_value IS NOT NULL
                     GROUP BY currency
                    HAVING sum(fiat_value) <> 0
                ) THEN
                    RAISE EXCEPTION 'confirmed finance revision has unbalanced currency postings'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    op.execute(
        """
        CREATE CONSTRAINT TRIGGER trg_finance_events_current_integrity
        AFTER INSERT OR UPDATE OF current_revision_id ON finance_events
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION validate_finance_current_event();
        """
    )

    op.execute(
        """
        CREATE FUNCTION validate_finance_tax_report_lineage()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            owner_a uuid;
            owner_b uuid;
            owner_c uuid;
            related_id uuid;
        BEGIN
            IF TG_TABLE_NAME = 'finance_residency_facts' THEN
                SELECT user_id INTO owner_a FROM finance_tax_profiles
                 WHERE id = NEW.tax_profile_id;
                IF owner_a IS DISTINCT FROM NEW.user_id THEN
                    RAISE EXCEPTION 'finance residency profile owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_tax_treatments' THEN
                SELECT user_id INTO owner_a FROM finance_event_revisions
                 WHERE id = NEW.event_revision_id;
                SELECT user_id INTO owner_b FROM finance_tax_profiles
                 WHERE id = NEW.tax_profile_id;
                IF owner_a IS DISTINCT FROM NEW.user_id OR owner_b IS DISTINCT FROM NEW.user_id
                THEN
                    RAISE EXCEPTION 'finance tax treatment owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
                IF NEW.current_revision_id IS NOT NULL THEN
                    SELECT user_id, treatment_id INTO owner_c, related_id
                      FROM finance_tax_treatment_revisions
                     WHERE id = NEW.current_revision_id;
                    IF owner_c IS DISTINCT FROM NEW.user_id OR related_id IS DISTINCT FROM NEW.id
                    THEN
                        RAISE EXCEPTION 'finance tax treatment current revision mismatch'
                            USING ERRCODE = 'integrity_constraint_violation';
                    END IF;
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_tax_treatment_revisions' THEN
                SELECT user_id INTO owner_a FROM finance_tax_treatments
                 WHERE id = NEW.treatment_id;
                SELECT user_id INTO owner_b FROM finance_event_revisions
                 WHERE id = NEW.event_revision_id;
                SELECT user_id INTO owner_c FROM finance_tax_profiles
                 WHERE id = NEW.tax_profile_id;
                IF owner_a IS DISTINCT FROM NEW.user_id OR owner_b IS DISTINCT FROM NEW.user_id
                   OR owner_c IS DISTINCT FROM NEW.user_id THEN
                    RAISE EXCEPTION 'finance tax treatment revision owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_report_runs' THEN
                SELECT user_id INTO owner_a FROM finance_tax_profiles
                 WHERE id = NEW.tax_profile_id;
                IF owner_a IS DISTINCT FROM NEW.user_id THEN
                    RAISE EXCEPTION 'finance report profile owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
                IF NEW.file_id IS NOT NULL THEN
                    SELECT user_id INTO owner_b FROM files WHERE id = NEW.file_id;
                    IF owner_b IS DISTINCT FROM NEW.user_id THEN
                        RAISE EXCEPTION 'finance report file owner mismatch'
                            USING ERRCODE = 'integrity_constraint_violation';
                    END IF;
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    for table in (
        "finance_residency_facts",
        "finance_tax_treatments",
        "finance_tax_treatment_revisions",
        "finance_report_runs",
    ):
        op.execute(
            f"""
            CREATE CONSTRAINT TRIGGER trg_{table}_tax_report_lineage
            AFTER INSERT OR UPDATE ON {table}
            DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION validate_finance_tax_report_lineage();
            """
        )

    op.execute(
        """
        CREATE FUNCTION protect_finance_assistant_proposal()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF TG_OP = 'DELETE' OR OLD.status <> 'pending' OR NEW.status = 'pending'
               OR NEW.user_id IS DISTINCT FROM OLD.user_id
               OR NEW.proposal_type IS DISTINCT FROM OLD.proposal_type
               OR NEW.scope IS DISTINCT FROM OLD.scope
               OR NEW.before IS DISTINCT FROM OLD.before
               OR NEW.after IS DISTINCT FROM OLD.after
               OR NEW.affected_record_count IS DISTINCT FROM OLD.affected_record_count
               OR NEW.impacted_report_ids IS DISTINCT FROM OLD.impacted_report_ids
               OR NEW.rationale IS DISTINCT FROM OLD.rationale
               OR NEW.citations IS DISTINCT FROM OLD.citations
               OR NEW.confirmation_token_hash IS DISTINCT FROM OLD.confirmation_token_hash
               OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
               OR NEW.created_at IS DISTINCT FROM OLD.created_at
               OR NEW.resolved_at IS NULL
            THEN
                RAISE EXCEPTION 'finance assistant proposal history is immutable'
                    USING ERRCODE = 'integrity_constraint_violation';
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_finance_assistant_proposals_protect
        BEFORE UPDATE OR DELETE ON finance_assistant_proposals
        FOR EACH ROW EXECUTE FUNCTION protect_finance_assistant_proposal();
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER trg_finance_assistant_proposals_protect ON finance_assistant_proposals"
    )
    op.execute("DROP FUNCTION protect_finance_assistant_proposal()")
    for table in reversed(
        (
            "finance_residency_facts",
            "finance_tax_treatments",
            "finance_tax_treatment_revisions",
            "finance_report_runs",
        )
    ):
        op.execute(f"DROP TRIGGER trg_{table}_tax_report_lineage ON {table}")
    op.execute("DROP FUNCTION validate_finance_tax_report_lineage()")
    op.execute("DROP TRIGGER trg_finance_events_current_integrity ON finance_events")
    op.execute("DROP FUNCTION validate_finance_current_event()")
    for table in reversed(
        (
            "finance_event_revisions",
            "finance_event_components",
            "finance_postings",
            "finance_valuations",
            "finance_revision_raw_records",
            "finance_revision_valuations",
            "finance_review_group_members",
        )
    ):
        op.execute(f"DROP TRIGGER trg_{table}_owner_lineage ON {table}")
    op.execute("DROP FUNCTION validate_finance_owner_lineage()")
    for table in ("finance_revision_valuations", "finance_review_group_members"):
        op.execute(f"DROP TRIGGER trg_{table}_append_only ON {table}")
    op.drop_constraint(
        "ck_finance_assistant_proposal_affected_count",
        "finance_assistant_proposals",
        type_="check",
    )
    op.drop_constraint(
        "ck_finance_assistant_proposal_resolution",
        "finance_assistant_proposals",
        type_="check",
    )
    op.alter_column(
        "finance_report_inputs",
        "input_hash",
        existing_type=sa.String(length=64),
        nullable=True,
    )
    op.drop_constraint(
        "ck_finance_report_run_file_state",
        "finance_report_runs",
        type_="check",
    )
    op.drop_constraint(
        "ck_finance_tax_treatment_confirmation",
        "finance_tax_treatment_revisions",
        type_="check",
    )
    op.drop_constraint(
        "ck_finance_tax_treatment_revision_number",
        "finance_tax_treatment_revisions",
        type_="check",
    )
    op.drop_constraint(
        "ck_finance_residency_fact_period",
        "finance_residency_facts",
        type_="check",
    )
    op.drop_constraint(
        "ck_finance_tax_profile_tolerance_nonnegative",
        "finance_tax_profiles",
        type_="check",
    )
    op.drop_constraint(
        "ck_finance_tax_profile_materiality_nonnegative",
        "finance_tax_profiles",
        type_="check",
    )
    op.create_unique_constraint(
        "uq_finance_review_group_member_revision",
        "finance_review_group_members",
        ["event_revision_id"],
    )
    op.drop_index(
        "ix_finance_review_groups_supersedes",
        table_name="finance_review_groups",
    )
    op.drop_constraint(
        "fk_finance_review_groups_supersedes",
        "finance_review_groups",
        type_="foreignkey",
    )
    op.drop_column("finance_review_groups", "supersedes_group_id")
    op.drop_table("finance_revision_valuations")
