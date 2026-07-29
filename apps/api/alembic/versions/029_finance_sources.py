"""Add Finance registries, immutable sources, evidence and audit foundations.

Revision ID: 029
Revises: 028
"""

import sqlalchemy as sa

from alembic import op

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "finance_accounts",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("institution", sa.String(255), nullable=False),
        sa.Column("account_type", sa.String(20), nullable=False),
        sa.Column("country_code", sa.String(2), nullable=False),
        sa.Column("base_currency", sa.String(3), nullable=False),
        sa.Column("tax_jurisdiction", sa.String(2), nullable=True),
        sa.Column("external_reference_encrypted", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("status", sa.String(16), server_default="active", nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "account_type IN ('bank','broker','exchange','wallet','bot','cash')",
            name="ck_finance_accounts_type",
        ),
        sa.CheckConstraint("status IN ('active','closed')", name="ck_finance_accounts_status"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_finance_accounts_user_status", "finance_accounts", ["user_id", "status"])

    op.create_table(
        "finance_assets",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("asset_type", sa.String(20), nullable=False),
        sa.Column("symbol", sa.String(32), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("isin", sa.String(12), nullable=True),
        sa.Column("chain_id", sa.String(100), nullable=True),
        sa.Column("contract_address", sa.String(255), nullable=True),
        sa.Column("issuer_country", sa.String(2), nullable=True),
        sa.Column("decimals", sa.Integer(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "asset_type IN ('fiat','fund','etf','stock','gold','crypto','derivative','other')",
            name="ck_finance_assets_type",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "isin", name="uq_finance_assets_user_isin"),
        sa.UniqueConstraint(
            "user_id",
            "chain_id",
            "contract_address",
            name="uq_finance_assets_user_contract",
        ),
    )
    op.create_index("ix_finance_assets_user_symbol", "finance_assets", ["user_id", "symbol"])

    op.create_table(
        "finance_source_connections",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("account_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("credential_reference_encrypted", sa.Text(), nullable=True),
        sa.Column("permission_scope", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(16), server_default="disabled", nullable=False),
        sa.Column("last_cursor", sa.Text(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_summary", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('disabled','active','error','revoked')",
            name="ck_finance_source_connections_status",
        ),
        sa.ForeignKeyConstraint(["account_id"], ["finance_accounts.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "account_id",
            "provider",
            name="uq_finance_source_connection",
        ),
    )

    op.create_table(
        "finance_evidence_documents",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("file_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("media_type", sa.String(100), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("object_version", sa.String(255), nullable=False),
        sa.Column("source_kind", sa.String(50), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("coverage_start", sa.Date(), nullable=True),
        sa.Column("coverage_end", sa.Date(), nullable=True),
        sa.Column("parser_id", sa.String(100), nullable=True),
        sa.Column("parser_version", sa.String(50), nullable=True),
        sa.Column(
            "extraction_status",
            sa.String(20),
            server_default="not_requested",
            nullable=False,
        ),
        sa.Column("retention_status", sa.String(20), server_default="immutable", nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "extraction_status IN ('not_requested','pending','complete','failed')",
            name="ck_finance_evidence_extraction",
        ),
        sa.CheckConstraint(
            "retention_status = 'immutable'",
            name="ck_finance_evidence_retention",
        ),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("file_id"),
        sa.UniqueConstraint("user_id", "sha256", name="uq_finance_evidence_user_hash"),
    )
    op.create_index(
        "ix_finance_evidence_user_created",
        "finance_evidence_documents",
        ["user_id", "created_at"],
    )

    op.create_table(
        "finance_imports",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("account_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("evidence_document_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("parser_id", sa.String(100), nullable=False),
        sa.Column("parser_version", sa.String(50), nullable=False),
        sa.Column("import_mode", sa.String(16), nullable=False),
        sa.Column("import_fingerprint", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("coverage_start", sa.Date(), nullable=True),
        sa.Column("coverage_end", sa.Date(), nullable=True),
        sa.Column("mapping", sa.JSON(), nullable=False),
        sa.Column("preview", sa.JSON(), nullable=False),
        sa.Column("error_summary", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("committed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN "
            "('previewed','committed','committed_with_rejections','reprocessed','failed')",
            name="ck_finance_imports_status",
        ),
        sa.CheckConstraint(
            "import_mode IN ('normal','reprocess')",
            name="ck_finance_imports_mode",
        ),
        sa.ForeignKeyConstraint(["account_id"], ["finance_accounts.id"]),
        sa.ForeignKeyConstraint(["evidence_document_id"], ["finance_evidence_documents.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "import_fingerprint", name="uq_finance_import_fingerprint"),
    )
    op.create_index("ix_finance_imports_user_created", "finance_imports", ["user_id", "created_at"])

    op.create_table(
        "finance_raw_records",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("import_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("source_index", sa.String(100), nullable=False),
        sa.Column("provider_external_id", sa.String(255), nullable=True),
        sa.Column("record_fingerprint", sa.String(64), nullable=False),
        sa.Column("semantic_fingerprint", sa.String(64), nullable=True),
        sa.Column("original_payload", sa.JSON(), nullable=False),
        sa.Column("extracted_payload", sa.JSON(), nullable=True),
        sa.Column("source_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_timezone", sa.String(63), nullable=True),
        sa.Column("rejection_code", sa.String(100), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["import_id"], ["finance_imports.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "import_id",
            "record_fingerprint",
            name="uq_finance_raw_record_fingerprint",
        ),
        sa.UniqueConstraint(
            "user_id",
            "provider_external_id",
            name="uq_finance_raw_record_provider_external_id",
        ),
    )
    op.create_index(
        "ix_finance_raw_records_semantic_fingerprint",
        "finance_raw_records",
        ["semantic_fingerprint"],
    )
    op.create_index(
        "ix_finance_raw_records_user_import",
        "finance_raw_records",
        ["user_id", "import_id"],
    )

    op.create_table(
        "finance_audit_heads",
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("last_entry_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("last_hash", sa.String(64), nullable=False),
        sa.Column("next_sequence", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )

    op.create_table(
        "finance_audit_entries",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("actor_type", sa.String(32), nullable=False),
        sa.Column("actor_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("prior_revision_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("new_revision_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("previous_hash", sa.String(64), nullable=False),
        sa.Column("entry_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entry_hash", name="uq_finance_audit_entry_hash"),
        sa.UniqueConstraint("user_id", "sequence", name="uq_finance_audit_user_sequence"),
    )
    op.create_index(
        "ix_finance_audit_entity",
        "finance_audit_entries",
        ["user_id", "entity_type", "entity_id"],
    )

    op.create_table(
        "finance_idempotency_keys",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("workflow", sa.String(100), nullable=False),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("response_body", sa.JSON(), nullable=False),
        sa.Column("entity_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("audit_entry_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "workflow", "key", name="uq_finance_idempotency_scope"),
    )


def downgrade() -> None:
    op.drop_table("finance_idempotency_keys")
    op.drop_index("ix_finance_audit_entity", table_name="finance_audit_entries")
    op.drop_table("finance_audit_entries")
    op.drop_table("finance_audit_heads")
    op.drop_index("ix_finance_raw_records_user_import", table_name="finance_raw_records")
    op.drop_index(
        "ix_finance_raw_records_semantic_fingerprint",
        table_name="finance_raw_records",
    )
    op.drop_table("finance_raw_records")
    op.drop_index("ix_finance_imports_user_created", table_name="finance_imports")
    op.drop_table("finance_imports")
    op.drop_index(
        "ix_finance_evidence_user_created",
        table_name="finance_evidence_documents",
    )
    op.drop_table("finance_evidence_documents")
    op.drop_table("finance_source_connections")
    op.drop_index("ix_finance_assets_user_symbol", table_name="finance_assets")
    op.drop_table("finance_assets")
    op.drop_index("ix_finance_accounts_user_status", table_name="finance_accounts")
    op.drop_table("finance_accounts")
