# 0210 — Finance frontend v1

Date: 2026-08-01
Status: accepted

## What changed

Reshaped the merged finance frontend (`apps/web/src/modules/finance/`, ~7,800 LOC from
`feature/finance-module`) into the approved 3-page v1 (Overview / Review / Reports) against the
backend contract in `docs/work/plans/finance-module-v1/CONTRACT.md`:

- **Assistant removed (frontend half):** deleted `FinanceAssistant.tsx` (767 LOC), its test,
  the launcher mount, the 4 assistant API wrappers, all assistant/proposal/citation types, the
  `CitationList` primitive and its CSS. Backend half was removed in 0209.
- **Shell:** `Finance.tsx` now owns a `refreshKey` (bumped after any mutation, all pages
  refetch on it). Topbar gained **+ Add record** and renamed the import action to
  **Import CSV** (mockup label; the wizard accepts CSV and PDF).
- **New dialogs:** `AddRecordDialog.tsx` (manual event → `POST /events`, edit mode →
  `PATCH /events/{id}` append-revision) and `AddJurisdictionDialog.tsx` (tax profile +
  residency-status fact), both on the house `scope-prompt`/`useDialogFocus` modal pattern.
- **Overview:** KPI cards now carry sparklines (from `GET /timeseries`) and YoY delta chips
  (from `summary.previous_year`); the three chart cards are live `SeriesChartCard`s with
  scope dropdowns (All accounts / All sources / All jurisdictions), series merging
  (sum/avg) and first→last delta lines; TODAY table gained the Missing-doc status tone, a
  per-row action and a "View all (n)" footer into Review; sidebar jurisdictions gained the
  `+` button, the readiness card action row and warning rows now navigate to Review.
- **Review:** server-side pagination (10/page, prev/next + page meta), `event_type` filter
  select, filter-bar counts from `GET /review-queue/counts` (needs grouping / needs evidence /
  ready / problematic), confirm-conflict path surfaces a "Reload queue" recovery.
- **Reports:** per-category tax-package rows gained ZIP / CSV / PDF export buttons
  (`POST /reports` with `category`), the residency card gained a derived multi-jurisdiction
  treaty-risk note, and the evidence card gained the **Download bundle (ZIP)** link
  (`GET /evidence/bundle`) plus a source-kind folder preview.
- **Import wizard:** `application/pdf` now maps to the `pdf_statement` parser; PDF previews
  render an editable row table (date/description/amount/currency inputs, confidence chips,
  include/exclude checkboxes, unparsed-line notice) and commit sends `row_overrides` +
  `excluded_source_indexes`.
- **api.ts/types.ts:** added `createFinanceEvent`, `patchFinanceEvent`,
  `fetchFinanceTimeseries`, `fetchFinanceReviewQueueCounts`, `financeEvidenceBundleUrl`,
  `ReviewGroupsQuery` (with `event_type`/`group_id`); types for manual events, timeseries,
  queue counts, PDF rows, row overrides, `previous_year`, report `category`.
- **format.ts:** `seriesToTrend`, `seriesToSparkline`, `mergeSeries`, `yoyDelta`,
  `trendDelta` — all chart-render-only conversions; decimal strings never round-trip
  through `Number()` back to the API.

Finishing pass (same day, completing the plan):

- **Sidebar year selector:** `SidebarYearBlock` renders the house `Dropdown` when given an
  `onChange` — the sidebar "This year ▾" now drives `taxYear` for the whole module, matching
  the topbar dropdown. Wired through `OverviewSidebar` and `ActivitySidebar`.
- **Review Edit button:** the detail inspector gained **Edit** (enabled for pending
  single-member groups) — resolves the group's raw member via
  `GET /activity?view=raw&group_id=…`, then opens `AddRecordDialog` in edit mode
  (append-revision `PATCH /events/{id}`). Multi-member groups say "split first to edit".
- **Dead CSS removed:** the leftover assistant/proposal block in `finance.css`
  (`.fin-tool-*`, `.fin-proposal-*`) and its responsive reference.
- **Reverted:** a same-day KPI-row experiment (Transfers → an "Income sources" bar-chart
  card) was undone after the user's reference screenshot confirmed the top row is
  Income/Expenses/Rewards/**Transfers**/Review queue, matching the original mockup. `BarMeter`
  kept its new optional `color` prop (still used by `SourceMixCard`'s per-row colors, which it
  also fixed); the `SourcesStatCard` component and its `group_by=source` income fetch were
  removed. Transfers has no sparkline — no `transfers` timeseries metric exists on the backend.
