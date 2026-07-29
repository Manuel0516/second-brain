# 0205 — Finance module UX (Overview, Activity, Review, Reports)

Date: 2026-07-26
Status: accepted

## What changed

Built the Finance module's `/finance` frontend against the frozen Finance API contract
(`docs/work/plans/second-brain-finance-module/09-delivery/FINANCE_API_CONTRACT.md`), following
Wave 1C of the finance execution plan. This is the Claude Code UX track running alongside the
Codex backend track (Wave 0/1A/1B), against the four supplied mockups: Overview, Passive-income
activity, Review queue, and Reports.

- Replaced the placeholder `Finance.tsx` shell with a real page: a shared header (top
  Overview/Review/Reports tabs, tax-year stepper, Add record/Import CSV stubs) and a contextual
  left sidebar that changes per screen, matching the mockups' rail→sidebar→canvas layout instead
  of the prior flat section-list nav.
- **Overview** (`FinanceOverview.tsx`): income/expense/rewards/transfers/review-queue stat cards,
  net-worth/passive-income/tax-readiness cards, a "Today" activity table, and sidebar
  jurisdictions/readiness ring/warnings — all wired to the real `GET /api/finance/summary` and
  `GET /api/finance/activity` endpoints.
- **Activity** (`FinanceActivity.tsx`): a drill-in view reached from the Overview passive-income
  card (mirrors the mockup, which keeps "Overview" selected while showing this screen).
  Summary/Sources/Raw-events sub-tabs, an Hourly/Daily/Monthly passive-income chart, a source-mix
  breakdown, a grouped-reward table with expandable member revisions, and a real account creation
  form (`POST /api/finance/accounts`) for the "+ Add source" action.
- **Review** (`FinanceReview.tsx`): filter sidebar, queue summary cards, a selectable table, and a
  detail inspector, wired to the real `GET/POST /api/finance/review-groups` endpoints (confirm,
  split, defer) with confirmation modals and J/K/C/S/D keyboard shortcuts scoped to the surface.
- **Reports** (`FinanceReports.tsx`): jurisdiction completion, tax-package checklist, residency
  summary, open questions, and evidence bundle. The reporting/evidence/tax-profile backend
  (Wave 2A) doesn't exist yet, so this screen renders clearly-marked fixture data shaped to the
  frozen `FinanceReportRun`/`FinanceTaxProfile` types, with an inline "Sample data" note so it's
  never mistaken for real figures — ready to swap for live fetches with no layout change.
- Added shared UI primitives (`primitives.tsx`): `StatCard`, `StatusPill`, `Sparkline`,
  `TrendChart`, `RingProgress`, `BarMeter`, `JurisdictionList`, `SidebarYearBlock`, and a small
  icon set, all built on existing `styles.css` tokens only.
- Added `format.ts` for money/date formatting and client-side time-series aggregation
  (`aggregateByDay/Month/Hour`) — the backend has no historical trend endpoints yet, so chart data
  is computed from real `/activity` records rather than fabricated.
- Extended `api.ts` with `fetchFinanceActivity`, `fetchReviewGroups`, `confirmReviewGroup`,
  `splitReviewGroup`, `deferReviewGroup`, and `fetchFinanceReconciliations`, matching the routes
  already implemented in `apps/api/app/routes/finance.py` and `finance_review.py`.
- Reused existing hardcoded semantic-color literals (`#43c58a` success, `#d9573f` danger,
  `#d9b13b` warning — all already present elsewhere in `styles.css` for other features) for review
  status/evidence-coverage pills, per the finance plan's `design-tokens.json` guidance that new
  status colors must be introduced deliberately rather than invented ad hoc.

## Why

The finance-module execution plan splits work into a Codex backend track and a Claude Code UX
track that run concurrently once the API contract is frozen. The user supplied four mockup images
(Overview, Activity, Review, Reports) and asked for the UX to be implemented now, in parallel with
the Codex agent, using whatever backend surface already exists (summary, activity, accounts,
assets, review-groups, reconciliations) and clearly-marked fixture data for the parts that don't
(evidence, imports, tax-profiles, reports, assistant tools — Wave 1A/2A/2B).

## Files touched

- `apps/web/src/modules/finance/Finance.tsx` — page shell: tab routing, shared header, assistant
  launcher stub, legacy-section placeholder for accounts/assets/evidence/assistant deep links.
