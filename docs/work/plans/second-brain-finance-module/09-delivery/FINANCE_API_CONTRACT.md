# Finance API contract

Date frozen: 2026-07-25
Status: frozen
Owner: Finance foundation lead

This is the public contract between the FastAPI Finance module and the React Finance module.
Backend implementation may add internal fields or tables, but it must not change these paths,
field meanings, status values or wire types without updating this document and the locked
frontend types in the same integration change.

## Wire rules

- All paths are same-origin `/api/finance/...` and use the existing authenticated cookie.
- Every route is owner-scoped through `Depends(get_current_user)`.
- JSON field names are `snake_case`.
- Money, quantities, rates, prices, balances, percentages, materiality and tax values are
  base-10 decimal strings matching `^-?[0-9]+(\.[0-9]+)?$`.
- IDs are UUID strings. Timestamps are timezone-aware ISO 8601 strings. Dates are
  ISO `YYYY-MM-DD`.
- `null` means known absence. Missing fields are not used to hide incomplete calculations.
- Every mutating workflow accepts an `Idempotency-Key` header. The key is scoped to the
  authenticated owner and workflow. Reuse with different request content returns `409`.
- Financial mutations return `audit` metadata. Event mutations additionally return the new
  event revision ID.
- Successful file downloads are represented by JSON download metadata pointing to the existing
  authenticated `/api/files/{id}` stream. Finance endpoints do not return untyped binary bodies.
- Errors use FastAPI's `{"detail": ...}` envelope and never expose SQL, credentials, object keys,
  local paths or stack traces.

## Frozen status unions

```ts
export type FinanceAccountType =
  | 'bank'
  | 'broker'
  | 'exchange'
  | 'wallet'
  | 'bot'
  | 'cash'

export type FinanceAssetType =
  | 'fiat'
  | 'fund'
  | 'etf'
  | 'stock'
  | 'gold'
  | 'crypto'
  | 'derivative'
  | 'other'

export type FinanceEventType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'trade'
  | 'staking_reward'
  | 'interest'
  | 'dividend'
  | 'funding_payment'
  | 'derivative_fill'
  | 'fee'
  | 'withholding'
  | 'corporate_action'
  | 'valuation_adjustment'
  | 'other'

export type ImportStatus =
  | 'previewed'
  | 'committed'
  | 'committed_with_rejections'
  | 'reprocessed'
  | 'failed'

export type EventRevisionStatus =
  | 'proposed'
  | 'confirmed'
  | 'superseded'
  | 'voided'

export type ReviewStatus = 'pending' | 'confirmed' | 'split' | 'deferred'
export type ReconciliationStatus = 'pending' | 'reconciled' | 'warning' | 'blocked'
export type TaxTreatmentStatus = 'candidate' | 'confirmed' | 'rejected' | 'superseded'
export type ReportStatus = 'ready' | 'ready_with_warnings' | 'blocked'
export type ProposalStatus = 'pending' | 'confirmed' | 'rejected' | 'expired'
export type WarningSeverity = 'info' | 'warning' | 'blocking'
```

## Shared shapes

```ts
export interface PageMeta {
  limit: number
  offset: number
  total: number
  has_more: boolean
}

export interface FinanceWarning {
  code: string
  severity: WarningSeverity
  message: string
  entity_type: string | null
  entity_id: string | null
}

export interface Completeness {
  is_complete: boolean
  warnings: FinanceWarning[]
  blockers: FinanceWarning[]
}

export interface AuditMetadata {
  audit_entry_id: string
  action: string
  entity_type: string
  entity_id: string
  prior_revision_id: string | null
  new_revision_id: string | null
  created_at: string
}

export interface DownloadMetadata {
  file_id: string
  file_name: string
  media_type: string
  size: number
  sha256: string
  download_url: string
}

export interface EmptyState {
  code: string
  title: string
  message: string
  next_action: string | null
}

export interface PagedResponse<T> {
  items: T[]
  page: PageMeta
  completeness: Completeness
  empty_state: EmptyState | null
}
```

Loading and upload progress are client states, not server records:

