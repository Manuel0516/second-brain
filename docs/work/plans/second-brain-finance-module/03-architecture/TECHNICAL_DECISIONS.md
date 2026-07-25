# Finance technical decisions

## ADR-001: Extend the existing modular monolith

Finance is implemented in the current React/Vite + FastAPI + PostgreSQL application. A second
Next.js/TypeScript server, ORM or database would duplicate authentication, deployment and graph
ownership without improving the one-user product.

## ADR-002: PostgreSQL `NUMERIC`, Python `Decimal`, decimal-string JSON

Asset quantities, fiat amounts, rates, prices, balances and tax values use SQLAlchemy
`Numeric(precision, scale)` columns. Python calculations use the standard-library `Decimal`.
Pydantic request/response schemas accept and return decimal strings for authoritative values.
The frontend may format values, but never becomes the source of truth for calculations.

## ADR-003: Raw sources and evidence are immutable

The original bytes, content hash, raw payload and parser provenance are retained. Reprocessing
creates a new parser run and derived event revisions; it never edits the original object or raw
record. Finance evidence cannot be deleted through the generic image-file delete path without
an explicit finance deletion workflow.

## ADR-004: Canonical events and postings coexist

Events explain what happened. Postings make account and asset balances replayable. They are
created together for a confirmed revision and neither replaces the other.

## ADR-005: Grouping is a view

Review groups reference event revisions and store totals for display. They never merge, delete
or replace the member rows. Split, confirm and policy actions are audited.

## ADR-006: Task-oriented API, not generic finance CRUD

Import preview/commit, review confirmation, reconciliation, report creation and lineage are
the public workflows. Generic CRUD is acceptable for account/asset setup where no financial
invariant is bypassed.

## ADR-007: No queue dependency in the first slice

The current API has no general worker/Redis service. Small imports, previews and exports run as
bounded API operations. If profiling proves a job queue necessary, add it to the root Compose
stack, document retry/idempotency behavior and keep the same domain boundaries. Do not add a
dependency speculatively.

## ADR-008: Existing auth and graph are the integration points

Use `current_user`, owner-scoped queries, existing `resource_shares` only for a later accountant
scope, and `Link` rows for cross-module relationships. Do not add finance-specific authentication
or foreign keys into Calendar, Notes, Fitness or Food tables.

## ADR-009: Deterministic tax rule packs

AI can suggest classifications or explain a rule. Versioned Python code calculates tax schedules
and reports. Tax residency is never auto-confirmed.

## ADR-010: Frozen report snapshots

A report records the exact event revisions, valuations, treatments, evidence IDs, ruleset
versions and algorithm version used to create it. Later edits cannot change an old export.