- `apps/web/src/modules/finance/FinanceOverview.tsx` — Overview screen + `useFinanceSummary` hook.
- `apps/web/src/modules/finance/FinanceActivity.tsx` — Activity drill-in (Summary/Sources/Raw).
- `apps/web/src/modules/finance/FinanceReview.tsx` — Review queue, detail inspector, confirm/
  split/defer modals, keyboard nav.
- `apps/web/src/modules/finance/FinanceReports.tsx` — Reports screen (fixture data).
- `apps/web/src/modules/finance/primitives.tsx` — shared chart/pill/icon components.
- `apps/web/src/modules/finance/format.ts` — money/date formatting and chart aggregation helpers.
- `apps/web/src/modules/finance/api.ts` — added activity/review/reconciliation client functions.
- `apps/web/src/modules/finance/finance.css` — full styling for all four screens, token-only.
- `apps/web/src/modules/finance/Finance.test.tsx` — updated mocks for the new API surface and the
  restored "Finance navigation" sidebar `aria-label`.

## How the pieces connect

`Finance.tsx` owns tab state (`overview`/`review`/`reports`, via the `?section=` query param) and
tax-year/jurisdiction state, and renders exactly one of `FinanceOverview`/`FinanceReview`/
`FinanceReports`, each of which independently renders its own `SidebarShell` + canvas (so sidebar
content can differ per screen without a shared render-prop layout). `FinanceOverview` additionally
holds a local `view: 'overview' | 'activity'` toggle and renders `FinanceActivity`'s
`ActivitySidebar`/`ActivityMain` when drilled in — this view is *not* one of the top-level tabs,
matching the mockup where the "Overview" tab stays visually selected during the drill-in.
`FinanceHeader` (exported from `Finance.tsx`) is the one shared piece of chrome all three screens
render at the top of their canvas. All server state lives in each screen's own `useEffect`/fetch
calls through `api.ts`; local interaction state (selected row, open modal, active sub-tab) stays
in the component that owns it, per `apps/web/AGENTS.md`.

## How to modify this later

- **Wiring Reports to real data**: once Wave 2A ships `GET /api/finance/tax-profiles` and
  `GET /api/finance/reports`, replace the fixture constants at the top of `FinanceReports.tsx`
  (`JURISDICTION_COMPLETION`, `TAX_PACKAGE_SECTIONS`, `RESIDENCY_DAYS`, `OPEN_QUESTIONS`,
  `EVIDENCE_BUNDLE`) with fetched data of the same shape and remove the "Sample data" banner. The
  layout does not need to change.
- **Net worth / tax readiness trend charts**: currently render an honest empty state
  ("Historical trend arrives once valuation snapshots accumulate...") because no history endpoint
  exists. Once one does, feed it into `TrendChart` the same way `FinanceOverview.tsx`'s passive
  income card already does via `aggregateByDay`.
- **Readiness percentage**: `format.ts`'s `readinessPercent()` is a documented heuristic
  (`// ponytail:` comment) derived from `blocking_count`/`warning_count` because `/summary` has no
  numeric readiness score. Delete it once the backend adds one.
- **Review "confidence"**: the mockup shows a confidence percentage; the contract only exposes
  `evidence_coverage`. `FinanceReview.tsx` labels this honestly as "Evidence coverage" rather than
  fabricating a confidence score — if a real confidence field ships, rename the column/label back.
- **Assistant panel**: `FinanceAssistantLauncher` in `Finance.tsx` is a scaffold only (no typed
  tools yet — Wave 2B). Wire it to `POST /api/finance/assistant/tools/{tool_name}` once available.
- **Add record / Import CSV**: currently open a stub popover explaining Wave 1A isn't built yet.
  Wire to the real `POST /api/finance/imports/preview` → commit flow once ingestion ships.
- Accounts/Assets/Evidence full management screens (product screens 4/5) were not in the supplied
  mockups and are deferred — `Finance.tsx`'s `FinanceLegacyPlaceholder` still serves their
  `?section=` deep links so routing doesn't 404.

## Verification

`npm run check --workspace @secondbrain/web` (format, lint, 154 tests, production build) passes.
A live authenticated browser pass was attempted but blocked by an unrelated local environment
issue (Colima's Docker port-forwarding stopped working on this machine mid-session, independent of
this change — see chat for details); code-level verification is complete.