```ts
export type FinanceLoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'empty'; empty_state: EmptyState }
  | { status: 'error'; message: string; retryable: boolean }

export interface EvidenceUploadProgress {
  status: 'queued' | 'uploading' | 'processing' | 'complete' | 'rejected'
  bytes_sent: number
  bytes_total: number
  evidence_document_id: string | null
  error: FinanceUploadError | null
}

export interface FinanceUploadError {
  code:
    | 'unsupported_type'
    | 'extension_mismatch'
    | 'file_too_large'
    | 'archive_too_large'
    | 'archive_too_many_entries'
    | 'archive_unsafe_path'
    | 'hash_mismatch'
    | 'malformed_file'
  message: string
  retryable: boolean
}
```

Upload rejection responses use:

```json
{
  "detail": {
    "code": "unsupported_type",
    "message": "Unsupported Finance evidence type",
    "retryable": false
  }
}
```

## Core resource shapes

```ts
export interface FinanceAccount {
  id: string
  name: string
  institution: string
  account_type: FinanceAccountType
  country_code: string
  base_currency: string
  tax_jurisdiction: string | null
  provider: string
  status: 'active' | 'closed'
  opened_at: string | null
  closed_at: string | null
  last_imported_at: string | null
  created_at: string
  updated_at: string
}

export interface FinanceAccountCreate {
  name: string
  institution: string
  account_type: FinanceAccountType
  country_code: string
  base_currency: string
  tax_jurisdiction: string | null
  provider: string
  external_reference: string | null
  opened_at: string | null
}

export interface FinanceAsset {
  id: string
  asset_type: FinanceAssetType
  symbol: string | null
  name: string
  isin: string | null
  chain_id: string | null
  contract_address: string | null
  issuer_country: string | null
  decimals: number | null
  created_at: string
}

export interface FinanceAssetCreate {
  asset_type: FinanceAssetType
  symbol: string | null
  name: string
  isin: string | null
  chain_id: string | null
  contract_address: string | null
  issuer_country: string | null
  decimals: number | null
}

export interface FinanceEvidence {
  id: string
  file_id: string
  original_name: string
  media_type: string
  size: number
  sha256: string
  source_kind: string
  captured_at: string
  coverage_start: string | null
  coverage_end: string | null
  parser_id: string | null
  parser_version: string | null
  extraction_status: 'not_requested' | 'pending' | 'complete' | 'failed'
  retention_status: 'immutable'
  linked_event_revision_ids: string[]
  download_url: string
}
```

Sensitive external references and connector credentials are never returned.

## Overview and activity

### `GET /api/finance/summary`

Query:

```ts
{ tax_year: number; jurisdiction?: string; reporting_currency?: string }
```

Response:

```ts
export interface FinanceSummary {
  tax_year: number
  jurisdiction: string | null
  reporting_currency: string
  totals: {
    income: string
    expense: string
    rewards: string
    transfers: string
    net: string
    net_worth: string | null
  }
  counts: {
    accounts: number
    assets: number
    raw_records: number
    confirmed_events: number
    pending_review_groups: number
    blocking_reconciliations: number
    missing_evidence: number
  }
  readiness: ReportReadiness
  completeness: Completeness
  empty_state: EmptyState | null
}
```

### `GET /api/finance/activity`

Query:

```ts
{
  view?: 'grouped' | 'raw'
  from?: string
  to?: string
  account_id?: string
  asset_id?: string
  event_type?: FinanceEventType
  status?: EventRevisionStatus
  limit?: number
  offset?: number
}
```

Response is `PagedResponse<FinanceActivityItem>`.

```ts
export type FinanceActivityItem =
  | {
      representation: 'group'
      id: string
      review_status: ReviewStatus
      label: string
      event_type: FinanceEventType
      account_id: string
      asset_id: string
      tax_date: string
      first_effective_at: string
      last_effective_at: string
      member_count: number
      native_quantity: string
      report_value: string | null
      report_currency: string | null
      member_revision_ids: string[]
      completeness: Completeness
    }
  | {
      representation: 'raw'
      id: string
      event_id: string
      revision_number: number
      status: EventRevisionStatus
      event_type: FinanceEventType
      effective_at: string
      source_account_id: string
      native_quantity: string
      asset_id: string
      report_value: string | null
      report_currency: string | null
      raw_record_ids: string[]
      evidence_document_ids: string[]
      completeness: Completeness
    }
```

