# AI chat UX specification

## Entry points

- Global assistant button in the finance header.
- “Ask about this” on events, accounts, charts and report sections.
- Suggested prompts in empty/error states.

## Panel anatomy

### Header

- Current scope chip.
- Tax year and jurisdiction.
- Internet mode: Off / Official sources / Full web.
- Privacy indicator showing what context may leave the server.

### Conversation body

Answers use expandable cards:

- Ledger facts.
- Calculation details.
- Evidence.
- Web guidance.
- Uncertainty.
- Proposed actions.

### Source drawer

Internal source cards link to:

- Event.
- Raw record.
- Evidence document.
- Reconciliation.
- Export snapshot.

Web source cards show publisher, title, date and access date.

## Contextual examples

### From passive-income chart

> Why was July higher than June?

The assistant calls a deterministic breakdown tool, reports source contributions and links to the groups causing the increase.

### From review queue

> Can these 24 rewards use the same treatment as yesterday?

The assistant compares source, asset, rule version, valuation policy and evidence; it then proposes a reusable policy or explains the mismatch.

### From reports

> What stops the Spain package being complete?

The answer lists blocking open questions and links directly to each record.

## Confirmation UX

For proposed changes, show:

- Before/after values.
- Number of affected records.
- Rule/policy created.
- Report snapshots invalidated.
- Reversal path.

The confirm button is never embedded as ordinary chat text; it is a structured application control.