- **Add account:** account creation (bank / broker / exchange / wallet / bot / cash — name,
  institution, type, country, base currency, optional tax jurisdiction) was previously only
  reachable as a minimal inline form buried in the Activity drill-down (`FinanceActivity.tsx`,
  itself only reachable via "View activity" on the Passive-income chart). Extracted into a
  standalone `AddAccountDialog.tsx` (same modal pattern as `AddJurisdictionDialog`, full
  `FinanceAccountCreate` field set) and wired it in two places: a `+` button next to the
  Account dropdown in `AddRecordDialog` (so adding a record never dead-ends on "no accounts
  yet"), and both existing Activity entry points now open the same shared dialog instead of a
  local duplicate form. The old `AddSourceForm` and its now-dead CSS
  (`.fin-add-source-form`, `.fin-add-source-actions`) were deleted.

Second finishing pass (same day — left-rail consistency + navbar pixel match):

- **Left rail no longer changes per tab (bug fix):** Review and Reports each rendered a
  completely different sidebar (a "Review filters" list, a "Reports" exports/evidence
  summary) instead of the mockup's persistent This year / Jurisdictions / Readiness /
  Warnings rail. Extracted the rail into a new `FinanceSidebar.tsx`
  (`useFinanceSummary` + `FinanceSidebarContent`, moved verbatim out of
  `FinanceOverview.tsx`) and mounted it identically on all three pages. Review's sidebar
  filter list moved into the canvas as a second `<select>` beside the existing type filter
  (`.fin-queue-filters`), its keyboard-shortcut tip became a one-line `.fin-queue-tip`
  under the queue header, and its now-redundant totals strip was dropped (the same counts
  already show in the queue's 4 mini-stat cards). Reports' sidebar "Exports"/"Evidence"
  shortcut rows were dropped — both counts are already the whole point of that page's main
  canvas (`JurisdictionCard`, `EvidenceBundleCard`). Both pages gained the `+ Add
  jurisdiction` entry point they were missing (`AddJurisdictionDialog` wasn't previously
  reachable outside Overview).
- **Sidebar collapse (previously missing):** the reference sidebar mockup shows a
  functioning close **✕**; `SidebarShell`'s existing `actions`/`open` props (already used
  by Food/Fitness) were wired up for Finance for the first time — `Finance.tsx` now owns
  `sidebarOpen` state (threaded through `FinanceTabProps`), the topbar gained the
  hamburger toggle Food/Fitness both already have (was missing — there was previously no
  way to reopen a hidden sidebar), and a shared `FinanceSidebarClose` button (in
  `FinanceSidebar.tsx`) is passed as `actions` on all three `SidebarShell` mounts.
- **Chevron pair now bordered, matching Food/Fitness:** the tax-year `‹`/`›` `IconButton`s
  used the default borderless `ghost` variant; Food's and Fitness's equivalent nav buttons
  are always bordered (`.food-topbar-nav-btn`/`.fit-topbar-nav-btn`, 26px, `border: 1px
  solid`). Switched both to `variant="raised"` (the existing prop that renders exactly that
  style — no new CSS) and wrapped them in their own `.fin-year-nav-buttons` (2px gap),
  separate from the now-10px gap to the year dropdown — previously all three sat in one
  flat 2px-gap row.
- **Plain year-selector style:** both the sidebar's "This year" value and the topbar's "Tax
  year 2026" control were rendering as the fully-boxed `.dropdown-trigger` (border,
  `bg-elevated`, 38px min-height) — the same chrome correctly used by the chart-scope
  selectors ("All accounts ▾"), but the reference screenshots show the year selectors as
  plain text + chevron only, no box. Added a `.fin-dropdown-plain` modifier class (passed
  as `Dropdown`'s existing `className` prop — no change to the shared component) that
  zeroes the border/background/padding and keeps a focus-visible ring for accessibility.
  The sidebar's "This year" row was also restructured from a vertical stack to a
  `justify-content: space-between` row (`.fin-sidebar-year-row`) so the label and value
  sit side by side per the mockup.
- **Bug found, not fixed (belongs to `apps/api`, out of bounds for this session):**
  `POST /finance/events` (manual event creation — the "+ Add record" button's endpoint)
  throws a 500 `IntegrityError` / `ForeignKeyViolation` on
  `fk_finance_events_current_revision` against the live dev database, 100% reproducible,
  confirmed via both the running dev server and an in-process `TestClient` call against
  `app.main.app`. `_persist_manual_plan` (`finance.py:552`) sets
  `event.current_revision_id = plan.revision_id` as a raw column assignment with no ORM
  `relationship()` to hint flush order, and the live DB attempted the `finance_events`
  UPDATE before the `finance_event_revisions` INSERT it points at. `test_finance_manual_events.py`
  covers the identical request shape and passes, so pytest's fixture session doesn't
  reproduce it — meaning the gap is real but untested. **Every "+ Add record" submission
  in the live app right now almost certainly fails with a 500.** Also found in the same
  area: `AddJurisdictionDialog` sends `fact_type: "residency_status"`, which
  `ResidencyFactCreate`'s validator rejects outright ("must record evidence, not a
  residence conclusion") — Add Jurisdiction's residency-fact step is a second, separate
  live 422. Neither was touched — `apps/api/**` is out of scope here.
- **Demo data:** seeded via the real API (not fixtures) against the live dev database —
  3 new accounts (SEB Checking, Bitget, Interactive Brokers, alongside the already-existing
  real "Spanish Account") and both SE/ES tax profiles with a `physical_presence` residency
  fact each. Event seeding hit the bug above and was abandoned; the throwaway seed script
  was deleted rather than committed.

## Why

The finance mockup (dark 3-page dashboard with sidebar readiness/jurisdictions/warnings, KPI
sparkline cards, three filterable charts and per-category tax exports) was approved as the v1
product. The merged branch shipped the domain plumbing but not the dashboard read-side; the
backend gaps landed in 0209 and this change wires the UI to them. The assistant surface was
out of the approved scope.

## Files touched

- `apps/web/src/modules/finance/Finance.tsx` — refreshKey, Add record button, Import CSV label, launcher removed
- `apps/web/src/modules/finance/FinanceOverview.tsx` — rewritten: timeseries charts, sparklines, YoY chips, sidebar actions
- `apps/web/src/modules/finance/FinanceReview.tsx` — pagination, type filter, queue counts, conflict recovery
- `apps/web/src/modules/finance/FinanceReports.tsx` — category exports, treaty note, bundle download
- `apps/web/src/modules/finance/FinanceImportWizard.tsx` — pdf_statement parser, editable PDF rows, commit overrides
- `apps/web/src/modules/finance/AddRecordDialog.tsx` — new
- `apps/web/src/modules/finance/AddJurisdictionDialog.tsx` — new
- `apps/web/src/modules/finance/api.ts` — assistant wrappers out, v1 endpoints in
- `apps/web/src/modules/finance/types.ts` — assistant types out, contract v1 types in
- `apps/web/src/modules/finance/format.ts` — series/delta helpers
- `apps/web/src/modules/finance/primitives.tsx` — JurisdictionList `+` button, CitationList removed
- `apps/web/src/modules/finance/finance.css` — assistant/citation CSS out; pager, delta chips, PDF rows, dialogs, side-add in
- `apps/web/src/modules/finance/Finance.test.tsx` / `api.test.ts` — assistant tests replaced with manual-event/PATCH/timeseries contract tests
- Deleted: `FinanceAssistant.tsx`, `FinanceAssistant.test.tsx`

## How the pieces connect

`Finance.tsx` owns `taxYear`, `jurisdiction`, the `?section=` tab and `refreshKey`, and passes
them via `FinanceTabProps`. Each page renders its own `SidebarShell` + `FinanceHeader` +
canvas and fetches through `modules/finance/api.ts` (all wrappers go through
`lib/api.ts#apiCall`; mutations always send an `Idempotency-Key`). Amounts are
`DecimalString`s end to end — `format.ts` converts to `Number` only at chart/label render.
Dialogs mount where used (header: AddRecord/ImportWizard; Overview sidebar: AddJurisdiction)
and call `onRefresh` → `refreshKey++` → every page's effects refetch. The Activity drill-down
(`FinanceActivity.tsx`, reached from the Passive-income card) deliberately survives: it holds
the only account-creation form and the source-mix cards; it is not a 4th tab.

## How to modify this later

- **New KPI card:** add a `StatCard` in `OverviewMain`'s `fin-stat-row`; sparkline = a
  `mergeSeries` of a timeseries metric; YoY chip = extend `previous_year` on the backend first.
- **New chart metric:** extend `FinanceTimeseriesMetric` in `types.ts` (backend Literal first),
  then add a `SeriesChartCard` — merging, dropdown and delta come free.
- **Jurisdiction #3:** widen the backend `"SE"|"ES"` Literals, then `JURISDICTIONS` in
  `navigation.ts`, `COUNTRIES` in `AddJurisdictionDialog.tsx`, `JURISDICTION_OPTIONS` in
  `AddRecordDialog.tsx` — the flag is an emoji string.
- **Per-bank PDF templates:** preview UI needs no change; better rows arrive from the backend
  parser and flow through the same `PdfRowsEditor`.
- **Deliberate v1 cuts (ponytail):** emoji flags; single row action in TODAY (no context
  menu); needs_evidence/ready refine the fetched pending page client-side; readiness % is a
  derived heuristic in `format.ts#readinessPercent`; date-only manual records sent as midday
  UTC; Activity drill-down kept URL-less.