Grouping never replaces or omits `member_revision_ids`.

### `GET /api/finance/events/{event_id}/lineage`

Response:

```ts
export interface EventLineage {
  event_id: string
  current_revision_id: string | null
  revisions: Array<{
    id: string
    revision_number: number
    status: EventRevisionStatus
    event_type: FinanceEventType
    effective_at: string
    supersedes_revision_id: string | null
    raw_record_ids: string[]
    evidence_document_ids: string[]
    component_ids: string[]
    posting_ids: string[]
    valuation_ids: string[]
    audit_entry_ids: string[]
  }>
}
```

## Accounts, assets and sources

- `GET /api/finance/accounts` → `PagedResponse<FinanceAccount>`
- `POST /api/finance/accounts` with `FinanceAccountCreate` → `{account, audit}`
- `GET /api/finance/assets` → `PagedResponse<FinanceAsset>`
- `POST /api/finance/assets` with `FinanceAssetCreate` → `{asset, audit}`
- `GET /api/finance/source-connections` → owner-scoped redacted source summaries
- `POST /api/finance/source-connections` → redacted source summary plus `audit`

Account and asset creation require `Idempotency-Key`.

## Evidence and imports

### `POST /api/finance/evidence`

Multipart fields:

- `file`: required.
- `source_kind`: required string.
- `captured_at`: optional ISO timestamp.
- `coverage_start`, `coverage_end`: optional ISO dates.

Response `201`: `FinanceEvidence`.

Allowed media families are CSV, JSON, PDF, PNG, JPEG, WebP, ZIP and TAR. The backend validates
declared type, extension, size, signature where defined, archive member count, uncompressed size
and unsafe paths. Uploading the same owner/hash returns the existing evidence record.

### `GET /api/finance/evidence`

Returns `PagedResponse<FinanceEvidence>`.

### `POST /api/finance/imports/preview`

Request:

```ts
export interface ImportPreviewRequest {
  evidence_document_id: string
  account_id: string
  parser_id: 'csv' | 'json' | 'pdf_metadata' | 'image_metadata' | 'archive_manifest'
  parser_version: string
  import_mode: 'normal' | 'reprocess'
  mapping: {
    date_column?: string
    time_column?: string
    amount_column?: string
    quantity_column?: string
    asset_column?: string
    description_column?: string
    external_id_column?: string
    event_type_column?: string
    timezone?: string
    date_format?: string
    decimal_separator?: '.' | ','
  }
}
```

Response:

```ts
export interface ImportPreview {
  import_id: string
  status: 'previewed'
  parser_id: string
  parser_version: string
  import_fingerprint: string
  coverage_start: string | null
  coverage_end: string | null
  columns: string[]
  sample_rows: Array<Record<string, string | null>>
  expected_record_count: number
  duplicate_file: boolean
  duplicate_record_count: number
  rejected_record_count: number
  rejected_rows: Array<{ source_index: string; code: string; message: string }>
  mapping: ImportPreviewRequest['mapping']
  warnings: FinanceWarning[]
}
```

Preview stores immutable source/parser provenance but creates no postings.

### `POST /api/finance/imports/{import_id}/commit`

Request:

```ts
export interface ImportCommitRequest {
  mapping: ImportPreviewRequest['mapping']
  confirm_warnings: string[]
}
```

Response:

```ts
export interface ImportCommitResult {
  import_id: string
  status: ImportStatus
  raw_record_count: number
  created_event_count: number
  duplicate_record_count: number
  rejected_record_count: number
  raw_record_ids: string[]
  event_revision_ids: string[]
  review_group_ids: string[]
  audit: AuditMetadata
}
```

Repeating preview or commit with the same owner, source identity, parser version, mode and
idempotency key returns the prior result and never duplicates events or postings.

### Import inspection

- `GET /api/finance/imports` → paged import summaries.
- `GET /api/finance/imports/{id}/raw-records` → paged records including rejection reasons.

## Review and reconciliation

### `GET /api/finance/review-groups`

Returns `PagedResponse<ReviewGroup>`.

