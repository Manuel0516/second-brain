# 0207 — Finance frontend: live import, assistant, and reports wiring

Date: 2026-07-29
Status: accepted

## What changed

Reworked the Finance frontend (0205's UX scaffold) to run against the now-complete Codex backend
(0206) instead of stubs and fixtures, per the UX handoff notes: use the complete typed client, wire
Reports/Add-record/Import/assistant to live endpoints, preserve decimal strings, render
completeness/empty-state/readiness/warnings/citations, send idempotency keys on mutations (not on
assistant read tools), require the assistant's returned confirmation token before a proposal can be
confirmed.

- **Decimal safety** (`format.ts`): replaced every `Number(decimalString)` summation with a
  BigInt-based `sumDecimal()` that scales to the widest fraction length seen and adds exactly, so
  chart aggregation and stat totals never accumulate float rounding error. `formatMoney()` no
  longer routes the value through `Number()` at all — it parses the decimal string's sign/integer/
  fraction directly, rounds with BigInt arithmetic, and only borrows `Intl.NumberFormat` to read
  off the currency prefix/suffix for the given currency code. `FinanceActivity.tsx`'s
  today/month/year-to-date/source-mix totals were switched from `reduce`-with-`Number()` to
  `sumDecimal()`.
- **Import wizard** (new `FinanceImportWizard.tsx`): replaced the header's "+ Add record"/"Import
  CSV" stub popover with a real three-step flow — upload evidence (`POST /finance/evidence`,
  parser auto-selected from the file's MIME type), preview with editable CSV column mapping
  (`POST /finance/imports/preview`, re-run on remap), then commit (`POST /finance/imports/{id}/
  commit`) with a per-warning-code acknowledgment checklist enforcing the backend's
  `confirm_warnings` contract, ending in a created/duplicate/rejected summary. "Add record" itself
  was dropped: the backend has no manual single-event endpoint by design (`FINANCE_MODULE.md`:
  "do not build a parallel Transaction table that bypasses lineage") — the only ingestion path is
  import, so both buttons collapsed into one "Import statement" action.
- **Assistant panel** (new `FinanceAssistant.tsx`): replaced the placeholder launcher text with a
  scope + tool picker (a client-side mirror of `finance_ai.TOOL_SPECS`' scopes/required/optional
  per tool) that calls `POST /assistant/tools/{tool_name}` and renders the result's completeness,
  raw JSON, and source citations, plus a proposal composer wired to `POST /assistant/proposals` →
  confirm/reject via the returned `confirmation_token` (never a client-invented one). Tool calls
  intentionally send no `Idempotency-Key`; every proposal create/confirm/reject does.
- **Reports rewrite** (`FinanceReports.tsx`): removed every fixture constant. Per jurisdiction:
  create-or-fetch a `FinanceTaxProfile` for the tax year, a tax-package checklist grouped from
  `fetchFinanceTaxTreatments` by category, a residency summary from `fetchFinanceResidencyFacts`
  (labeled `requires_human_confirmation`, never auto-resolved), an open-questions list from
  candidate treatments with a Confirm action requiring a reason and the treatment's
  `ruleset_version`, and a report-generation panel that paginates confirmed event-revision IDs for
  the tax year (`GET /finance/activity?view=raw&status=confirmed`) to satisfy
  `expected_event_revision_ids`' optimistic-concurrency check before calling
  `POST /finance/reports`. An evidence-bundle table lists `fetchFinanceEvidence` documents with
  direct `download_url` links.
- **Completeness/warnings surfaced app-wide**: added `WarningList` and `CitationList` to
  `primitives.tsx`; wired page-level `Completeness.warnings/blockers` (previously fetched but
  unused) into banners on Overview, Activity, and Review, and item-level `ReviewGroup.completeness`
  into the review detail inspector.
- **Shared confirmation dialog**: added `ReasonModal` to `primitives.tsx` (reason-required, focus-
  trapped, portalled) and used it for tax-treatment confirmation and proposal confirm/reject,
  replacing an initial `window.prompt()` draft that didn't fit the app's dialog styling.
- **Typography fix**: `finance.css`'s mono/uppercase section-label pattern
  (`.finance-section-label`, `.fin-stat-label`, `.fin-table th`, `.fin-review-totals span`) was
  missing `font-weight: 600` and had inconsistent letter-spacing — every other module's equivalent
  label (`styles.css`'s `.settings-subgroup-label`, calendar's `.month-weekdays`, etc.) uses the
  `font: 600 <10-11>px var(--font-mono)` shorthand. Brought Finance in line.

## Why

0205 shipped the Finance UX shell against fixtures and stubs because the Codex backend tracks
(imports/evidence, ledger, tax/reports, AI tools) hadn't landed yet. 0206 completed that backend.
The user asked for a full frontend pass to replace every stub with the real, frozen contract, with
explicit correctness requirements around decimal precision and the assistant's confirmation-token
flow (both easy to get subtly wrong and hard to notice in casual testing).

## Files touched

- `apps/web/src/modules/finance/format.ts` — decimal-safe `sumDecimal`, rewritten `formatMoney`.
- `apps/web/src/modules/finance/FinanceActivity.tsx` — decimal-safe totals; page-completeness
  banner.
- `apps/web/src/modules/finance/FinanceOverview.tsx` — page-completeness banner.
- `apps/web/src/modules/finance/FinanceReview.tsx` — page- and item-level completeness rendering.
- `apps/web/src/modules/finance/primitives.tsx` — added `WarningList`, `CitationList`,
  `ReasonModal`, `IconLink`.
- `apps/web/src/modules/finance/FinanceImportWizard.tsx` — new: upload/preview/commit wizard.
- `apps/web/src/modules/finance/FinanceAssistant.tsx` — new: tool runner + proposal composer +
  launcher (moved out of `Finance.tsx`).
- `apps/web/src/modules/finance/FinanceReports.tsx` — full rewrite against live tax-profile/
  treatment/residency/report/evidence endpoints.
- `apps/web/src/modules/finance/Finance.tsx` — header now opens the import wizard; assistant
  launcher import moved to `FinanceAssistant.tsx`; legacy-placeholder copy corrected now that
  evidence/accounts have real homes.
- `apps/web/src/modules/finance/finance.css` — removed the now-unused stub-popover/sample-note
  rules; added styles for the import wizard, assistant panel, proposal cards, warning/citation
  lists, tax-profile creation grid; widened the assistant popover; fixed section-label typography.

## How the pieces connect

`Finance.tsx` still owns tab/tax-year/jurisdiction state and the one shared `FinanceHeader`, which
now owns only the "Import statement" action (opening `FinanceImportWizard` as a portalled modal)
— manual record entry has no backend counterpart so it was removed rather than left as a dead
stub. `FinanceAssistantLauncher` (now in its own file) is unconditionally rendered by `Finance.tsx`
regardless of tab, as before, but its popover content is a real two-mode panel (`tools`/
`proposals`) instead of placeholder text. `FinanceReports.tsx` fetches all tax profiles/reports
once at the top and hands each jurisdiction's subset down to a `JurisdictionCard`, which owns its
own treatments/residency fetches — avoiding N duplicate full-list fetches while keeping each
jurisdiction's state independent. Every mutation path follows the same shape already established
by `FinanceReview.tsx`'s confirm/split/defer modals: local component state, `crypto.randomUUID()`
idempotency key, try/catch with an inline error paragraph.

## How to modify this later

- **Per-tool argument forms**: `FinanceAssistant.tsx`'s `TOOL_META` renders one generic text/
  textarea input per required/optional argument key, coercing strings to number/boolean/array by
  regex rather than a bespoke form per tool. If a tool gains a genuinely structured argument beyond
  what `coerceArgValue`'s heuristics handle, add its key to `ARRAY_ARG_KEYS`/`JSON_ARG_KEYS` rather
  than building a new form.
- **Report readiness on stale data**: `ReportsPanel.create()` re-collects confirmed revision IDs
  immediately before calling `createFinanceReport`, but a 409 (records changed between page load
  and click) surfaces as a generic error string — there's no auto-retry. If this becomes annoying
  in practice, retry once with a fresh ID collection before surfacing the error.
- **Assets management UI**: still has no dedicated screen (`FinanceAsset` CRUD exists in `api.ts`
  but nothing calls `createFinanceAsset`). Not in this pass's scope; `FinanceLegacyPlaceholder`
  still serves `?section=assets`.
- **Evidence vault as its own page**: the Reports evidence-bundle table is the only evidence view;
  a dedicated vault with missing/unmatched-evidence filtering (product spec §5) is deferred.

## Verification

`npm run check --workspace @secondbrain/web` (prettier, eslint, 159 tests, production build)
passes. Not verified in a live authenticated browser session in this pass — code-level
verification only; flag this to the user before treating the import/assistant/report flows as
manually QA'd.
