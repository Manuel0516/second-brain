"""Add Finance official guidance, typed tool audit and proposal records.

Revision ID: 033
Revises: 032
"""

import sqlalchemy as sa

from alembic import op

revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "finance_guidance_sources",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("jurisdiction", sa.String(2), nullable=True),
        sa.Column("tax_year", sa.Integer(), nullable=True),
        sa.Column("publisher", sa.String(255), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("published_or_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accessed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("source_policy", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "url",
            "content_hash",
            "accessed_at",
            name="uq_finance_guidance_access",
        ),
    )

    op.create_table(
        "finance_tool_audits",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("tool_name", sa.String(100), nullable=False),
        sa.Column("permission_class", sa.String(16), nullable=False),
        sa.Column("scope", sa.JSON(), nullable=False),
        sa.Column("arguments_hash", sa.String(64), nullable=False),
        sa.Column("result_metadata", sa.JSON(), nullable=False),
        sa.Column("citations", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "permission_class IN ('read','calculate','research','propose')",
            name="ck_finance_tool_audit_permission",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_finance_tool_audits_user_created",
        "finance_tool_audits",
        ["user_id", "created_at"],
    )

    op.create_table(
        "finance_assistant_proposals",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("proposal_type", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("scope", sa.JSON(), nullable=False),
        sa.Column("before", sa.JSON(), nullable=False),
        sa.Column("after", sa.JSON(), nullable=False),
        sa.Column("affected_record_count", sa.Integer(), nullable=False),
        sa.Column("impacted_report_ids", sa.JSON(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("citations", sa.JSON(), nullable=False),
        sa.Column("confirmation_token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "proposal_type IN "
            "('event_classification','review_policy','open_question','export_note')",
            name="ck_finance_assistant_proposal_type",
        ),
        sa.CheckConstraint(
            "status IN ('pending','confirmed','rejected','expired')",
            name="ck_finance_assistant_proposal_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_finance_assistant_proposals_user_status",
        "finance_assistant_proposals",
        ["user_id", "status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_finance_assistant_proposals_user_status",
        table_name="finance_assistant_proposals",
    )
    op.drop_table("finance_assistant_proposals")
    op.drop_index("ix_finance_tool_audits_user_created", table_name="finance_tool_audits")
    op.drop_table("finance_tool_audits")
    op.drop_table("finance_guidance_sources")
