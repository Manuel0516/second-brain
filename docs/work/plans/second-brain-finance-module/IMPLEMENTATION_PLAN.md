# Finance module implementation plan

This is the consolidated entry point for implementing Finance as a new page/module inside the
existing Second Brain app. Detailed specifications live in the linked folders. The repository
architecture in `00-start-here/EXECUTIVE_PLAN.md` is authoritative over any legacy stack wording
in source material.

## 1. Build the system of record first

Implement immutable raw imports, finance evidence storage, canonical events, balanced postings,
valuations and audit revisions using the existing FastAPI/SQLAlchemy/Alembic/MinIO foundations.
Do not begin with dashboards or AI until a source file can be imported twice without changing
totals.

Relevant docs:

- [`03-architecture/SYSTEM_ARCHITECTURE.md`](03-architecture/SYSTEM_ARCHITECTURE.md)
- [`04-data/DATA_MODEL.md`](04-data/DATA_MODEL.md)
- [`04-data/IMPORT_AND_GROUPING.md`](04-data/IMPORT_AND_GROUPING.md)

## 2. Build one complete vertical slice

The first production-quality slice should be:

```text
Staking/savings CSV
  -> immutable source
  -> raw events
  -> daily UX group
  -> user confirmation
  -> postings and valuation
  -> reconciliation
  -> evidence-linked export
```

This validates the hardest UX problem—many tiny events—without requiring every connector. The
first code slice should be a real `/finance` route, a finance API router, one Alembic migration,
one anonymized fixture and one review flow. It must use the existing auth, API client, rail and
design tokens.

## 3. Expand source coverage through fixtures

Add sources in this order:

1. Bank and university payments.
2. Staking/savings rewards.
3. Crypto spot and wallet transfers.
4. Funds/ETFs and dividends.
5. Futures, funding and bots.
6. Gold and less frequent manual assets.

Each connector is complete only when its fixture reconciles to a real statement.

## 4. Add Sweden/Spain as versioned rule packs

Keep domestic residency criteria, treaty review, event classification and reporting adapters independent. The same event can have two candidate treatments. Only deterministic code creates report calculations; the AI may explain and identify missing facts.

Relevant docs:

- [`06-tax/TAX_ENGINE.md`](06-tax/TAX_ENGINE.md)
- [`06-tax/SWEDEN_SPAIN_SCOPE.md`](06-tax/SWEDEN_SPAIN_SCOPE.md)

## 5. Add reporting before advanced automation

A report export must freeze:

- event revisions;
- valuation revisions;
- treatment/ruleset versions;
- evidence links;
- open questions;
- audit manifest.

Old exports never change silently.

## 6. Add the AI assistant through safe typed tools

The assistant should query a financial semantic layer, retrieve selected evidence and optionally research current official sources. It should not receive unrestricted SQL or credentials. All write-like actions remain proposals requiring confirmation.

Relevant docs:

- [`05-ai/AI_ASSISTANT_DESIGN.md`](05-ai/AI_ASSISTANT_DESIGN.md)
- [`05-ai/AI_CHAT_UX.md`](05-ai/AI_CHAT_UX.md)
- [`05-ai/TOOL_CONTRACTS.md`](05-ai/TOOL_CONTRACTS.md)

## 7. Release only after reconciliation, restoration and security gates

A polished UI is not sufficient. v1 requires reproducible imports, reconciled primary accounts, tested backup restoration, authorization tests, prompt-injection evaluations and no critical security findings.

## Recommended milestones

| Milestone | Deliverable | Exit condition |
|---|---|---|
| M0 | Fixtures and architecture | Representative exports and event vocabulary approved |
| M1 | Core ledger | Replayable balances and immutable lineage |
| M2 | Review UX | Daily micro-event grouping and exception queue |
| M3 | Investments | Lots, staking and bot/futures reconciliation |
| M4 | Tax/reporting | Sweden/Spain profiles and frozen packages |
| M5 | AI assistant | Cited, scoped, read-first assistant |
| M6 | v1 hardening | Restore, security and reproducibility gates passed |

See [`09-delivery/ROADMAP.md`](09-delivery/ROADMAP.md) for detailed sequencing and estimates.

## Repository implementation checklist

1. Create `apps/api/app/routes/finance.py`, finance ORM models and the first forward-only
   migration; do not edit old migrations.
2. Add `apps/web/src/modules/finance/` with the rail→sidebar→canvas shell, `finance.css` using
   only global tokens, typed API helpers and route-level server state.
3. Enable the existing Finance rail button and lazy-load `/finance` from `App.tsx`.
4. Extend file/evidence handling without weakening Notes image behavior or deleting immutable
   finance sources.
5. Add decimal, idempotency, ownership, lineage, reconciliation and report snapshot tests
   before adding integrations.
6. Run `npm run check` after every complete vertical slice.
