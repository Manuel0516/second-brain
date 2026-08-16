# Finance Module v1 — FRONTEND / UX plan (owner: **Claude**)

Repo: `/Users/manuel/Desktop/second-brain` · Branch: `development-finance` (HEAD `9b01d21`)
Companion plan: [`BACKEND_CODEX.md`](./BACKEND_CODEX.md) — owned by Codex, runs in parallel.
Master (pre-split) plan: [`PLAN.md`](./PLAN.md).

> **Read `AGENTS.md` and `docs/design/STYLE_GUIDE.md` before writing a line. Both are law.**

---

## 0. Ownership boundary — read this first

Two agents are building this in parallel. Collisions are the only real risk.

| Area | Owner | Rule |
|---|---|---|
| `apps/web/**` | **Claude (you)** | Codex never edits these. |
| `apps/api/**` | Codex | **You never edit these.** Not even one line, not even a test. |
| `apps/api/.env`, `compose*.yaml`, `infra/**` | Codex | |
| `docs/work/plans/finance-module-v1/CONTRACT.md` | Codex writes, **you read** | The seam. See §2. |
| `docs/history/0210-finance-frontend-v1.md` | **Claude (you)** | |
| `docs/history/0209-finance-backend-v1.md` | Codex | |
| `docs/history/CHANGELOG.md` | both — **append only your own line** | |
| git commits / push / deploy | **neither**, until the user explicitly says go | |

If a bug looks like a backend bug: **do not fix it.** Write it down and report it. Codex owns
that column.

---

## 1. The single most important fact about this task

**The finance frontend already exists. 7,795 lines of it shipped with the merge.**

```
apps/web/src/modules/finance/
  types.ts                 767   full typed domain model
  primitives.tsx           560   shared components (see §3)
  api.ts                   454   ~30 typed fetch wrappers
  format.ts                175   decimal-safe formatters
  navigation.ts              8   LEGACY_SECTIONS
  Finance.tsx              173   shell
  FinanceOverview.tsx      498
  FinanceReview.tsx        832
  FinanceReports.tsx       713
  FinanceActivity.tsx      890   ← hidden 4th surface, see F0.3
  FinanceImportWizard.tsx  494
  FinanceAssistant.tsx     767   ← to be deleted (F6)
  finance.css            1,237
  Finance.test.tsx / FinanceAssistant.test.tsx / api.test.ts
```

**This is therefore a restyle-and-gap-fill job, not a from-scratch build.** The functional
plumbing (grouped review queue, confirm/split/defer, import wizard, report cards, evidence
bundle card, jurisdiction cards, residency summary) is largely present and wired. What is
missing is (a) the visual language of the mockup, and (b) roughly six specific features.

**Ponytail rung 2 applies with full force: it is already in this codebase — find it and reuse
it.** Deleting and rewriting these files would be the single worst decision available on this
task. Read before you replace.

---

## 2. The seam — build against `CONTRACT.md`, not against a running server

Codex is writing the backend at the same time as you. You are **not blocked** by that.

1. `docs/work/plans/finance-module-v1/CONTRACT.md` is the source of truth for every wire
   shape. Codex writes it first, before implementing.
2. Hand-write your TypeScript types in `types.ts` from that file. Wire format is `snake_case`.
3. **All money is a string on the wire and stays a string in state.** Parse for display only,
   via `format.ts`. Never `parseFloat` an amount into component state, never do arithmetic in
   JS on a money value. This is not a style preference — it is the reason the backend uses
   `Numeric(38,18)`.
4. When an endpoint from B1–B8/B10 is not live yet, code the component against the contract
   shape and gate it behind the existing loading/empty state. Do **not** invent a mock layer,
   do **not** hardcode fixture data into a component. **[PONYTAIL]** the empty state you
   already need for real is also your development placeholder.
5. If a response does not match the contract, that is Codex's bug. Report it; do not paper
   over it in the UI.

---

## Phase F0 — Inventory and triage (do this first, do not skip)

You cannot plan a restyle of 7,795 LOC you have not read.

### F0.1 Read, in this order
1. `docs/design/STYLE_GUIDE.md` — the law.
2. `apps/web/src/styles.css` — the token set you are allowed to use.
3. `apps/web/src/modules/calendar/Calendar.tsx` **topbar section** and the settings page —
   AGENTS.md §4 names these the visual gold standard. The finance topbar is a clone of the
   calendar topbar, not a new invention.
