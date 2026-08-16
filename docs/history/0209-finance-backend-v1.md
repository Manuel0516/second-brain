# 0209 — Finance backend v1

Date: 2026-08-01
Status: accepted

## What changed

Completed the backend contract required by the three-page Finance experience. Users can create
manual records and edit them through append-only successor revisions. The overview now has
previous-year totals, grouped Decimal-safe timeseries, review queue counts and narrower activity
filters. Evidence can be downloaded as deterministic, jurisdiction-scoped bundles. Reports support
category snapshots and now render real multi-page PDFs. PDF statements enter the existing import
pipeline with generic text extraction, confidence labels, editable row corrections and unchanged
deduplication. The unused Finance assistant API and service were removed while its historical
migration and tables remain intact.

## Why

The shipped Finance UI had working ingestion, review and report foundations but lacked the write and
read endpoints needed by its primary controls and charts. PDF reports were placeholders, PDF imports
could only preserve metadata, and the assistant backend served a surface no longer present in the v1
product. This work implements the user-approved Codex plan without changing the frontend or
rebuilding the canonical ledger.

## Files touched

- `apps/api/app/routes/finance.py` — adds manual event create/edit responses, idempotent mutation
  workflows, previous-year summary values and the timeseries endpoint.
- `apps/api/app/routes/finance_review.py` — adds review counts plus event/group filters.
- `apps/api/app/routes/finance_ingestion.py` — streams evidence bundles and wires PDF preview row
  corrections into the existing commit flow.
- `apps/api/app/routes/finance_tax_reports.py` — scopes frozen reports by optional treatment category.
- `apps/api/app/services/finance_timeseries.py` — computes overview buckets from current confirmed
  canonical revisions using `Decimal` values.
- `apps/api/app/services/finance_pdf_statements.py` — extracts generic statement rows and confidence
  metadata from Poppler/OCR text.
- `apps/api/app/services/finance_evidence.py`, `finance_imports.py`, and `finance_reports.py` — map
  bundle folders, support the new parser/corrections, and generate ReportLab PDFs.
- `apps/api/app/main.py`, `routes/finance_assistant.py`, and `services/finance_ai.py` — remove the
  assistant router and its backend implementation.
- `apps/api/pyproject.toml` and `apps/api/uv.lock` — add the approved ReportLab dependency.
- `apps/api/tests/test_finance_manual_events.py`, `test_finance_timeseries.py`,
  `test_finance_evidence_bundle.py`, and `test_finance_pdf_import.py` — cover the new endpoint and
  import behavior.
- `apps/api/tests/test_finance_api_contract.py`, `test_finance_reports.py`, and
  `test_finance_review_api.py` — update the frozen API surface and extend existing report/review
  regressions; `test_finance_ai_security.py` was removed with its sole consumer.
- `docs/work/plans/finance-module-v1/CONTRACT.md` — records the exact shared wire contract and the
  assistant removal.
- `docs/history/0209-finance-backend-v1.md` and `docs/history/CHANGELOG.md` — record this delivery.

## How the pieces connect

Evidence upload still creates immutable source documents. CSV and PDF previews both flow through
`finance_imports.py`; commit preserves raw rows, applies the existing fingerprint layers, projects
canonical revisions, and places proposals in review groups. Manual entry starts at the same
canonical event/revision/component/posting layer without inventing a parallel transaction table.
Edits append a successor revision and advance only the stable event's current pointer. Confirmed
revisions feed `/summary`, `/timeseries`, review groups and tax treatments. Confirmed treatments,
valuations, evidence and residency facts are frozen into report snapshots before CSV, ZIP or PDF
export. Review counts summarize the same groups used by the review page, while evidence bundles
read immutable source bytes directly and never alter report snapshots.

## How to modify this later

To add a third jurisdiction, widen the existing `SE`/`ES` request literals, database checks and
frontend selector together, then add jurisdiction-specific tax rules and fixtures. To support a
bank layout that the generic PDF parser misses, add a provider-selected template ahead of the
generic parser while retaining the same `ParsedSource` and commit path. Replace the current honest
multi-country warning heuristic only when a versioned treaty ruleset exists. Add a timeseries cache
or materialized read model only after production data shows the per-request aggregation is slow.
Keep event corrections append-only and retain migration `033` unless a new forward migration
explicitly retires its unused assistant tables.
