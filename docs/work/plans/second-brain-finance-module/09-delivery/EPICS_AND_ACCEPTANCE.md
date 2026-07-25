# Epics and acceptance criteria

## Epic 1 — account and asset registry

- Account can represent bank, broker, exchange, wallet, bot subaccount and cash account.
- Assets use stable identifiers.
- Sensitive account references are encrypted.
- Closing an account preserves history.

## Epic 2 — evidence ingestion

- Original bytes are retained and hashed.
- Duplicate upload is detected.
- Documents can link to multiple events.
- Extraction output records parser/model version.

## Epic 3 — source imports

- Preview shows coverage, mapping and expected record count.
- Commit is idempotent.
- Rejected records remain visible.
- Reprocessing creates new derivations, not duplicates.

## Epic 4 — ledger

- Every confirmed event produces valid postings.
- Account balances can be replayed.
- Fees and withholding remain separate components.
- Decimal calculations have fixture coverage.

## Epic 5 — passive-income grouping

- 24 hourly rewards can display as one daily group.
- Expanding reveals all 24 records.
- Mixed asset/treatment groups are rejected.
- Split/confirm actions are audited.
- Reusable policy has a preview and version.

## Epic 6 — reconciliation

- Opening + movements = closing.
- Differences have explicit causes or open questions.
- Material unresolved differences block “complete”.
- Reconciliation can be rerun from frozen inputs.

## Epic 7 — investments

- Lots trace acquisition to disposal.
- Transfers do not create gains by default.
- Staking preserves receipt valuation and later lot.
- Futures reports separate P&L, fees, funding and collateral.
- Bot equity equation can be reproduced.

## Epic 8 — tax profiles

- Sweden and Spain treatments coexist for one event.
- Rules are tax-year versioned.
- Residency conclusion is not auto-confirmed.
- Missing facts become open questions.

## Epic 9 — reports

- Export includes schedules, evidence index and audit manifest.
- Report numbers link to input revisions.
- Old exports remain unchanged after later edits.
- Export warns about unresolved questions.

## Epic 10 — AI assistant

- Exact financial answers use structured tools.
- Current-rule claims use cited web sources.
- Private identifiers are minimized.
- Write proposals require confirmation.
- Prompt injection tests pass.
- Assistant states when it lacks enough information.