```ts
export interface ReviewGroup {
  id: string
  status: ReviewStatus
  grouping_rule_version: string
  label: string
  account_id: string
  asset_id: string
  event_type: FinanceEventType
  tax_date: string
  first_effective_at: string
  last_effective_at: string
  member_revision_ids: string[]
  member_count: number
  native_quantity: string
  report_value: string | null
  report_currency: string | null
  materiality: string
  evidence_coverage: string
  confidence_explanation: string
  candidate_treatment: string | null
  completeness: Completeness
}

export interface ReviewConfirmationPreview {
  group_id: string
  member_count: number
  before_status: ReviewStatus
  after_status: 'confirmed'
  posting_count: number
  native_quantity: string
  report_value: string | null
  reusable_policy: {
    will_create: boolean
    matching_fields: string[]
    applies_to_future_only: true
  }
  invalidated_report_ids: string[]
  warnings: FinanceWarning[]
}
```

### `POST /api/finance/review-groups/{id}/confirm`

Request:

```ts
{
  expected_member_revision_ids: string[]
  create_reusable_policy: boolean
  reason: string
}
```

Response:

```ts
{
  preview: ReviewConfirmationPreview
  confirmed_revision_ids: string[]
  policy_id: string | null
  audit: AuditMetadata
}
```

### `POST /api/finance/review-groups/{id}/split`

Request:

```ts
{
  partitions: Array<{ label: string; member_revision_ids: string[] }>
  reason: string
}
```

Response includes the original group ID, replacement `ReviewGroup[]`, preserved before/after
totals and `audit`.

### `POST /api/finance/review-groups/{id}/defer`

Request `{reason: string; revisit_on: string | null}`. Response contains the updated group and
`audit`.

### Reconciliation

```ts
export interface FinanceReconciliation {
  id: string
  account_id: string
  asset_id: string | null
  period_start: string
  period_end: string
  opening_balance: string
  movement_total: string
  closing_balance: string
  difference: string
  tolerance: string
  status: ReconciliationStatus
  source_revision_ids: string[]
  open_question_ids: string[]
  explanation: string | null
  run_at: string
}
```

- `GET /api/finance/reconciliations` → `PagedResponse<FinanceReconciliation>`.
- `POST /api/finance/reconciliations/run` accepts account/asset/period/opening/closing/tolerance
  decimal strings and source revision IDs; returns the reconciliation and `audit`.

## Tax profiles and treatments

```ts
export interface FinanceTaxProfile {
  id: string
  tax_year: number
  jurisdiction: 'SE' | 'ES'
  reporting_currency: string
  materiality_threshold: string
  reconciliation_tolerance: string
  status: 'draft' | 'active' | 'closed'
  created_at: string
  updated_at: string
}
```

- `GET /api/finance/tax-profiles` → paged profiles.
- `POST /api/finance/tax-profiles` accepts the profile fields above and returns `{profile,audit}`.
- `GET /api/finance/tax-profiles/{id}/residency-facts` → paged factual records.
- `POST /api/finance/tax-profiles/{id}/residency-facts` → `{fact,audit}`.
- `GET /api/finance/tax-profiles/{id}/treatments` → paged candidate/confirmed treatments.
- `POST /api/finance/tax-treatments/{id}/confirm` requires a reason and expected ruleset version;
  returns the new treatment revision and `audit`.

Residency facts are evidence, not conclusions. No endpoint auto-confirms tax residency or treaty
application.

## Reports and exports

```ts
export interface ReportReadiness {
  status: ReportStatus
  blocking_count: number
  warning_count: number
  blockers: FinanceWarning[]
  warnings: FinanceWarning[]
}

export interface FinanceReportRun {
  id: string
  tax_profile_id: string
  tax_year: number
  jurisdiction: string
  reporting_currency: string
  status: ReportStatus
  ruleset_versions: Record<string, string>
  algorithm_version: string
  event_revision_ids: string[]
  valuation_ids: string[]
  treatment_ids: string[]
  evidence_document_ids: string[]
  open_question_ids: string[]
  readiness: ReportReadiness
  manifest_sha256: string
  created_at: string
  download: DownloadMetadata | null
}
```

### `POST /api/finance/reports`

Request:

