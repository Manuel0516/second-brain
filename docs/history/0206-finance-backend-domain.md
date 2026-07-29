# 0206 — Finance backend, ledger, tax, reports, and AI foundations

Date: 2026-07-29
Status: accepted

## What changed

Implemented the repository-native Finance backend and its frozen 35-operation API contract. The
module now owns authenticated account, asset and read-only source registries; immutable evidence
and imports; canonical events and append-only revisions; balanced postings and valuation lineage;
review grouping, transfer matching and reconciliation; investment subledgers; Sweden/Spain tax
workspaces; frozen accountant exports; and typed, read-first assistant tools with explicit proposal
confirmation.

The ingestion pipeline supports CSV and JSON records plus structural PDF, image and bounded archive
foundations. Preview and commit persist parser/mapping snapshots, rejected rows and file/row/provider/
semantic deduplication decisions. Evidence is content-addressed in MinIO and shared file deletion now
protects evidence and frozen report files.

Nine serialized Alembic revisions add the Finance schema and PostgreSQL enforcement for immutable
history, owner-consistent lineage, current revision pointers, balanced confirmed postings,
reconciliation and investment integrity, and tax/report/assistant lineage. Every mutation uses an
idempotency key where applicable and appends a per-owner hash-chained audit entry.

The frontend integration scaffold now exposes decimal-string-safe TypeScript types and typed clients
for every frozen endpoint. Detailed Finance UX remains separate from this backend delivery.

Local backend startup was also repaired for Colima: the development Compose override keeps PostgreSQL
and MinIO on the private network while adding the existing egress network so their explicit host port
bindings are actually forwarded. Existing named volumes were preserved.

## Why

The Finance execution plan required a trustworthy, auditable financial core before the detailed UX
could be connected. Financial history must be reproducible from immutable evidence, exact decimal
values and explicit revision lineage; tax and assistant outputs must remain candidate work until a
person confirms them. The local network adjustment fixes the reported SQLAlchemy/psycopg connection
refusal so host-launched Alembic and FastAPI processes can reach the existing PostgreSQL service.

## Files touched

- `.env.example` — documents the separate Finance Fernet key.
- `compose.yaml` — passes the Finance key to the API container.
- `compose.override.yaml` — publishes local PostgreSQL/MinIO ports through Colima without replacing
  their private network or volumes.
- `infra/DEPLOY.md` — documents the required production Finance key without deploying anything.
- `apps/api/app/config.py` — adds Finance encryption configuration.
- `apps/api/app/main.py` — validates production configuration and mounts all Finance routers.
- `apps/api/app/models.py` — defines the owner-scoped source, ledger, review, investment, tax, report,
  audit, idempotency and assistant records.
- `apps/api/app/security.py` — encrypts/decrypts Finance-only external references with a dedicated key.
- `apps/api/app/routes/files.py` — prevents deletion of immutable Finance evidence/report files.
- `apps/api/app/routes/notes.py` — supports audited Finance nodes through the existing generic Link
  table while preserving Notes image behavior.
- `apps/api/app/routes/finance.py` — summary, accounts, assets, activity and revision-lineage APIs.
- `apps/api/app/routes/finance_ingestion.py` — source, evidence and import preview/commit/inspection APIs.
- `apps/api/app/routes/finance_review.py` — review confirmation/split/defer, matching and reconciliation.
- `apps/api/app/routes/finance_tax_reports.py` — residency, treatment, report readiness and downloads.
- `apps/api/app/routes/finance_assistant.py` — typed tools, citations, proposal creation and resolution.
- `apps/api/app/services/finance_core.py` — Decimal boundaries, UUID schemas, idempotency and audit chain.
- `apps/api/app/services/finance_evidence.py` — hashing, archive safety and MinIO evidence storage.
- `apps/api/app/services/finance_imports.py` — parser, mapping, normalization and deduplication logic.
- `apps/api/app/services/finance_import_projection.py` — deterministic import-to-ledger projection.
- `apps/api/app/services/finance_ledger.py` — revision, component, posting and confirmation invariants.
- `apps/api/app/services/finance_reconciliation.py` — transfer candidates and account reconciliation.
- `apps/api/app/services/finance_investments.py` — exact average-cost/FIFO and derivative domain logic.
- `apps/api/app/services/finance_investment_projection.py` — persisted lots, positions and bot snapshots.
- `apps/api/app/services/finance_tax.py` — conservative Sweden/Spain candidate-treatment rules.
- `apps/api/app/services/finance_reports.py` — deterministic manifests, schedules, PDF summary and ZIP.
- `apps/api/app/services/finance_ai.py` — owner-scoped tool authorization and typed domain scopes.
- `apps/api/alembic/versions/029_finance_sources.py` through
  `apps/api/alembic/versions/037_finance_tax_report_integrity.py` — linear Finance schema and database
  constraints.
- `apps/api/tests/fixtures/finance/` — deterministic import and investment fixtures.
- `apps/api/tests/test_finance_*.py` — unit, API, authorization, security, lineage, invariant and contract
  coverage.
- `apps/web/src/modules/finance/types.ts` — complete frozen API boundary types.
- `apps/web/src/modules/finance/api.ts` — authenticated typed clients for all 35 operations.
- `apps/web/src/modules/finance/api.test.ts` — client auth, query, multipart and idempotency coverage.
- `docs/architecture/BACKEND.md` — documents Finance routers, services and security boundaries.
- `docs/architecture/DATABASE.md` — documents Finance tables, invariants and revisions 029–037.
- `docs/history/CHANGELOG.md` — indexes this history entry.

## How the pieces connect

Evidence upload stores the immutable file plus its digest and object version. Import preview freezes
the parser/mapping decision; commit persists raw records and projects accepted records into canonical
events and proposed revisions. Review confirmation locks current state, creates immutable successor
history when required, checks balanced postings, projects investment/tax candidates, and records the
mutation in the audit chain. Reconciliation and reports select only owner-scoped current confirmed
revisions. A report freezes every selected input/hash and writes deterministic export bytes, so later
ledger changes create restatement questions instead of mutating an old report.

Assistant tools authorize a typed Finance scope before querying, return completeness and citations,
and audit success or failure. Write proposals persist only a derived confirmation verifier; applying a
proposal requires the returned token and creates the same domain revisions/audits as direct workflows.
Cross-module relationships continue to use `links`, including report-to-Notes export links.

## How to modify this later

Keep `apps/api/app/models.py` and Alembic ordering under one owner. Extend history by creating a new
event/treatment/position revision—never update a confirmed or frozen row. Add a new parser by giving it
a stable parser/version identifier, deterministic normalization fixtures and retry/deduplication tests.
Add jurisdiction rules as reviewed year-specific rule packs with official-source fixtures; do not turn
candidate treatments into automatic tax conclusions. Add assistant writes only through the existing
proposal/confirmation path and include owner-scope, citation and failure-audit tests.

When wiring the UX, consume `completeness`, `empty_state`, report `readiness`, warnings and decimal
strings directly. Use the typed functions in `apps/web/src/modules/finance/api.ts`; do not convert money
or quantities to JavaScript `number`.

## Verification

- `npm run check:api` — Ruff, mypy and 213 API tests passed.
- `npm run check:web` — formatting, lint (existing warnings only), 158 tests and production build passed.
- A clean PostgreSQL database upgraded 001→037, downgraded Finance 037→028, then upgraded 028→037.
- Local `alembic current` reports `037 (head)` and FastAPI starts cleanly against PostgreSQL.