4. `apps/web/src/modules/food/Food.tsx` — the readiness ring already exists here as an
   SVG `strokeDasharray`/`strokeDashoffset` pattern. Reuse it.
5. Then the finance module files above, largest-first.

### F0.2 Produce a keep / restyle / delete table
For every export in `primitives.tsx` and every block in the four page components, decide one
of: **keep as-is**, **restyle only** (markup/CSS, no logic change), **extend** (new prop or
new data), **delete**. Write this table into the history entry later — it is the justification
for every diff you make.

### F0.3 Resolve `FinanceActivity.tsx` (890 LOC) — decide explicitly
There is a hidden fourth surface reachable only through a `setView('activity')` toggle inside
Overview. It has no URL, no tab, and no test. The mockup has **three** tabs.

Pick one and write the reason down:
- **Fold into Overview** — its grouped activity table becomes the mockup's `TODAY` table.
  *This is the expected answer* — the mockup's TODAY table with "View all (14)" is exactly a
  filtered activity list, and `GroupedActivityTable` already exists.
- Promote to a real tab — contradicts the mockup. Requires user approval.
- Delete — only if nothing in it is reusable, which is unlikely at 890 LOC.

### F0.4 Baseline gate
`cd apps/web && npm run check` → green before you change anything.

---

## Phase F1 — Token layer, shell, sidebar, topbar

### F1.1 `finance.css` token pass
1,237 lines exist with **no module-local token layer**. Add one at the top of the file:
```css
.fin { --fin-accent-tint: …; --fin-accent-border: …; }
```
built **only** from existing globals (`--accent`, `--border-strong`, `--bg-elevated`,
`--text-secondary`, `--text-tertiary`, `--r-lg`, `--shadow-md`, `--font-ui`, `--font-mono`).
**Zero new hex values anywhere.** Then sweep the file for hardcoded colors/radii/shadows and
replace them with tokens. Section labels are `600 10px var(--font-mono)`, uppercase, `.05em`.

Motion: `springUp` on cards, `.enter` + `--enter-delay` stagger, `prefers-reduced-motion`
respected. Copy the pattern; do not author a new animation.