```ts
{
  tax_profile_id: string
  format: 'zip' | 'csv' | 'pdf_summary'
  include_warnings: boolean
  expected_event_revision_ids: string[]
}
```

Response returns a frozen `FinanceReportRun` and `audit`. A blocked report is persisted with its
manifest and blockers but has `download: null`.

- `GET /api/finance/reports` → paged frozen runs.
- `GET /api/finance/reports/{id}` → one run with lineage.
- `GET /api/finance/reports/{id}/download` → `DownloadMetadata`; `409` if blocked.

Old runs and their file bytes never change. Later corrections affect only subsequently created
runs.

## Finance assistant

```ts
export type FinanceAssistantScope =
  | { type: 'finance'; tax_year: number | null; jurisdiction: string | null }
  | { type: 'account'; account_id: string }
  | { type: 'event_revisions'; event_revision_ids: string[] }
  | { type: 'report'; report_id: string }

export interface FinanceSourceCitation {
  source_type: 'event' | 'raw_record' | 'evidence' | 'report' | 'official_web'
  source_id: string | null
  title: string
  url: string | null
  accessed_at: string | null
  locator: string | null
}

export interface FinanceProposalCard {
  id: string
  proposal_type:
    | 'event_classification'
    | 'review_policy'
    | 'open_question'
    | 'export_note'
  status: ProposalStatus
  scope: FinanceAssistantScope
  before: Record<string, unknown>
  after: Record<string, unknown>
  affected_record_count: number
  impacted_report_ids: string[]
  rationale: string
  citations: FinanceSourceCitation[]
  confirmation_token: string
  expires_at: string
}
```

Typed tools are:

- `get_financial_snapshot`
- `list_accounts`
- `list_events`
- `get_event_lineage`
- `get_evidence_for_event`
- `get_reconciliation_status`
- `explain_balance_change`
- `get_asset_lots`
- `get_derivative_position_summary`
- `get_passive_income_breakdown`
- `get_tax_package_status`
- `calculate_scenario`
- `research_current_guidance`
- `propose_event_classification`
- `propose_review_policy`
- `create_open_question_draft`
- `prepare_export_note`

Endpoints:

- `POST /api/finance/assistant/tools/{tool_name}` accepts `{scope, arguments}` and returns
  `{tool_name, scope, result, completeness, citations, audit}`.
- `POST /api/finance/assistant/proposals` creates a draft `FinanceProposalCard`.
- `POST /api/finance/assistant/proposals/{id}/confirm` accepts the confirmation token and reason;
  it is an application workflow with an idempotency key and returns the resulting revision plus
  `audit`.
- `POST /api/finance/assistant/proposals/{id}/reject` returns the rejected card plus `audit`.

The tool name is allowlisted server-side. The model cannot call proposal confirmation, execute
SQL, access credentials, execute trades, confirm residency or change report history.

## Frozen fixture

The first invariant fixture is an anonymized 24-row hourly staking-reward CSV:

- one owned exchange account;
- one crypto asset and one reporting-currency asset;
- 24 source rows and 24 canonical `staking_reward` events;
- every native reward is `0.000125`, total native quantity `0.003000`;
- every reward uses a preserved fixture valuation of `2400.00 EUR` per asset unit;
- each report value is `0.30000000 EUR`, total report value `7.20000000 EUR`;
- the 24 events display as one tax-day review group;
- confirming the group preserves all 24 event revisions and creates balanced postings;
- opening `1.000000` plus movement `0.003000` equals closing `1.003000`;
- importing or committing the fixture twice changes no totals and creates no duplicate postings;
- splitting the group into 8 and 16 members preserves `0.003000` and `7.20000000 EUR`.

Tests may add more fixtures, but they may not change these expected values.

## Error matrix

| Status | Meaning |
|---:|---|
| 400 | Malformed upload, parser input or domain validation |
| 401 | No valid authenticated session |
| 404 | Resource absent or not owned; cross-owner existence is hidden |
| 409 | Idempotency conflict, stale revision, immutable source, blocked download or duplicate identity conflict |
| 422 | Pydantic request validation |
| 500 | Sanitized internal failure; no implementation details |

All list endpoints return an empty `items` array, zeroed `PageMeta`, `Completeness` and a typed
`empty_state` rather than `404`.
