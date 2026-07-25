# Finance test strategy

Finance tests live beside the current API/frontend tests and must run through the repository's
existing commands: `npm run check` (or the narrower `npm run check:web`/
`npm run check:api` during iteration).

## Unit tests

- Decimal parsing/serialization and rounding policies.
- Event normalization and source mappings.
- Posting balance rules.
- Grouping compatibility and policy matching.
- Transfer matching, lot allocation and valuation policies.
- Sweden/Spain rule-pack calculations.
- Report manifest and snapshot selection.

## Property and invariant tests

- Re-importing the same input never changes totals or creates duplicate postings.
- Splitting/rejoining compatible groups preserves totals.
- Transfer matching preserves global asset quantity except explicit fees.
- Replaying postings produces the same balance.
- A confirmed mutation always creates a revision and audit entry.
- Every report item links to an event revision and every decimal API value is a string.

## Fixture tests

Keep anonymized golden fixtures for:

- university salary, scholarship, reimbursement and freelance income;
- bank expense, interest, FX and duplicate statement;
- fund purchase/dividend/sale, gold and foreign withholding;
- crypto purchase/swap/transfer/staking/lending;
- futures fill/funding/fee/liquidation and bot equity;
- corrected statement, PDF/image metadata extraction and DST/timezone boundary.

## API integration tests

- upload → preview → mapping → commit → raw records → events → postings;
- owner authorization for every endpoint and linked evidence object;
- reprocess parser version without duplicate state;
- review confirmation/split/defer with audit history;
- reconciliation and report invalidation;
- evidence-linked export and frozen rerun;
- future scoped accountant share permissions.

## Frontend tests

- `/finance` route loading/empty/error states;
- section search-param navigation;
- grouped activity expansion and review confirmation preview;
- decimal display without client-side authoritative arithmetic;
- keyboard review shortcuts scoped to the review surface;
- mobile evidence capture and responsive review;
- accessible table headers, status text/icons and focus states.

## Security and AI tests

- malicious files, archive limits and parser fuzzing;
- cross-user object access and deletion protection;
- encrypted credential redaction;
- prompt injection in fake PDFs/web pages;
- tool allowlist and proposal-confirmation enforcement;
- current-guidance citations and uncertainty wording.
