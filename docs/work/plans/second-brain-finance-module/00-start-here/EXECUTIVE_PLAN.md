# Finance module — repository-native implementation plan

## Product definition

Finance is a protected module inside Second Brain, not a second application. It answers four
questions:

1. **What happened?** — complete bank, investment, crypto and income events.
2. **Can it be proven?** — statements, receipts, contracts, hashes and source provenance.
3. **How may each jurisdiction treat it?** — versioned Sweden/Spain candidate treatments.
4. **Can a trustworthy package be exported?** — reconciled reports with unresolved questions
   clearly separated.

The module keeps the complete scope of the original finance blueprint:

- Swedish and Spanish accounts and tax profiles.
- University salary, scholarships, reimbursements, freelance income and expenses.
- Funds, ETFs, dividends, gold and bank interest.
- Crypto spot, swaps, staking, lending and wallet transfers.
- Futures, funding payments, fees, liquidations and trading-bot equity.
- High-frequency micro-rewards grouped for review without deleting raw events.
- Multi-currency valuations with preserved rate provenance.
- CSV/JSON/PDF/image/archive imports, evidence linking, reconciliation and exports.
- A read-oriented AI assistant with deterministic finance tools and cited official research.

## Fit with this repository

Use the existing application boundaries:

```text
React/Vite web app
  /finance → apps/web/src/modules/finance/
  AppRail + rail → sidebar → canvas shell
  typed calls through apps/web/src/lib/api.ts
       │ same-origin /api
FastAPI API
  apps/api/app/routes/finance.py
  apps/api/app/models.py
  apps/api/app/services/finance_*.py when shared domain logic is justified
       │
PostgreSQL + Alembic migrations + existing MinIO storage
```

Finance uses the existing JWT/httpOnly-cookie authentication, single-user account model,
SQLAlchemy async sessions, Pydantic route schemas, generic `Link` graph and `files`/MinIO
foundation. It does not introduce Next.js, a second ORM, a second API, a second auth system or
a second database.

The Finance page is a dedicated workflow UI, not a Notes database page. A simple transaction
ledger may be shown as one view, but it must be a projection of the canonical finance events;
do not create a parallel `Transaction` model that bypasses imports, revisions, postings and
evidence lineage.

## Repository-native architecture decisions

- **Frontend:** lazy-loaded React module at `/finance`; internal sections use URL search params
  so deep links remain simple and compatible with the current router.
- **Backend:** one authenticated `/api/finance` router with task-oriented endpoints. Keep route
  schemas explicit and keep calculations/import normalization in small services only when they
  are shared by multiple endpoints.
- **Database:** add finance tables to `models.py` and forward-only Alembic migrations. Every
  finance table is owned by `users.id` directly or through an owned parent.
- **Money and quantities:** PostgreSQL `NUMERIC`; Python `Decimal`; JSON/API values are decimal
  strings. The browser never performs authoritative financial arithmetic with JavaScript
  floating point.
- **Evidence:** reuse MinIO and the `files` object key convention, but add finance evidence
  metadata, hashes and immutability rules. Finance documents include PDF, CSV, JSON, images and
  archives; the Notes image endpoint must remain image-specific.
- **Jobs:** imports, review actions and small exports start as authenticated API operations.
  Reuse the existing API lifespan for bounded polling/maintenance only. Introduce a worker or
  queue only when a measured workload needs it; if introduced, it must be documented in the
  root Compose stack and use idempotency keys.
- **Authentication/sharing:** owner-only finance access is the MVP. Accountant/adviser access
  is a later scoped extension of the existing `resource_shares` authorization model, not a new
  passkey or public-link subsystem in the first slice.
- **AI:** finance tools are server-side allowlisted endpoints. The assistant explains and
  proposes; deterministic finance code calculates and writes only after confirmation.

## Build order

### Stage 0 — decisions and fixtures

Inventory the real banks, brokers, exchanges, wallets and bot subaccounts. Add anonymized
fixtures under the API test suite. Lock the event vocabulary, account/asset identifiers,
currency policy, import fingerprints and the Sweden/Spain questions that require human advice.

### Stage 1 — trustworthy core

Implement accounts, assets, tax profiles, immutable import/source records, evidence metadata,
financial events, event revisions, components, postings, valuations and audit entries.

Exit criteria:

- Re-importing the same fixture is idempotent.
- Every derived event points to raw records and source evidence where available.
- Every correction creates a revision and audit entry; raw inputs are never overwritten.
- Account and asset balances can be replayed from postings.

### Stage 2 — ingestion and review UI

Implement upload/preview/mapping/commit for CSV first, then JSON, statement PDFs/images and
archives. Add file, row, provider-ID and semantic duplicate detection; rejected rows remain
visible. Add grouped micro-event review, detail inspection, confirm/edit/split/defer and
versioned reusable review policies.

### Stage 3 — reconciliation and investment subledgers

Add opening-plus-movements reconciliation, transfer matching, funds/crypto lots, staking
receipt valuation, lending, futures positions, fees, funding, liquidations and bot-equity
reconciliation. Add clear blocking warnings for missing lots, prices, destinations or evidence.

### Stage 4 — jurisdiction and reporting

Add residency timelines, Sweden/Spain tax profiles, versioned rule packs, candidate/confirmed
treatments, valuation policies, frozen report snapshots, evidence indexes and ZIP/CSV/PDF-summary
exports. The same event may have separate candidate treatments in both jurisdictions.

### Stage 5 — finance assistant

Add a contextual assistant panel using typed read tools for summaries, reconciliation, events,
evidence and tax-package readiness. Add confirmation cards for proposed classifications or
notes, official-source web citations and an audit record for every tool call.

### Stage 6 — hardening

Complete authorization tests, import fuzzing, malicious-file handling, backup restoration,
report determinism, accessibility, prompt-injection evaluations and performance checks before
calling the module reliable v1.

## Definition of success

For a selected tax year and jurisdiction, `/finance` can show source coverage, unresolved
review/reconciliation items, account and asset inventories, income/investment schedules,
residency evidence, linked documents, open questions and a reproducible accountant-ready
package. The package remains useful when the AI provider is unavailable.
