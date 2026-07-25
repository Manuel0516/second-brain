# Screen specifications

All screens are views within `apps/web/src/modules/finance/Finance.tsx` and use the existing
rail→sidebar→canvas shell. Server state is fetched through `apps/web/src/lib/api.ts`; local
interaction state stays with its owning component. Desktop is the primary surface for imports,
reconciliation and report configuration; mobile prioritizes capture and review.

## 1. Finance overview

### Purpose

Answer “How complete and trustworthy is this year?” in under ten seconds.

### Components

- Tax-year and jurisdiction selector.
- Income, expense, rewards, transfers and review-queue summary cards.
- Net-worth trend.
- Passive-income trend.
- Tax-readiness trend.
- Today/open-items table.
- Left-panel warnings.
- Persistent assistant launcher.

The overview is loaded at `/finance`; section deep links use `/finance?section=overview`.

### Empty state

Explain the three-step onboarding flow: add source → import statement → review first group.

## 2. Passive-income activity

### Purpose

Make hourly/daily income understandable without hiding source detail.

### Components

- Summary/source/raw-event sub-tabs.
- Daily chart with hourly/daily/monthly control.
- Source mix.
- Grouped reward table.
- Grouping-rule inspector.
- Expandable raw records.
- “Apply this policy to future compatible events” control.

### Required states

- All grouped and reconciled.
- New source awaiting mapping.
- Mixed tax treatments prevent grouping.
- Missing price data.
- Day boundary ambiguity due to timezone.
- Source restatement after import.

## 3. Review queue

### Purpose

Resolve high-value uncertainty efficiently.

### Layout

- Filter sidebar.
- Queue summary cards.
- Central compact table.
- Right detail inspector.
- Bottom audit strip.

### Keyboard behavior

- `J/K` next/previous item.
- `E` edit.
- `C` confirm after preview.
- `S` split group.
- `D` defer.

Keyboard shortcuts must be scoped to the review surface and must not leak into Notes, Calendar
or text inputs.

### Confirmation modal

Show:

- Number of raw records affected.
- Rules and assumptions.
- Materiality.
- Whether the choice becomes a reusable policy.
- Undo/revision behavior.

## 4. Accounts and sources

### Account card

- Institution and country.
- Account type.
- Currencies/assets.
- Last successful import.
- Reconciliation status.
- Missing periods.
- Credential status without revealing secrets.

### Source detail

- Import history.
- Parser version.
- Duplicate/rejected rows.
- Statement coverage timeline.
- Re-run parser as a new derivation.

## 5. Evidence vault

### Views

- Documents.
- Missing evidence.
- Unmatched evidence.
- Evidence by tax package.

### Document detail

- Original preview.
- Hash.
- Import/source metadata.
- Extracted fields.
- Linked events.
- Parser version.
- Audit history.

## 6. Reports

### Purpose

Produce a complete package while keeping uncertainty explicit.

### Components

- Jurisdiction completion cards.
- Tax-package checklist.
- Residency summary.
- Open questions.
- Evidence bundle.
- Frozen export runs.

### Export confirmation

Display:

- Tax year and jurisdiction.
- Ruleset versions.
- Reconciliation state.
- Unresolved questions.
- Included evidence count.
- Hash manifest.

## 7. Assistant

### Global panel

- Scope chip: current screen, selected events, account, tax year or all permitted data.
- Web toggle: off, official sources only, broader web.
- Response mode: explain, investigate, prepare adviser questions, create report note.
- Source drawer with internal and web citations.
- Tool activity timeline.

### Safety states

- “This requires current guidance; search the web?”
- “This conclusion depends on tax residency.”
- “I found conflicting source data.”
- “I can prepare a proposed change, but you must confirm it.”
