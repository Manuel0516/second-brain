# Second Brain Finance Module

A product and implementation blueprint for a **native `/finance` module**: a multi-jurisdiction
financial evidence, investment-event and tax-reporting system inside the existing Second Brain
React/Vite + FastAPI application.

This module is intentionally not a generic budgeting app. Its job is to preserve financial
reality, attach evidence, reconstruct investment and crypto activity, support Sweden/Spain
tax-year analysis, and produce accountant-ready exports. Manual income and expense capture is
still supported, but it enters the same canonical event/revision pipeline as imported data.

## Start here

1. Read [`00-start-here/EXECUTIVE_PLAN.md`](00-start-here/EXECUTIVE_PLAN.md).
2. Review the UX mockups in [`02-ux/mockups/`](02-ux/mockups/).
3. Use [`09-delivery/ROADMAP.md`](09-delivery/ROADMAP.md) to sequence implementation.
4. Give [`AGENTS.md`](AGENTS.md) to a coding agent before implementation.

## Non-negotiable design principles

- **Raw facts are immutable.** Imports, source files and blockchain records are never overwritten.
- **Tax interpretation is versioned.** Sweden and Spain can interpret the same event differently.
- **Tiny events remain auditable.** Hourly staking or savings accruals are grouped for UX, not destroyed or merged in storage.
- **Deterministic calculations beat AI guesses.** The AI explains and orchestrates; audited code performs calculations.
- **Human confirmation for consequential actions.** No automatic tax filing, trading or irreversible financial write action.
- **Evidence is first-class.** Every report figure should trace back to source records and documents.
- **Privacy by default.** The core can be self-hosted; the AI receives only the minimum context required.

## Suggested delivery target

- **Focused MVP:** 8–10 weeks of concentrated agent-assisted development.
- **Reliable v1:** 20–26 weeks for one developer, including testing, reconciliation, security and Sweden/Spain reporting foundations.

The plan is provider-agnostic at the connector and AI boundaries, but its implementation target
is this repository's existing React/Vite frontend, FastAPI/Python API, SQLAlchemy/Alembic data
layer, PostgreSQL database, JWT/TOTP auth, MinIO storage and generic Link graph. OpenAI is one
optional provider for the internet-enabled finance assistant; it is not required for the core
module or its reports.

## Repository entry points

- Web route: `apps/web/src/modules/finance/` and `/finance` in `apps/web/src/App.tsx`.
- API: `apps/api/app/routes/finance.py`, finance models in `apps/api/app/models.py`, and
  numbered Alembic migrations.
- Shared files: existing MinIO storage and `files` table, extended with finance evidence
  metadata and immutable deletion rules.
- Cross-module relationships: existing `links` table, validated by finance endpoints.
- Current project rules: root `AGENTS.md`, `docs/CONTEXT.md`, `docs/design/STYLE_GUIDE.md`,
  `docs/architecture/FRONTEND.md`, `BACKEND.md` and `DATABASE.md`.
