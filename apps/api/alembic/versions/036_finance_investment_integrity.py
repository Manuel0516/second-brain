"""Validate reconciliation and investment subledger integrity.

Revision ID: 036
Revises: 035
"""

from collections.abc import Sequence

from alembic import op

revision = "036"
down_revision = "035"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for name, table, condition in (
        (
            "ck_finance_transfer_matches_distinct",
            "finance_transfer_matches",
            "outgoing_revision_id <> incoming_revision_id",
        ),
        (
            "ck_finance_transfer_matches_score",
            "finance_transfer_matches",
            "score >= 0 AND score <= 1",
        ),
        (
            "ck_finance_transfer_matches_fee",
            "finance_transfer_matches",
            "fee_quantity >= 0",
        ),
        (
            "ck_finance_reconciliations_period",
            "finance_reconciliations",
            "period_end >= period_start",
        ),
        (
            "ck_finance_reconciliations_tolerance",
            "finance_reconciliations",
            "tolerance >= 0",
        ),
        ("ck_finance_lots_cost_basis", "finance_lots", "cost_basis >= 0"),
        (
            "ck_finance_position_leverage",
            "finance_position_revisions",
            "leverage > 0",
        ),
        ("ck_finance_position_size", "finance_position_revisions", "size >= 0"),
        (
            "ck_finance_position_collateral",
            "finance_position_revisions",
            "collateral >= 0",
        ),
        (
            "ck_finance_position_period",
            "finance_position_revisions",
            "closed_at IS NULL OR closed_at >= opened_at",
        ),
    ):
        op.create_check_constraint(name, table, condition)

    op.execute(
        """
        CREATE FUNCTION validate_finance_investment_lineage()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            owner_a uuid;
            owner_b uuid;
            owner_c uuid;
            related_id uuid;
        BEGIN
            IF TG_TABLE_NAME = 'finance_transfer_matches' THEN
                SELECT user_id INTO owner_a FROM finance_event_revisions
                 WHERE id = NEW.outgoing_revision_id;
                SELECT user_id INTO owner_b FROM finance_event_revisions
                 WHERE id = NEW.incoming_revision_id;
                IF owner_a IS DISTINCT FROM NEW.user_id OR owner_b IS DISTINCT FROM NEW.user_id
                THEN
                    RAISE EXCEPTION 'finance transfer match owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_reconciliations' THEN
                SELECT user_id INTO owner_a FROM finance_accounts WHERE id = NEW.account_id;
                SELECT user_id INTO owner_b FROM finance_assets WHERE id = NEW.asset_id;
                IF owner_a IS DISTINCT FROM NEW.user_id
                   OR (NEW.asset_id IS NOT NULL AND owner_b IS DISTINCT FROM NEW.user_id)
                THEN
                    RAISE EXCEPTION 'finance reconciliation owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
                IF EXISTS (
                    SELECT 1
                      FROM json_array_elements_text(NEW.source_revision_ids)
                           AS source(source_id)
                      LEFT JOIN finance_event_revisions revision
                        ON revision.id = source.source_id::uuid
                      LEFT JOIN finance_events event
                        ON event.current_revision_id = revision.id
                     WHERE revision.id IS NULL
                        OR revision.user_id IS DISTINCT FROM NEW.user_id
                        OR revision.status <> 'confirmed'
                        OR event.id IS NULL
                        OR revision.tax_date < NEW.period_start
                        OR revision.tax_date > NEW.period_end
                ) THEN
                    RAISE EXCEPTION 'finance reconciliation source lineage mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_review_groups' THEN
                SELECT user_id INTO owner_a FROM finance_accounts WHERE id = NEW.account_id;
                SELECT user_id INTO owner_b FROM finance_assets WHERE id = NEW.asset_id;
                SELECT user_id INTO owner_c FROM finance_review_groups
                 WHERE id = NEW.supersedes_group_id;
                IF owner_a IS DISTINCT FROM NEW.user_id OR owner_b IS DISTINCT FROM NEW.user_id
                   OR (NEW.supersedes_group_id IS NOT NULL
                       AND owner_c IS DISTINCT FROM NEW.user_id)
                THEN
                    RAISE EXCEPTION 'finance review group owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_lots' THEN
                SELECT user_id INTO owner_a FROM finance_accounts WHERE id = NEW.account_id;
                SELECT user_id INTO owner_b FROM finance_assets WHERE id = NEW.asset_id;
                SELECT user_id INTO owner_c FROM finance_event_revisions
                 WHERE id = NEW.acquisition_revision_id;
                IF owner_a IS DISTINCT FROM NEW.user_id OR owner_b IS DISTINCT FROM NEW.user_id
                   OR owner_c IS DISTINCT FROM NEW.user_id
                THEN
                    RAISE EXCEPTION 'finance lot owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
                IF NEW.acquisition_valuation_id IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM finance_valuations
                     WHERE id = NEW.acquisition_valuation_id AND user_id = NEW.user_id
                ) THEN
                    RAISE EXCEPTION 'finance lot valuation owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_lot_disposals' THEN
                SELECT user_id INTO owner_a FROM finance_lots WHERE id = NEW.lot_id;
                SELECT user_id INTO owner_b FROM finance_event_revisions
                 WHERE id = NEW.disposal_revision_id;
                IF owner_a IS DISTINCT FROM NEW.user_id OR owner_b IS DISTINCT FROM NEW.user_id
                THEN
                    RAISE EXCEPTION 'finance lot disposal owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_positions' THEN
                SELECT user_id INTO owner_a FROM finance_accounts WHERE id = NEW.account_id;
                SELECT user_id INTO owner_b FROM finance_assets WHERE id = NEW.asset_id;
                IF owner_a IS DISTINCT FROM NEW.user_id OR owner_b IS DISTINCT FROM NEW.user_id
                THEN
                    RAISE EXCEPTION 'finance position owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
                IF NEW.current_revision_id IS NOT NULL THEN
                    SELECT user_id, position_id INTO owner_c, related_id
                      FROM finance_position_revisions WHERE id = NEW.current_revision_id;
                    IF owner_c IS DISTINCT FROM NEW.user_id OR related_id IS DISTINCT FROM NEW.id
                    THEN
                        RAISE EXCEPTION 'finance position current revision mismatch'
                            USING ERRCODE = 'integrity_constraint_violation';
                    END IF;
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_position_revisions' THEN
                SELECT user_id INTO owner_a FROM finance_positions WHERE id = NEW.position_id;
                IF owner_a IS DISTINCT FROM NEW.user_id THEN
                    RAISE EXCEPTION 'finance position revision owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            ELSIF TG_TABLE_NAME = 'finance_bot_equity_snapshots' THEN
                SELECT user_id INTO owner_a FROM finance_accounts WHERE id = NEW.account_id;
                IF owner_a IS DISTINCT FROM NEW.user_id THEN
                    RAISE EXCEPTION 'finance bot equity owner mismatch'
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    for table in (
        "finance_transfer_matches",
        "finance_reconciliations",
        "finance_review_groups",
        "finance_lots",
        "finance_lot_disposals",
        "finance_positions",
        "finance_position_revisions",
        "finance_bot_equity_snapshots",
    ):
        op.execute(
            f"""
            CREATE CONSTRAINT TRIGGER trg_{table}_investment_lineage
            AFTER INSERT OR UPDATE ON {table}
            DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION validate_finance_investment_lineage();
            """
        )


def downgrade() -> None:
    for table in reversed(
        (
            "finance_transfer_matches",
            "finance_reconciliations",
            "finance_review_groups",
            "finance_lots",
            "finance_lot_disposals",
            "finance_positions",
            "finance_position_revisions",
            "finance_bot_equity_snapshots",
        )
    ):
        op.execute(f"DROP TRIGGER trg_{table}_investment_lineage ON {table}")
    op.execute("DROP FUNCTION validate_finance_investment_lineage()")
    for name, table in reversed(
        (
            (
                "ck_finance_transfer_matches_distinct",
                "finance_transfer_matches",
            ),
            ("ck_finance_transfer_matches_score", "finance_transfer_matches"),
            ("ck_finance_transfer_matches_fee", "finance_transfer_matches"),
            ("ck_finance_reconciliations_period", "finance_reconciliations"),
            (
                "ck_finance_reconciliations_tolerance",
                "finance_reconciliations",
            ),
            ("ck_finance_lots_cost_basis", "finance_lots"),
            ("ck_finance_position_leverage", "finance_position_revisions"),
            ("ck_finance_position_size", "finance_position_revisions"),
            ("ck_finance_position_collateral", "finance_position_revisions"),
            ("ck_finance_position_period", "finance_position_revisions"),
        )
    ):
        op.drop_constraint(name, table, type_="check")
