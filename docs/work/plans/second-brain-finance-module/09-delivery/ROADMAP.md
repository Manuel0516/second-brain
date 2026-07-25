# Finance delivery roadmap

Estimates are sequencing guidance, not promises. Each phase must leave a working vertical slice
in the existing app and pass the repository checks before the next phase begins.

## Phase 0 — repository adaptation and fixtures

- Confirm source/account inventory, tax-year scope and materiality policies.
- Add anonymized fixtures and event vocabulary to `apps/api/tests`.
- Agree the first finance migration and decimal-string API contract.
- Confirm the `/finance` shell and status semantics against the style guide.

Exit: a representative CSV and expected event/posting/reconciliation totals are approved.

## Phase 1 — finance foundation

- Add accounts, assets, imports, raw records, evidence metadata, events, revisions, components,
  postings, valuations and audit entries.
- Add finance upload/preview/commit endpoints and ownership tests.
- Add `/finance` route, active rail item and minimal source/overview states.

Exit: importing the same fixture twice is idempotent; raw source and lineage are inspectable.

## Phase 2 — review and reconciliation

- Add review groups, grouping policies, exception queue, confirm/edit/split/defer flows.
- Add daily passive-income grouping without aggregation at storage level.
- Add transfer matching and account/asset reconciliation.
- Add evidence linking and missing-document states.

Exit: a 24-event reward fixture can be reviewed as one group, expanded to all rows and
reconciled without losing totals.

## Phase 3 — investment subledgers

- Add funds/ETF/gold events, crypto lots, swaps, staking, lending, wallets, futures, funding,
  fees, liquidations and bot-equity reconciliation.
- Add provider fixtures one source at a time; no live credentials until imports reconcile.

Exit: lots, positions and transfer treatment are reproducible from source revisions.

## Phase 4 — tax and reports

- Add Sweden/Spain tax profiles, residency facts and versioned candidate treatments.
- Add frozen report runs, schedules, evidence index, ZIP/CSV/PDF-summary export and open questions.
- Add accountant/adviser scope only after existing share authorization supports tax-year/evidence
  limits and expiry/revocation.

Exit: old exports remain unchanged; every number links to event, valuation, treatment and
evidence revisions.

## Phase 5 — finance assistant

- Add typed finance read/calculation/proposal tools to the existing AI boundary.
- Add contextual assistant panel, internal citations, official-source web research and
  confirmation cards.
- Add prompt-injection, privacy leakage and tool-abuse evaluations.

Exit: exact answers come from deterministic tools, current-rule claims cite sources and no write
is applied without user confirmation.

## Phase 6 — release hardening

- Full `npm run check` and finance fixture suite.
- Restore test for PostgreSQL and MinIO.
- Import/parser fuzzing, authorization matrix, accessibility and performance checks.
- Review source limitations and Sweden/Spain rule-pack maintenance process.

## Release gates

### Alpha

Fixture imports are reproducible and raw evidence is reachable.

### Beta

Primary sources reconcile, review grouping saves work without losing detail, and unresolved
differences are visible.

### Reliable v1

Sweden/Spain packages are reproducible, scoped sharing is secure, assistant answers are cited,
backups restore, and no critical security findings remain.
