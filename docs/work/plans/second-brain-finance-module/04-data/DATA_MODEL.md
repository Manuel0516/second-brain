# Finance data model

Finance extends the existing PostgreSQL schema. Every table is prefixed with `finance_` to
avoid collisions with the current Calendar, Notes, Fitness and Food tables. UUIDs follow the
existing SQLAlchemy convention. Every top-level row has `user_id` and every route enforces
ownership through `current_user`.

## Domain rule

Manual income/expense capture, bank imports, broker exports, crypto records and future live
connectors all enter the same canonical event pipeline. A simple ledger table is not a second
source of truth.

```text
source account
  -> finance_import / finance_raw_record
  -> finance_event / finance_event_revision
  -> components + postings + lots/positions + valuations
  -> review group and tax treatment
  -> reconciliation and frozen report run
```

## Essential tables

### `finance_accounts`

Owned bank, broker, exchange, wallet, bot subaccount and cash accounts.

- `id`, `user_id`, `name`, `institution`, `account_type`
- `country_code`, `base_currency`, `tax_jurisdiction`
- encrypted external reference, sync/import provider, opened/closed timestamps, metadata

The external reference is never returned in full or sent to AI tools. Closing an account keeps
its history.

### `finance_assets`

Stable asset identity rather than symbol-only identity.

- `id`, `user_id`, `asset_type`, `symbol`, `name`, `isin`
- `chain_id`, `contract_address`, `issuer_country`, `decimals`, metadata

Uniqueness uses the relevant stable identifier. Symbols may be renamed or reused.

### `finance_source_connections`

Optional read-only connector configuration. Manual CSV/JSON upload is the first provider.

- account, provider, encrypted credential reference, permission scope, status
- last cursor/sync time, error summary, created/updated timestamps

Credentials are encrypted at rest and never included in logs, exports or prompts.

### `finance_imports` and `finance_raw_records`

`finance_imports` stores the immutable source object/file ID, content SHA-256, account, coverage,
parser ID/version, mapping, fingerprint, status and error summary. `finance_raw_records` stores
the source row/index, original payload, extracted payload, source timestamp/timezone, row
fingerprint and rejection reason.

Deduplication is layered: file/import fingerprint, provider external ID, source-row fingerprint,
semantic event fingerprint and transfer matching. A possible duplicate is linked and reviewed;
it is not silently destroyed.

### `finance_evidence_documents`

Evidence metadata references the existing `files.id`/MinIO object while adding finance-specific
provenance:

- content hash and immutable object version
- MIME type, original name, source/import time and coverage
- extraction/parser/model version, retention status and metadata
- linked event revisions through `Link` rows (`relation = "supported_by"`)

The generic Notes image upload remains image-only. Finance upload accepts the explicitly allowed
PDF, CSV, JSON, image and archive types after size/type checks. Generic file deletion must refuse
an evidence-referenced object unless the finance deletion workflow creates the required audit
record.

### `finance_events` and `finance_event_revisions`

`finance_events` is the stable economic-event identity. `finance_event_revisions` is append-only:

- revision number, event type, effective UTC timestamp
- original local timestamp/timezone and tax-day policy
- source account, status (`proposed`, `confirmed`, `superseded`, `voided`)
- derivation type/version, source raw-record references and superseded revision
- created-by type/id and timestamps

Editing a confirmed event creates a new revision. Raw imports are never changed.

### `finance_event_components`

Components explain the parts of an event: asset in/out, fee, withholding, collateral, funding,
reward, transfer or disposal. Each component stores account, asset, signed/unsigned quantity
according to its role, decimal valuation when available and source metadata.

### `finance_postings`

Replayable balance entries containing event revision, ledger account/subledger, asset, signed
quantity, fiat value when applicable and posting role. A confirmed event must satisfy the
posting balance rule before commit; the API returns a visible validation error otherwise.

### `finance_lots`, `finance_lot_disposals` and `finance_positions`

Lots preserve acquisition basis and remaining quantity by asset. Disposal allocations are
separate rows so Sweden and Spain can use different rules. Positions cover futures and other
derivatives: contract, direction, size, entry/exit, collateral, realized/unrealized P&L,
funding, fees and liquidation details.

### `finance_valuations`

Stores source/target currency, rate/value, timestamp/date, provider/reference, valuation policy,
tax year/jurisdiction and override reason. Historical rates are snapshots; provider changes
never rewrite prior valuations.

### `finance_review_groups` and `finance_review_policies`

Groups contain member event revision IDs, grouping-rule version, date range, native/report totals,
materiality, warning status, evidence coverage and confidence explanation. Policies are versioned,
revocable rules for future compatible events. Grouping never changes event storage.

### `finance_reconciliations`

Stores account/asset, period, opening and closing inputs, movement totals, difference, source
revisions, status and explanation/open-question references. Material unresolved differences block
report completion.

### `finance_tax_profiles`, `finance_residency_facts` and `finance_tax_treatments`

Profiles contain tax year, jurisdiction and currency. Residency facts store presence periods,
addresses, study/work periods, certificates, claims and adviser notes. Treatments reference an
event revision and profile, jurisdiction, year, ruleset ID/version, category, status, inputs,
output, rationale and confirmation audit data. Residency and treaty conclusions require human
confirmation.

### `finance_open_questions`

Tracks missing facts, missing evidence, reconciliation differences, source limitations and
adviser questions with severity, owner, status, related revisions and resolution audit data.

### `finance_report_runs` and `finance_report_items`

A report run freezes selected event revisions, valuations, treatments, evidence IDs, ruleset and
algorithm versions, unresolved questions and a hash manifest. Items link every reported value to
its source revisions. Later data changes create a new run; they do not rewrite an old export.

### `finance_audit_entries`

Append-only audit rows record actor, action, entity, prior/new revision, reason, request hash,
previous hash, entry hash and timestamp. Every confirmation, split, merge-compatible action,
reconciliation correction, treatment confirmation and report creation is auditable.

## Time and numeric handling

Store canonical UTC, original local timestamp/timezone and tax-day date derived under a named
policy. Grouping uses the jurisdictional day boundary, not UTC by accident.

Use PostgreSQL `NUMERIC`, Python `Decimal` and decimal-string JSON. No finance response or browser
calculation may rely on binary floating point for money, quantities, rates, prices or tax values.

## Cross-module links

Use `Link` for event↔page, event↔calendar deadline, event↔evidence, event↔workout/meal and other
cross-module relationships. Finance routes must validate ownership of both endpoints before
creating a link; the generic table itself has no foreign-key knowledge of node types.