### F1.2 Shell — `Finance.tsx` (173 LOC, restyle)
Target: `AppRail (60px) → finance sidebar (230px) → canvas`, matching the mockup.
Verify `App.tsx` route + lazy import and `AppRail.tsx` `ActiveRail` value already point here
(they were wired by the merge — check, don't redo).

State owned by the shell: `taxYear`, `sidebarOpen`, active tab, `refreshKey`.
**[PONYTAIL]** no react-query, no store: page-owned fetch + `refreshKey++` after every
mutation. Full refetch beats granular cache surgery at this scale.

### F1.3 Topbar (gold standard: the calendar topbar)
Left → right: sidebar toggle · **"Finance"** title · `‹` `›` chevron pair ·
**"Tax year 2026 ▾"** dropdown · `Segmented [Overview | Review | Reports]` ·
`+ Add record` · `⬆ Import CSV`.

Same font, size, spacing and hit-targets as the other module navbars. Segmented control is the
existing house primitive — reuse it, do not restyle it locally.

### F1.4 Finance sidebar, top → bottom per the mockup
1. **THIS YEAR** — `2026 ▾` selector + `Jan 1 – Dec 31, 2026` sub-line. `SidebarYearBlock`
   already exists in `primitives.tsx`. Selecting a year drives `taxYear` for the whole module.
2. **JURISDICTIONS** + `+` button — `JurisdictionList` / `JurisdictionCard` exist. Each card:
   circular flag, country name, `Resident` / `Non-resident` sub-line (derived from
   residency-facts), chevron. **[PONYTAIL]** emoji flags, no flag asset pack.
3. **READINESS** — `82%` + circular ring + `On track` + "Complete your review to increase
   accuracy →" action row. `RingProgress` + `readinessPercent` exist; source is
   `summary.readiness`.
4. **WARNINGS** — cards (`8 unreviewed rewards`, `3 missing documents`) + "View all warnings",
   fed by **B5** `/review-queue/counts`, each navigating into Review pre-filtered.

### F1 gate
`npm run check` green; visual diff against the mockup for shell, sidebar, topbar.

---

## Phase F2 — Page 1: Overview (`FinanceOverview.tsx`, 498 LOC)

Data: `getSummary` (+ **B4** `previous_year`), **B3** `/timeseries`, `/activity` (+ **B6**
filters).

```
<Overview>
 ├─ Row 1 — 5 × KpiCard: INCOME · EXPENSES · REWARDS · TRANSFERS · REVIEW QUEUE
 │    each: icon, label, big value (mono), "YTD", inline Sparkline, YoY chip
 │    (↑12% vs 2025 green / ↓4% red / —0% neutral). REVIEW QUEUE shows a count
 │    + amber "8 unreviewed" chip instead of a YoY chip.
 ├─ Row 2 — 3 × ChartCard, each with its own scope dropdown:
 │    NET WORTH        "All accounts ▾"      metric=net_worth  group_by=account
 │       + "↑18% vs Jan 1, 2026" delta line, caption "Total across all accounts and assets"
 │    PASSIVE INCOME   "All sources ▾"       metric=rewards    group_by=source granularity=day
 │       + caption "Daily aggregated staking, savings and rewards. Tiny hourly rewards
 │         are grouped by day for clarity."
 │    TAX READINESS    "All jurisdictions ▾" metric=readiness
 │       + "Complete" sub-label, caption "Based on data completeness, reviews and documents."
 └─ Row 3 — TODAY table (+ count badge, "View all (14)" → Review)
      columns: ITEM (icon + title + sub-line) · SOURCE (name + "Import • 2h ago") ·
      AMOUNT (mono, right) · STATUS chip · "…" row menu
      chips: Review (amber) · Matched (green) · Missing doc (red)
```

Charts use the existing `recharts` `ResponsiveContainer` + `LineChart` (already a dependency —
do not add a charting library). Single white line, subtle grid, terminal dot, x-axis
`Jan 1 … Jul 16`, y-axis mono. `TrendChart` / `Sparkline` already exist in `primitives.tsx`.

Amounts render from `DecimalString` at display precision via `format.ts`. **Never** `Number()`
a money value.

Gate: `npm run check`; visual diff of the whole page against the mockup.

---

## Phase F3 — Page 2: Review (`FinanceReview.tsx`, 832 LOC)

Most of this page is already functional: the grouped queue, the detail inspector and the
confirm / split / defer round-trips all work. **Missing: pagination, the filter bar, and the
409 conflict path.**

Data: `getReviewGroups({taxYear, page, status?, eventType?})` — 10 per page — and **B5**
`getReviewCounts`.

```
<Review>
 ├─ <FilterBar>  type + status controls (B6 filters) + 4 count badges from
 │     /review-queue/counts: needs grouping · needs evidence · ready · problematic
 ├─ <GroupList>  paginated 10/page, prev/next IconButtons
 │     <GroupRow>: summary line, member count, materiality, evidence coverage, status chip
 └─ <GroupDetailPanel>  (right panel, selected group)
      ├─ Members list — each row + "remove from group" → POST /review-groups/{id}/split
      ├─ Lineage — GET /events/{id}/lineage, fetched on expand only
      ├─ Evidence — linked docs + "Attach evidence" (reuse the existing upload endpoint)
      ├─ Editable fields → B2 PATCH /events/{id} with expected_revision_id
      │     on 409 → ConfirmDialog "changed elsewhere — reload?" → refetch
      └─ Actions: Confirm · Defer · Split
```

Group/ungroup UX: checkbox-select rows → "Group"; inside the panel, "Remove from group" →
`/split`. **[PONYTAIL]** after any mutation just `refreshKey++` and refetch, no optimistic
cache surgery.

Gate: `npm run check`; manual confirm/defer/split round-trip; 409 path exercised with two
browser tabs.

---

## Phase F4 — Page 3: Reports (`FinanceReports.tsx`, 713 LOC)

Data: `getSummary`, `getTaxProfiles`, `getEvidence(taxYear)`, tax-treatments list.

```
<Reports>
 ├─ Row 1  JurisdictionReportCard × tax-profile (Sweden, Spain)
 │     flag · name · linked-document count · "Export full PDF report"
 │     → POST /reports {tax_year, jurisdiction, format:"pdf_summary"} → GET /reports/{id}/download
 │       (real multi-page PDF, from B9)
 ├─ Row 2  CategoryPackageCard × category (income, funds, gold, crypto spot, crypto staking …
 │     enumerated from the year's tax treatments)
 │     uploaded-docs indicator + three buttons: ZIP · CSV · PDF summary
 │     → POST /reports {format, category}  (B8)
 ├─ ResidencySummaryCard  residency facts per jurisdiction + treaty / multi-country risk line
 │     v1: derived text only, e.g. ">183 days in 2 jurisdictions with overlapping income
 │     categories → review advised"
 │     // ponytail: no treaty ruleset model exists; honest derived heuristic,
 │     //           upgrade = real ruleset tables
 └─ EvidenceBundleCard  "Download evidence bundle" → B7 /evidence/bundle?tax_year[&jurisdiction]
       shows the folder manifest preview (01_payslips/ … 05_residency_evidence/)
```

Downloads must be authorized: reuse whatever token-bearing fetch → blob → objectURL helper
`lib/api.ts` already has. Do not build a second download path.

Gate: `npm run check`; manual — every button produces a valid file locally.

---

## Phase F5 — Dialogs

All dialogs use the house dialog primitives + `useDialogFocus`, are mounted in `Finance.tsx`,
and `refreshKey++` on close.

### F5.1 `AddRecordDialog`
Fields: date (native `<input type="date">`) · type (Dropdown) · amount (text input validated
as a decimal **string**, mono font) · currency · account (Dropdown from `/accounts`) ·
description · jurisdiction. Submit → **B1** `createEvent(body, idempotencyKey)`.
Also opens pre-filled in edit mode from Overview/Review rows → **B2** `patchEvent`.

### F5.2 `ImportWizard` — CSV + PDF (`FinanceImportWizard.tsx`, 494 LOC, extend)
CSV already works. Add the PDF path from **B10**:
- Step 1 upload — widen `accept` to `.csv,.pdf`.
- Step 2 preview — existing mapped-row table + dedupe verdicts, **plus** for PDF rows: a
  confidence chip (`high|medium|low`, reusing `fin-chip--ok|warn|bad`), **inline-editable
  cells** (date / amount / description), low-confidence rows highlighted, and the
  `unparsed_line_count` notice. Per-row include/exclude checkbox.
- Step 3 commit — send corrected rows → created/skipped summary.

### F5.3 `AddJurisdictionDialog`
Country select limited to what the backend Literals accept — exactly `SE` + `ES` today.
`// ponytail: backend Literals gate the list — widen both sides together for jurisdiction #3`.
Plus residency status and key residency facts (days present, since-date).
Submit → `createTaxProfile` + `createResidencyFact`.

### F5.4 Settings — **[PONYTAIL] deliberately skipped**
No `SettingsLayout` NAV_ITEMS 'Finance' entry, no `/settings/finance` route in v1. Every
setting the module has (tax year, jurisdictions) lives in the finance sidebar itself. Add a
settings page only when a genuine cross-cutting preference appears.

Gate: `npm run check`; manual — added record appears in the TODAY table; CSV **and** PDF
import round-trip; a new jurisdiction card appears in the sidebar.

---

## Phase F6 — Delete the AI assistant (frontend half)

The product is dashboard-shaped; the assistant surface is not in the spec.

**You delete:**
- `apps/web/src/modules/finance/FinanceAssistant.tsx` (767 LOC)
- `apps/web/src/modules/finance/FinanceAssistant.test.tsx`
- the assistant functions and types in `api.ts` / `types.ts`
  (`createFinanceAssistantProposal`, `confirmFinanceAssistantProposal`,
  `rejectFinanceAssistantProposal`, `runFinanceAssistantTool`, `FinanceAssistantLauncher`,
  `FinanceProposalCard`, and their request/response types)
- any launcher mount in `Finance.tsx`

**Codex deletes the backend half** (`finance_assistant.py`, `finance_ai.py`, its tests, the
`include_router` line). Do not touch those.

Verify: `git grep -in 'assistant\|proposal' -- apps/web/src/modules/finance` returns nothing.

---

## Phase F7 — Docs, history, final gate

1. `docs/history/0210-finance-frontend-v1.md` — **0210 is the next free number** (0205–0208
   were taken by the merged branch, 0209 is Codex's; the master PLAN.md's "use 0205" is
   stale). All five sections required:
   `# 0210 — Finance frontend v1` · `Date:` · `Status: accepted` · `## What changed` ·
   `## Why` · `## Files touched` · `## How the pieces connect` · `## How to modify this later`.
   - *How the pieces connect*: `Finance.tsx` owns `taxYear` + `refreshKey`; the three pages
     fetch through `api.ts`; `primitives.tsx` holds every shared visual; `finance.css` derives
     `--fin-*` from global tokens only.
   - *How to modify this later*: adding a KPI card, adding a chart metric, adding a
     jurisdiction (widen the backend Literals **and** the dialog select together).
   - Include the F0.2 keep/restyle/delete table.
2. Append one line to `docs/history/CHANGELOG.md`.
3. Final gate: `cd apps/web && npm run check` (= `format:check && lint && test && build`),
   then a manual smoke of all three pages, both import types, and one PDF report download.
4. **No commits** unless the user explicitly asks.

---

## Acceptance checklist — mockup element → implementation

| Mockup element | Implementation |
|---|---|
| Shell: AppRail 60px → sidebar 230px → canvas | `Finance.tsx` restyle (F1.2) |
| Rail finance icon active + clickable | `AppRail` `ActiveRail` (verify, wired by merge) |
| THIS YEAR · `2026 ▾` · "Jan 1 – Dec 31, 2026" | `SidebarYearBlock` (F1.4) |
| JURISDICTIONS cards + `+` | `JurisdictionList` + `AddJurisdictionDialog` (F1.4, F5.3) |
| "Sweden — Resident" / "Spain — Non-resident" | residency-facts derivation (F1.4) |
| Readiness 82% ring + "On track" + action row | `RingProgress` + `summary.readiness` (F1.4) |
| WARNINGS cards + "View all warnings" | B5 `/review-queue/counts` → Review (F1.4) |
| Topbar: toggle · title · chevrons · year ▾ · tabs · actions | calendar-topbar clone (F1.3) |
| 5 KPI cards + sparkline + YoY chip | B4 `previous_year` + B3 timeseries (F2) |
| Net worth chart + "All accounts ▾" + "↑18% vs Jan 1" | `metric=net_worth group_by=account` (F2) |
| Passive income chart, day-bucketed + "All sources ▾" | `metric=rewards group_by=source` (F2) |
| Tax readiness chart + "All jurisdictions ▾" | `metric=readiness` (F2) |
| TODAY table + status chips + "…" + "View all (14)" | `GroupedActivityTable` + B6 filters (F0.3, F2) |
| Review: 10/page, filters, group/ungroup, edit, evidence, confirm | F3 |
| Reports row 1: per-jurisdiction PDF export | B9 + F4 |
| Reports row 2: per-category ZIP / CSV / PDF | B8 + F4 |
| Residency summary + treaty/risk indicator | derived v1 card (F4) |
| Evidence bundle ZIP, numbered folders | B7 + F4 |
| `+ Add record` | B1 + `AddRecordDialog` (F5.1) |
| `Import CSV` | existing preview/commit + wizard (F5.2) |
| PDF statement import w/ confidence + correction | B10 + wizard preview editing (F5.2) |
| No Activity tab / Accounts / Assets pages / AI assistant | folded or deleted (F0.3, F6) |

---

## Deliberate v1 simplifications (Ponytail ledger — frontend)

- Reuse and restyle the 7,795 shipped LOC. **Do not rebuild.**
- No react-query, no store: page-owned fetch + `refreshKey++` refetch-on-mutate.
- Emoji flags, no flag asset pack.
- `recharts` only — already a dependency, no new charting library.
- No `/settings/finance` page.
- No mock/fixture layer while waiting on the backend — the real empty state doubles as the
  placeholder.
- Country select hardcoded to `SE` + `ES`, matching the backend Literals.
- `FinanceActivity.tsx` folded into Overview's TODAY table rather than kept as a 4th surface.

---

## Definition of done

1. `cd apps/web && npm run check` green.
2. All three pages match the mockup; no new hex values, no hardcoded radii/shadows.
3. `docs/history/0210-finance-frontend-v1.md` exists with all five sections + the triage table.
4. No file under `apps/api/` was modified by you.
5. No commits created. Report: files changed, verification result, anything left to do.
