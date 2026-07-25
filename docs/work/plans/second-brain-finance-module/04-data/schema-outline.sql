-- Conceptual outline for the existing apps/api SQLAlchemy + Alembic schema.
-- This is not a production migration. Add owner FKs, indexes, checks and constraints in
-- numbered migrations after the first fixture-driven vertical slice is approved.

create table finance_accounts (
  id uuid primary key,
  user_id uuid not null references users(id),
  name text not null,
  institution text not null,
  account_type text not null,
  country_code text not null,
  base_currency text not null,
  tax_jurisdiction text,
  external_reference_encrypted text,
  provider text not null default 'manual',
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table finance_assets (
  id uuid primary key,
  user_id uuid not null references users(id),
  asset_type text not null,
  symbol text,
  name text not null,
  isin text,
  chain_id text,
  contract_address text,
  decimals integer,
  metadata jsonb not null default '{}'::jsonb
);

create table finance_imports (
  id uuid primary key,
  user_id uuid not null references users(id),
  account_id uuid not null references finance_accounts(id),
  file_id uuid references files(id),
  content_sha256 text not null,
  parser_id text not null,
  parser_version text not null,
  import_fingerprint text not null,
  status text not null,
  coverage_start date,
  coverage_end date,
  mapping jsonb not null default '{}'::jsonb,
  error_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, import_fingerprint)
);

create table finance_raw_records (
  id uuid primary key,
  import_id uuid not null references finance_imports(id),
  source_index text not null,
  provider_external_id text,
  record_fingerprint text not null,
  original_payload jsonb not null,
  extracted_payload jsonb,
  source_timestamp timestamptz,
  source_timezone text,
  rejection_reason text,
  unique (import_id, record_fingerprint)
);

create table finance_events (
  id uuid primary key,
  user_id uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table finance_event_revisions (
  id uuid primary key,
  event_id uuid not null references finance_events(id),
  revision integer not null check (revision > 0),
  event_type text not null,
  effective_at timestamptz not null,
  source_local_time text,
  source_timezone text,
  source_account_id uuid not null references finance_accounts(id),
  status text not null check (status in ('proposed','confirmed','superseded','voided')),
  derivation_type text not null,
  derivation_version text not null,
  supersedes_revision_id uuid references finance_event_revisions(id),
  created_by_type text not null,
  created_by_id uuid,
  created_at timestamptz not null default now(),
  unique (event_id, revision)
);

create table finance_event_components (
  id uuid primary key,
  event_revision_id uuid not null references finance_event_revisions(id),
  role text not null,
  account_id uuid references finance_accounts(id),
  asset_id uuid not null references finance_assets(id),
  quantity numeric(38,18) not null,
  fiat_value numeric(24,8),
  currency text,
  metadata jsonb not null default '{}'::jsonb
);

create table finance_postings (
  id uuid primary key,
  event_revision_id uuid not null references finance_event_revisions(id),
  ledger_account_id uuid not null references finance_accounts(id),
  asset_id uuid not null references finance_assets(id),
  quantity numeric(38,18) not null,
  fiat_value numeric(24,8),
  posting_role text not null,
  created_at timestamptz not null default now()
);

create table finance_tax_treatments (
  id uuid primary key,
  event_revision_id uuid not null references finance_event_revisions(id),
  tax_profile_id uuid not null,
  jurisdiction text not null,
  tax_year integer not null,
  ruleset_id text,
  ruleset_version text,
  category text not null,
  status text not null check (status in ('candidate','confirmed','rejected','superseded')),
  inputs jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  rationale text,
  confirmed_by uuid references users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table finance_audit_entries (
  id uuid primary key,
  user_id uuid not null references users(id),
  actor_type text not null,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  prior_revision_id uuid,
  new_revision_id uuid,
  reason text,
  request_hash text,
  previous_hash text,
  entry_hash text not null,
  created_at timestamptz not null default now()
);

-- Add evidence/review/reconciliation/lot/position/valuation/report tables and targeted
-- constraints in later migrations once representative fixtures lock their columns.
