# Finance Module v1 — API contract

Owner: Codex backend. The companion frontend must treat this file as the source of truth for the
v1 additions below. Existing Finance endpoints retain the shapes documented by their FastAPI
response models.

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

`GET /api/finance/evidence/bundle` is the one v1 exception to the download-metadata rule: it
streams a deterministic ZIP because the bundle is assembled on demand and is not a frozen report.

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

## Manual events

`POST /api/finance/events` requires `Idempotency-Key`.

```json
{
  "tax_year": 2026,
  "occurred_at": "2026-07-16T12:00:00+02:00",
  "event_type": "income",
  "amount": "48230.00",
  "currency": "SEK",
  "source_account_id": "uuid",
  "description": "University salary",
  "jurisdiction": "SE",
  "asset_id": null
}
```

Response `201`:

```json
{
  "event": {
    "id": "uuid",
    "current_revision_id": "uuid",
    "revision_number": 1,
    "status": "confirmed",
    "event_type": "income",
    "occurred_at": "2026-07-16T10:00:00Z",
    "tax_year": 2026,
    "tax_date": "2026-07-16",
    "amount": "48230.00",
    "currency": "SEK",
    "source_account_id": "uuid",
    "asset_id": "uuid",
    "description": "University salary",
    "jurisdiction": "SE"
  },
  "audit": {
    "audit_entry_id": "uuid",
    "action": "event.created",
    "entity_type": "finance_event",
    "entity_id": "uuid",
    "prior_revision_id": null,
    "new_revision_id": "uuid",
    "created_at": "2026-07-16T10:00:00Z"
  }
}
```

`PATCH /api/finance/events/{event_id}` accepts `expected_revision_id` plus any editable manual
event fields. Omitted fields retain their current values. It requires `Idempotency-Key` and returns
the same `{event, audit}` envelope. A stale revision returns:

```json
{
  "detail": {
    "code": "stale_revision",
    "message": "Finance event changed elsewhere",
    "current_revision_id": "uuid"
  }
}
```

## Overview additions

`GET /api/finance/timeseries?tax_year=2026&metric=income&granularity=month&group_by=none`
accepts `metric=net_worth|income|expense|rewards|readiness`,
`granularity=day|week|month`, `group_by=account|source|jurisdiction|none`, and optional ISO
`from`/`to` dates.

```json
{
  "series": [
    {
      "key": "all",
      "label": "All",
      "points": [
        {"t": "2026-01-01", "v": "48230.00"}
      ]
    }
  ]
}
```

`GET /api/finance/summary` adds:

```json
{
  "previous_year": {
    "income": "0",
    "expense": "0",
    "rewards": "0",
    "transfers": "0",
    "net_worth": "0"
  }
}
```

`GET /api/finance/review-queue/counts?tax_year=2026&jurisdiction=SE` returns:

```json
{
  "needs_grouping": 2,
  "needs_evidence": 3,
  "ready": 8,
  "problematic": 1,
  "total": 14
}
```

`GET /api/finance/activity` and `GET /api/finance/review-groups` accept optional `event_type`
and `group_id` filters in addition to their existing query parameters.

## Evidence bundles and category reports

`GET /api/finance/evidence/bundle?tax_year=2026&jurisdiction=SE` streams `application/zip` with
deterministic timestamps and ordering. Documents are placed under numbered source-kind folders and
the root contains `manifest.json`. Unknown kinds use `99_other/`.

`POST /api/finance/reports` adds optional `category`. Only confirmed treatments matching that
category are included; omitting it preserves the full-year report behavior.

```json
{
  "tax_profile_id": "uuid",
  "format": "pdf_summary",
  "include_warnings": true,
  "expected_event_revision_ids": ["uuid"],
  "category": "staking_income"
}
```

## PDF statement import

PDF statements use the existing evidence-first import workflow. Upload the PDF through
`POST /api/finance/evidence`, then preview it with `parser_id: "pdf_statement"` through the
existing JSON `POST /api/finance/imports/preview` request.

The preview response adds:

```json
{
  "source_format": "pdf",
  "unparsed_line_count": 2,
  "rows": [
    {
      "source_index": "1",
      "date": "2026-07-16",
      "description": "University salary",
      "amount": "48230.00",
      "currency": "SEK",
      "confidence": "high",
      "source_line": "2026-07-16 University salary 48 230,00 SEK"
    }
  ]
}
```

`POST /api/finance/imports/{import_id}/commit` adds optional `row_overrides` and
`excluded_source_indexes` while preserving the existing `mapping` and `confirm_warnings` fields.

```json
{
  "mapping": {},
  "confirm_warnings": [],
  "row_overrides": [
    {
      "source_index": "1",
      "date": "2026-07-16",
      "description": "Corrected salary",
      "amount": "48230.00",
      "currency": "SEK"
    }
  ],
  "excluded_source_indexes": ["5"]
}
```

## Removed surface

All `/api/finance/assistant/*` routes are removed in v1. Migration `033` remains in the migration
chain; its tables are intentionally unused.

## Changelog

- 2026-08-01 — Defined the finance v1 backend additions. The evidence bundle is an explicit
  streaming exception because it is generated on demand rather than stored as a frozen report.
