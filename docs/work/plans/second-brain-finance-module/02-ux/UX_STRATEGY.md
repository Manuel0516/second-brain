# UX strategy

Finance is a protected `/finance` route in the existing rail→sidebar→canvas application shell.
The module can use a contextual sidebar and a right-side inspector, but it must not introduce a
new global shell or token set.

## UX objective

Make a complex evidence system feel calm by showing **summaries, exceptions and next actions**, while keeping every raw detail one click away.

The interface should never imply that grouped micro-events disappeared. The visual pattern is:

```text
24 raw staking rewards
        ↓
1 daily review group
        ↓
1 confirmed treatment decision
        ↓
24 preserved records + 1 reusable policy
```

## Information architecture

### Primary finance navigation

1. **Overview** — readiness, net worth, passive income and open exceptions.
2. **Activity** — grouped events, raw events and sources.
3. **Review** — exception-first confirmation queue.
4. **Accounts** — banks, brokers, exchanges, wallets and bot subaccounts.
5. **Assets** — funds, gold, crypto and positions.
6. **Evidence** — statements, receipts, contracts and unmatched documents.
7. **Reports** — jurisdiction packages, exports and open questions.
8. **Assistant** — contextual finance chat available as a side panel across all screens.
9. **Settings** — tax profiles, grouping rules, valuation policies, integrations and privacy.

These are Finance sections inside the page, represented by search params (for example
`/finance?section=review`) so browser back/deep links work without multiplying top-level routes.

## Core UX principles

### 1. Progressive disclosure

Default to totals and grouped summaries. Expand only when the user needs raw events, valuation details or evidence.

### 2. Exception-first review

Order the queue by consequence and uncertainty, not by chronology alone:

1. Unreconciled balances.
2. Missing evidence.
3. Possible taxable transfers or disposals.
4. Residency conflicts.
5. Low-confidence classifications.
6. Routine high-confidence groups.

### 3. Stable visual semantics

- Green: reconciled/confirmed.
- Amber: review needed.
- Red: blocking discrepancy or missing evidence.
- Blue: system suggestion, not confirmed.
- Gray: informational/automatically grouped.

Never use color as the only status indicator.

Use existing Second Brain semantic tokens/classes. Do not copy the mockup's literal green,
amber, red or blue values into module CSS.

### 4. One decision, many events

When 300 events share the same source, asset, treatment and valuation policy, ask the user to confirm the policy once and show how many records it will affect.

### 5. Context preserved everywhere

Every detail panel should show tax year, jurisdiction, source, evidence and audit history. The user should never need to remember which context they are editing.

## Passive-income UX

### Summary screen

- Today, this month, average/day and active sources.
- Daily/monthly chart, not a noisy hourly chart by default.
- Source mix by staking, savings, lending and funding.
- Grouping explanation visible but unobtrusive.

### Grouped activity table

Each row displays:

- Date.
- Human-readable group label.
- Source and asset.
- Raw event count.
- Total native quantity and report-currency value.
- Review status.

Expand the row to reveal:

- First and last timestamp.
- Individual rewards.
- Valuation method and rates.
- Evidence source.
- Proposed tax treatment.

### Automatic grouping rules

Only group when all of the following match:

- Owner and account.
- Source platform.
- Asset.
- Canonical event type.
- Jurisdictional day boundary.
- Candidate tax treatment.
- Valuation policy.
- No member has a blocking warning.

Grouping is a **view**, not a destructive database operation.

## AI assistant UX

Use a collapsible right-side panel so the user can ask questions while looking at a report, event or account.

Each answer should visually separate:

- **Your data** — ledger facts with links to records.
- **Calculation** — deterministic result and method.
- **Current guidance** — internet sources and “as of” date.
- **Uncertainty** — assumptions and what requires an adviser.
- **Actions** — safe suggestions such as “open 12 affected events” or “create an open question.”

Example prompts:

- “Why did passive income rise this month?”
- “Which accounts do not reconcile?”
- “Show every ETH staking reward missing a receipt-time valuation.”
- “What current Swedish guidance is relevant to staking, and which of my records might be affected?”
- “Prepare questions to send to an accountant about my Spain/Sweden residency.”

## Mobile scope

Mobile should prioritize:

- Photograph/upload evidence.
- Confirm small review groups.
- Resolve missing-document prompts.
- Ask the assistant about the currently open item.

Complex imports, reconciliation and report configuration remain desktop-first.
