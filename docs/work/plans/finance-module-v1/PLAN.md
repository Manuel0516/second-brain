# Finance Module — Implementation Plan (v1)

> **⚠️ This plan has been split for parallel execution by two agents. Use the split plans:**
> - **[`BACKEND_CODEX.md`](./BACKEND_CODEX.md)** — owner **Codex**. Phases B0–B11, `apps/api/**` only.
> - **[`FRONTEND_CLAUDE.md`](./FRONTEND_CLAUDE.md)** — owner **Claude**. Phases F0–F7, `apps/web/**` only.
> - `CONTRACT.md` (written by Codex, read by Claude) is the seam between them.
>
> This file is kept as the historical master. Two corrections it contains are stale:
> history numbering is now **0209** (backend) / **0210** (frontend), not 0205; and the
> frontend is a **restyle of 7,795 shipped LOC**, not a from-scratch build.

Repo: `/Users/manuel/Desktop/second-brain` · Working branch: `development-finance`
Backend base: `origin/feature/finance-module` (commit `9b01d21`, exactly 1 commit ahead of current HEAD — reuse, do NOT rebuild).
Executor assumption: zero prior context. Every phase lists files, signatures, and its verification gate.

---

## 0. Ground rules (from AGENTS.md — read it first, they are law)

- **§1 Before you touch any code**: read the module you touch end to end first.
- **§2 Ponytail — mandatory**: laziest working solution; mark deliberate shortcuts with `# ponytail:` / `// ponytail:` comments naming the ceiling + upgrade path. Deliberate v1 cuts in this plan are tagged **[PONYTAIL]** with rationale.
- **§4 UI law — non-negotiable**: only CSS custom props from `apps/web/src/styles.css` (`--bg-*`, `--border*`, `--text-*`, `--accent`, `--r-*`, `--shadow-*`, `--font-ui`, `--font-mono`). NO new hex values. Section labels: `600 10px var(--font-mono) uppercase .05em`. Motion: springUp cards, `.enter` + `--enter-delay` stagger, `prefers-reduced-motion` respected. See also `docs/design/STYLE_GUIDE.md`.
- **§5 Mandatory change log**: every task ends with a `docs/history/NNNN-*.md` entry (next free number; currently `0204` is the latest → use `0205-finance-module.md`) with exact sections: `# NNNN — Short title`, `Date:`, `Status:`, `## What changed`, `## Why`, `## Files touched`, `## How the pieces connect`, `## How to modify this later`.
- **§6 Workflow**: verify before done. Frontend gate: `cd apps/web && npm run check` (= `format:check && lint && test && build`). Backend gate: `cd apps/api && pytest` (house SQLite pattern, 153 tests green on the branch — keep them green).
- **Decimal discipline**: `Numeric(38,18)` / `Numeric(24,8)` in DB, DecimalString on the wire. NEVER introduce floats anywhere in finance code paths (backend Decimal, frontend keep amounts as strings, format for display only).
- **Append-only law**: migration `034_finance_immutability.py` installs DB triggers forbidding UPDATE on event tables. "Edit" = append a superseding revision. Never fight the triggers.
- **Migrations**: 029–038 form a clean linear chain from 028. Do NOT delete or renumber any migration (incl. `033_finance_ai.py`, even though we delete the assistant — orphan tables are harmless; the chain is not). **[PONYTAIL]** leave 033's tables in place; dropping them = new migration + risk for zero user value.

---

## Phase 0 — Merge + local environment

### 0.1 Merge the backend branch  ⚠️ CREATES COMMITS — GET EXPLICIT USER GO-AHEAD FIRST
```
git checkout development-finance
git merge --ff-only origin/feature/finance-module   # 9b01d21 is exactly 1 ahead → fast-forward
```
If `--ff-only` fails (local commits appeared since audit), STOP and ask the user before doing a real merge.

### 0.2 Environment to run locally
- Generate the Fernet key (prod startup hard-requires it):
  `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` → `FINANCE_ENCRYPTION_KEY=<value>` in `apps/api/.env`.
- Set the other required `FINANCE_*` vars (branch has 5 total; known: `FINANCE_ENCRYPTION_KEY`, `FINANCE_SCAN_TIMEOUT_SECONDS`, `FINANCE_OCR_TIMEOUT_SECONDS`; executor: `git grep -n 'FINANCE_' -- apps/api` after merge for the authoritative list + defaults, put dev-safe values in `.env`).
- Docker: branch Dockerfile already adds `clamav`, `poppler-utils`, `tesseract`. For bare-metal dev without clamav, use the branch's degraded-scan mode (scan step is timeout/absence tolerant — verify via `finance_evidence.py`; if it hard-fails, add a `FINANCE_SCAN_DISABLED=1` dev flag, `# ponytail: dev-only escape hatch, never set in prod`).
- `pdftotext` needed locally for Phase 1.10: `brew install poppler` on the dev Mac (already in the Docker image).

### 0.3 Verify baseline
`cd apps/api && pytest` → 153 green. `cd apps/web && npm run check` → green. Do not proceed otherwise.

---

## Phase 1 — Backend additions (~1,000 LOC total) + assistant deletion

All routes live under `/api/finance`, follow existing router conventions (Idempotency-Key header on mutations, hash-chained audit append on every mutation, DecimalString responses). New service logic goes next to its neighbors in `apps/api/app/services/`, routes in `apps/api/app/routes/`.

### 1.1 `POST /api/finance/events` — manual "Add record"
- File: `apps/api/app/routes/finance.py` (+ helper in `apps/api/app/services/finance_import_projection.py` — reuse its row→event projection helpers).
- Body: `{tax_year: int, occurred_at: datetime, event_type: str, amount: DecimalString, currency: str, account_id: UUID|null, asset_id: UUID|null, description: str, jurisdiction: "SE"|"ES"|null}`. Header: `Idempotency-Key` (required).
- Behavior: append event with `derivation_type="manual"`, write audit-chain entry. 201 → full event payload.
- Test: `apps/api/tests/test_finance_manual_events.py` — create, idempotent replay returns same event, Decimal round-trips exactly (`"1234.567890123456789012"`), audit row appended.

### 1.2 `PATCH /api/finance/events/{event_id}` — edit as append-revision
- Same files. Body: partial editable fields + `expected_revision_id: UUID` (optimistic lock).
- Behavior: INSERT new revision with `supersedes_revision_id=<current>`; never UPDATE (triggers forbid it). 409 if `expected_revision_id` is stale. Audit + Idempotency-Key as above.
- Test: revision chain length grows, old revision untouched, stale lock → 409, direct UPDATE still blocked by trigger (assert raises).

### 1.3 `GET /api/finance/timeseries`
- Query: `tax_year` (required), `granularity=day|week|month` (default `day`), `metric=income|expense|rewards|transfers|net_worth|readiness` (required), `group_by=account|source|asset_type` (optional).
- Response: `{metric, granularity, tax_year, series: [{key: str|"all", label: str, points: [{date: "YYYY-MM-DD", value: DecimalString}]}]}`.
- Impl: single service module `apps/api/app/services/finance_timeseries.py`; SQL GROUP BY date_trunc-equivalent (portable for the SQLite test pattern: group on substr of ISO date — copy whatever date-bucketing trick the branch's `finance_reconciliation.py`/`finance_core.py` already uses). `net_worth` = cumulative sum; `readiness` = completeness ratio per bucket (reuse `/summary` tri-state logic); `rewards` daily-aggregated (this is what makes tiny hourly staking rewards chartable). Powers all 5 sparklines + all 3 Overview charts with one endpoint. **[PONYTAIL]** no caching; recompute per request — add materialization only if slow on real data.
- Test: `apps/api/tests/test_finance_timeseries.py` — seed events across months, assert bucket sums as exact Decimals, group_by splits, readiness monotonicity not required (just correctness).

### 1.4 `previous_year` block on `GET /summary`
- Extend the existing summary service: add `previous_year: {tax_year, income, expenses, rewards, transfers, review_open}` (same DecimalString totals computed for `tax_year - 1`). Frontend computes the % chips (avoids float math on the server). 
- Test: extend `test_finance_api_contract.py` — seed 2025+2026 events, assert both blocks.

### 1.5 `GET /api/finance/review-queue/counts`
- Query: `tax_year`, `jurisdiction?`. Response: `{needs_grouping: int, needs_evidence: int, ready: int, problematic: int}`.
- Derivation (in `apps/api/app/services/finance_reconciliation.py` or wherever review_groups queries live — `finance_review.py` router): bucket from `review_groups.evidence_coverage` / `materiality` / `status` + presence of `open_questions`. One SQL pass with CASE buckets.
- Test: seed groups in each state, assert 4 counts.

### 1.6 Filter params: `event_type`, `group_id` on `GET /activity` and `GET /review-groups`
- Pure query-param plumbing on existing endpoints (`finance.py`, `finance_review.py`). ~30 LOC.
- Test: extend existing activity/review tests with filtered assertions.

### 1.7 `GET /api/finance/evidence/bundle`
- Query: `tax_year` (required), `jurisdiction?`. Streams a ZIP (`StreamingResponse`, stdlib `zipfile` + `io.BytesIO` — no new dep).
- Deterministic folder layout keyed off `evidence_documents.source_kind` via one dict in `apps/api/app/services/finance_evidence.py`:
  `{"payslip": "01_payslips", "exchange_statement": "02_exchange_statements", "wallet_export": "03_wallet_exports", "contract": "04_contracts", "residency_evidence": "05_residency_evidence", <remaining source_kind values → 06_..., 99_other>}` — executor: enumerate actual `source_kind` values from the branch schema/enum and cover them all; unknown → `99_other/`. Deterministic order (sort by folder, then filename) so the ZIP is reproducible.
- Test: `apps/api/tests/test_finance_evidence_bundle.py` — seed docs of 3 kinds, unzip in-memory, assert exact paths.

### 1.8 `?category=` filter on `POST /reports`
- `category` exists on `tax_treatment_revisions`; join reports selection through treatments. Body gains optional `category: str`. Applies to all three formats (`zip|csv|pdf_summary`).
- Test: extend `test_finance_reconciliation.py`/reports tests — category-filtered report excludes other categories.

### 1.9 Real PDF generation — replace `_pdf_bytes`
- **Dependency choice: `reportlab`** (the ONE approved new pip dep). Justification: pure pip install, zero new system libraries (weasyprint drags in pango/cairo/gdk-pixbuf apt packages → Docker image churn and macOS dev friction); platypus flowables handle multi-page tables + repeated headers natively; report content is tabular, not HTML-styled, so weasyprint's HTML/CSS engine buys nothing here.
- File: `apps/api/app/services/finance_reports.py` — replace the 7-line placeholder `_pdf_bytes` (branch lines ~455–464) with a platypus document: **cover page** (jurisdiction, tax year, generated-at, profile identity), **per-schedule tables** (one section per treatment category: income, funds, gold, crypto spot, crypto staking, …; columns date/description/amount/currency/treatment; DecimalStrings rendered verbatim), **evidence manifest** (filename, source_kind, sha/hash if stored, linked events count), **residency facts** section. ~250 LOC.
- Add `reportlab` to `apps/api` requirements + lockfile. No Dockerfile change needed.
- Test: `apps/api/tests/test_finance_reports_pdf.py` — bytes start `%PDF`, page count > 1 for a seeded multi-category year (parse with `pypdf` ONLY if already installed; otherwise assert on raw byte markers `/Type /Page` count — **[PONYTAIL]** no second new dep just to test).

### 1.10 PDF statement import (NEW pipeline, generic, no per-bank parsers)
- Files: `apps/api/app/services/finance_pdf_statements.py` (new, ~250 LOC), wire into `apps/api/app/services/finance_imports.py` + `apps/api/app/routes/finance_ingestion.py`.
- Flow — reuses the exact CSV path so commit-side dedupe/audit is untouched:
  1. `POST /imports/preview` accepts `application/pdf` uploads (today: CSV only; PDF currently lands as metadata/OCR-excerpt with the "creates no ledger events" warning — replace that dead end).
  2. Extraction: `subprocess.run(["pdftotext", "-layout", ...])` (poppler already in the image; honor `FINANCE_OCR_TIMEOUT_SECONDS`). If pdftotext yields no text (scanned PDF), fall back to the branch's existing tesseract OCR path for text, then same heuristics.
  3. Heuristics (generic): per-line regex for a date token (`\d{4}-\d{2}-\d{2}`, `\d{2}[./-]\d{2}[./-]\d{4}`, `\d{1,2} \w{3}`…), a signed amount token (rightmost `-?[\d.,  ]+`-shaped number, normalize `,`/`.` thousand-decimal by column consistency), remainder = description. Column alignment from `-layout` output used to keep multi-amount lines sane (amount = rightmost numeric column; a second numeric column, if present on most lines, is treated as running balance and dropped).
  4. Per-row `confidence: "high"|"medium"|"low"` — high: date+amount both parsed unambiguously; medium: date OR amount needed normalization guessing; low: partial parse (row still shown, user must correct). Rows that parse nothing are skipped but counted in `unparsed_line_count`.
  5. Output: mapped rows into the SAME preview payload shape as CSV (so `/imports/{id}/commit` and the 3-layer dedupe work unchanged), each row carrying `{confidence, source_line}` extra fields; preview response gains `{source_format: "csv"|"pdf", unparsed_line_count}`.
  6. Commit: unchanged endpoint; user-corrected rows come back through the existing preview-edit mechanism (if the branch preview is read-only, add row-level override fields to the commit body — check `finance_imports.py` first; prefer whatever edit surface already exists).
  - `# ponytail: generic line heuristics, no per-bank templates — add a bank-template table when a real bank's statement fails.`
- Test: `apps/api/tests/test_finance_pdf_import.py` — fixture PDF built in-test (reportlab! already a dep after 1.9) with a known 6-row table incl. one ambiguous row → preview returns 6 rows, confidences as expected, commit creates events, re-import dedupes to 0 new.

### 1.11 Delete the AI assistant (−1,647 LOC)
- Delete `apps/api/app/routes/finance_assistant.py`, remove its single `include_router` line (in the app factory — `git grep -n finance_assistant apps/api/app` post-merge; branch grep shows the router registration plus `apps/api/app/services/finance_ai.py`).
- Delete its tests: `apps/api/tests/test_finance_ai_security.py` (+ any other `finance_ai`/assistant test files).
- Delete `apps/api/app/services/finance_ai.py` **iff** `git grep finance_ai` shows no non-assistant importer; otherwise leave and note.
- Keep migration `033_finance_ai.py` and its tables (see Ground rules).

### Phase 1 gate
`cd apps/api && pytest` — all green (153 − assistant tests + new tests). Manual smoke: `uvicorn` up with env from 0.2, hit `/api/finance/summary`, `/timeseries`, `/imports/preview` with a PDF.

---

## Phase 2 — Frontend foundation (types → shell → sidebar → topbar)

### 2.1 `apps/web/src/modules/finance/api.ts`
Wrappers over `lib/api.ts` `apiCall` (caller passes `/api/finance/...`; 401→refresh→retry handled inside). Types mirror wire shapes; **amounts are `string` (DecimalString), never `number`** except chart-render conversion at the last moment.
Exports (complete list — every endpoint the 3 pages need):
`getSummary(taxYear)`, `getTimeseries({taxYear, metric, granularity, groupBy?})`, `getActivity({taxYear, eventType?, groupId?, limit?})`, `getReviewGroups({taxYear, status?, eventType?, page})`, `getReviewCounts(taxYear)`, `confirmGroup(id, body)`, `splitGroup(id, body)`, `deferGroup(id, body)`, `getTaxProfiles()`, `createTaxProfile(body)`, `createResidencyFact(body)`, `getEvidence(taxYear)`, `previewImport(file /* csv|pdf */)`, `commitImport(id, body)`, `getImports()`, `createEvent(body, idempotencyKey)`, `patchEvent(id, body)`, `createReport({taxYear, jurisdiction, format, category?})`, `reportDownloadUrl(id)`, `evidenceBundleUrl(taxYear, jurisdiction?)`, `getLineage(eventId)`.
Idempotency-Key: `crypto.randomUUID()` per submit attempt, held stable across retries of that submit.

### 2.2 Routing + rail
- `apps/web/src/App.tsx`: `const Finance = lazy(() => import('./modules/finance/Finance'))`; route `/finance/*` (tab in path: `/finance`, `/finance/review`, `/finance/reports`) inside the same `<Suspense>` pattern as `/fitness` `/food`.
- `apps/web/src/components/AppRail.tsx`: add `'finance'` to the `ActiveRail` union; give the existing inert `IconFinance` `RailBtn` `active={active==='finance'}` + `onClick={() => nav('/finance')}`.

### 2.3 `Finance.tsx` — shell
Component tree:
```
<Finance>                      // owns: taxYear, tab (from route), sidebarOpen, refreshKey
 ├─ <FinanceSidebar/>          // Sidebar.tsx (230px, inside SidebarShell if that's how food/fitness do it — copy their shell usage)
 ├─ <div class="fin-canvas">
 │   ├─ <FinanceTopbar/>       // inline in Finance.tsx (Calendar.tsx:349-455 copied structure)
 │   └─ <Overview|Review|Reports taxYear refreshKey onRefresh/>
 └─ dialogs (Phase 6) mounted here
```
Data ownership per house pattern: each page does `useState + useEffect + Promise.all` keyed on `[taxYear, refreshKey]`. No react-query. **[PONYTAIL]** no context/provider; props only — three pages don't justify a store.

### 2.4 Topbar (gold standard: `Calendar.tsx:349-455`)
Copy the `.cal-toolbar` structure/classnames-recipe into `.fin-toolbar`: sidebar-toggle `IconButton` · "Finance" title · prev/next SVG chevron buttons (step taxYear ±1) · `Dropdown` "Tax year 2026 ▾" (years present in tax-profiles ∪ current) · `Segmented` tabs `[Overview | Review | Reports]` → route nav · right group: `+ Add record` button, `⬆ Import CSV` button (opens Import wizard; label stays "Import CSV" per mockup even though wizard also takes PDF — actually label it "Import" if mockup allows; DEFAULT: match mockup text exactly: "Import CSV"). Same font/classes conventions, `.enter` + `--enter-delay` stagger.

### 2.5 `FinanceSidebar` (Sidebar.tsx), top→bottom per spec
- **THIS YEAR**: section label + selector card; defaults to current year (2026), renders "Jan 1 – Dec 31, 2026"; changing it calls `setTaxYear` → everything swaps (all fetches key on taxYear).
- **JURISDICTIONS**: label + `+` `IconButton` → AddJurisdictionDialog (Phase 6.3). Cards from `getTaxProfiles()`: circular flag (span with flag emoji in a `border-radius: 50%` tile — **[PONYTAIL]** emoji flags, no flag-icon asset pack; swap when someone complains about Windows rendering), name + residency status line ("Sweden — Resident", "Spain — Non-resident") derived from residency-facts, chevron → expands details inline (facts list). 
- **READINESS**: card "Tax readiness 82% — On track" + circular progress ring — hand-rolled SVG `strokeDasharray/strokeDashoffset` pattern copied from `modules/food/Food.tsx:439-497`. Value = `summary.readiness`. Action row "Complete your review to increase accuracy" → `nav('/finance/review')`.
- **WARNINGS**: cards from `getReviewCounts` + summary: "8 unreviewed rewards — Review in queue" (rewards-type open groups), "3 missing documents — Add to improve readiness" (needs_evidence), "View all warnings" → Review tab with filter preset.

### 2.6 `finance.css` — class plan
Module accent tokens exactly like `modules/food/food.css:6-12`:
```
.fin-root { --fin-accent: <color-mix over var(--accent)>; --fin-accent-tint: ...; --fin-accent-border: ...; }
```
Classes (prefix `fin-`): `fin-root`, `fin-sidebar`, `fin-side-section`, `fin-side-label` (600 10px var(--font-mono) uppercase .05em), `fin-juris-card`, `fin-flag`, `fin-ring`, `fin-warning-card`, `fin-canvas`, `fin-toolbar` (clone of `.cal-toolbar` recipe), `fin-grid-kpi`, `fin-card` (clone of `.cal-card` recipe: padding 14px, `var(--border-strong)`, `var(--r-lg)`, `var(--bg-elevated)`, `var(--shadow-md)`), `fin-kpi`, `fin-kpi-delta` (chip; up/down/flat), `fin-chart-card`, `fin-table`, `fin-chip` + `fin-chip--ok|warn|bad` (green=Matched, amber=Review, red=Missing doc — from existing `--feeling-*` semantic scale or accent tints, NO new hex), `fin-row-actions`, `fin-detail-panel`, `fin-dialog-*`. springUp + `.enter` stagger on cards; `@media (prefers-reduced-motion: reduce)` kill transitions.

### Phase 2 gate
`npm run check` green; `/finance` renders shell+sidebar with live summary data; rail nav works; tax year switch refetches.

---

## Phase 3 — Page 1: Overview (`Overview.tsx`)

Fetch on `[taxYear, refreshKey]`: `Promise.all([getSummary, getTimeseries×(income,expense,rewards,transfers,net_worth,readiness — batched as needed), getActivity({limit:~8}), getReviewCounts])`. **[PONYTAIL]** 5 sparklines share the per-metric timeseries calls used by the big charts where metrics overlap; fire at most ~6 requests, don't build a batching layer.

Component tree:
```
<Overview>
 ├─ <section class="fin-grid-kpi">           // 5 × <KpiCard>
 │    KpiCard: title, value (formatted DecimalString, €), <Sparkline/> (recharts LineChart,
 │    no axes), delta chip "+12% vs 2025" computed from summary.previous_year
 │    Cards: Income €YTD (+12%), Expenses (−4%), Rewards (+27%), Transfers (0%),
 │           Review Queue (14 items + "8 unreviewed" chip — counts, not currency)
 ├─ <section class="fin-grid-charts">        // 3 × <ChartCard>
 │    1. Net worth: total headline, Dropdown "All accounts ▾" (group_by=account keys),
 │       LineChart timeseries, "+18% vs Jan 1, 2026" delta line
 │    2. Passive income YTD: Dropdown "All sources ▾", daily-aggregated staking/savings/
 │       rewards (backend 1.3 already buckets hourly rewards by day)
 │    3. Tax readiness %: Dropdown "All jurisdictions ▾", readiness timeseries
 └─ <TodayTable>                             // "TODAY" section label + fin-table
      rows: title+subtitle, source, amount (mono), status chip (Review/Matched/Missing doc),
      "…" row-actions (Popover: Open in Review, Edit → Phase 6.1 dialog, Lineage),
      footer "View all (14)" → /finance/review
```
Recharts conventions copied from `modules/fitness/Overview.tsx:24-30`: `ResponsiveContainer`, `LineChart`, tooltip style with `var(--bg-elevated)` etc. Chart values: `Number(decimalString)` at render only (display-precision loss acceptable for charts; **never** send back).

Gate: `npm run check`; visual diff vs mockup for card/row layout.

---

## Phase 4 — Page 2: Review (`Review.tsx`)

Fetch: `getReviewGroups({taxYear, page, status?, eventType?})` (10/page — pass page size if API supports, else slice; check `finance_review.py` pagination params post-merge), `getReviewCounts`.

```
<Review>
 ├─ <FilterBar>: Segmented or Dropdowns for type + status (uses 1.6 filters), 4 count
 │    badges from review-queue/counts (needs grouping / needs evidence / ready / problematic)
 ├─ <GroupList> (paginated, 10/page, prev/next IconButtons)
 │    <GroupRow>: summary line, member count, materiality, evidence coverage, status chip
 └─ <GroupDetailPanel> (right panel, selected group)
      ├─ Members list (each: event line + ungroup action → POST /split)
      ├─ Lineage (GET /events/{id}/lineage on expand)
      ├─ Evidence: linked docs + "Attach evidence" (POST /evidence link — reuse existing endpoint)
      ├─ Editable fields → PATCH /events/{id} (append-revision; send expected_revision_id,
      │    on 409 show ConfirmDialog "changed elsewhere — reload?")
      └─ Actions: Confirm (POST /review-groups/{id}/confirm), Defer (/defer), Split (/split)
           — all optimistic-locked: send the version/etag field the API defines; 409 → refetch row
```
Group/ungroup UX: checkbox-select rows → "Group" action; inside panel "Remove from group" → `/split`. Optimistic UI: apply locally, rollback on error (house pattern: just `refreshKey++` after mutation — **[PONYTAIL]** full refetch over granular cache surgery).

Gate: `npm run check`; manual: confirm/defer/split round-trips against local API, 409 path exercised (two tabs).

---

## Phase 5 — Page 3: Reports (`Reports.tsx`)

Fetch: `getSummary`, `getTaxProfiles`, `getEvidence(taxYear)`, treatments list (for category cards + doc indicators).

```
<Reports>
 ├─ Row 1 <JurisdictionReportCard> × per tax-profile (Sweden, Spain):
 │    flag, name, linked-document count, "Export full PDF report" button →
 │    POST /reports {tax_year, jurisdiction, format:"pdf_summary"} → poll/await → 
 │    GET /reports/{id}/download (real multi-page reportlab PDF from 1.9)
 ├─ Row 2 <CategoryPackageCard> × category (income, funds, gold, crypto spot, crypto staking, …
 │    — categories enumerated from tax_treatment_revisions present in the year):
 │    uploaded-docs indicator (n docs linked), three download buttons: ZIP / CSV / PDF summary
 │    → POST /reports {format, category} (1.8) → download
 ├─ <ResidencySummaryCard>: residency facts per jurisdiction + treaty overview / multi-country
 │    risk indicator — v1: derived text only from residency-facts + confirmed treatments
 │    (e.g. ">183 days in 2 jurisdictions with overlapping income categories → review advised").
 │    // ponytail: no treaty ruleset model exists; honest derived heuristic, upgrade = real ruleset tables
 └─ <EvidenceBundleCard>: "Download evidence bundle" → GET /evidence/bundle?tax_year[&jurisdiction]
      (ZIP with 01_payslips/ 02_exchange_statements/ 03_wallet_exports/ 04_contracts/
       05_residency_evidence/ … from 1.7); shows folder manifest preview from getEvidence counts
```
Downloads: anchor with auth — reuse whatever existing download pattern `lib/api.ts` has for authorized file GETs (check how the branch's report download was meant to be consumed; likely token-bearing fetch → blob → objectURL).

Gate: `npm run check`; manual: each button yields a valid file locally.

---

## Phase 6 — Dialogs

All dialogs: `ConfirmDialog`/dialog primitives + `useDialogFocus`, mounted in `Finance.tsx`, close → `refreshKey++`.

### 6.1 AddRecordDialog (`AddRecordDialog.tsx`)
Fields: date (`<input type="date">` — native), type (Dropdown), amount (text input validated as decimal **string**, mono font), currency, account (Dropdown from /accounts), description, jurisdiction. Submit → `createEvent(body, uuid)` (1.1). Also opens pre-filled in edit mode from Overview/Review rows → `patchEvent` (1.2).

### 6.2 ImportWizard (`ImportWizard.tsx`) — CSV + PDF
Step 1 upload (accept `.csv,.pdf`) → `previewImport(file)`.
Step 2 preview table: mapped rows; dedupe verdicts from the 3-layer dedupe; for PDF rows additionally a confidence chip (high/medium/low reusing `fin-chip--ok|warn|bad`) and **inline-editable cells** (date/amount/description) for manual correction; low-confidence rows highlighted; `unparsed_line_count` notice; per-row include/exclude checkbox.
Step 3 commit → `commitImport(id, {rows: corrected})` → summary (created/skipped counts) → done.

### 6.3 AddJurisdictionDialog (`AddJurisdictionDialog.tsx`)
Country (v1 select limited to what backend Literals accept — ~17 hardcoded "SE"/"ES" spots on the branch; expose exactly SE + ES and any others actually accepted; `// ponytail: backend Literals gate the list — widen both together for jurisdiction #3`), residency status, key residency facts (days present, since-date). Submit → `createTaxProfile` + `createResidencyFact(s)`.

### Settings
**[PONYTAIL — skipped]** No `SettingsLayout` NAV_ITEMS 'Finance' entry, no `/settings/finance` route in v1: every setting the module has (tax year, jurisdictions) lives in the finance sidebar itself. Add only when a real cross-cutting preference appears.

Gate: `npm run check`; manual: add record appears in Today table; CSV and PDF import round-trip; new jurisdiction card appears.

---

## Phase 7 — Docs, history, final gate

1. `docs/history/0205-finance-module.md` — mandatory format:
   `# 0205 — Finance module (v1)` · `Date:` · `Status: accepted` · `## What changed` (merge of feature/finance-module; backend additions 1.1–1.10; assistant deletion; 3-page frontend) · `## Why` · `## Files touched` (full list) · `## How the pieces connect` (event-sourced append-only ledger → imports → review groups → treatments → reports; frontend pages over /summary /timeseries /review-groups /reports) · `## How to modify this later` (3rd jurisdiction = widen Literals; per-bank PDF templates; treaty ruleset).
2. Update `docs/history/CHANGELOG.md` if the house convention appends there too (check top of file; 0204 pattern).
3. If AGENTS.md §7 documentation structure expects a module doc, add the minimal one; otherwise skip (**[PONYTAIL]** — the history entry's "How the pieces connect" already carries the architecture summary).
4. Final gates, in order: `cd apps/api && pytest` → `cd apps/web && npm run check` → manual smoke of all three pages + both imports + one PDF report download.
5. Commits: conventional, small; ⚠️ all commits need the same user go-ahead as the merge (read-only session until user says go).

---

## Acceptance checklist — mockup element → implementation

| Mockup element | Implementation |
|---|---|
| Shell: AppRail 60px → sidebar 230px → canvas | Finance.tsx + fin-sidebar/fin-canvas (2.3) |
| Rail finance icon active+clickable | AppRail ActiveRail + onClick (2.2) |
| THIS YEAR "Jan 1 – Dec 31, 2026" selector | Sidebar section (2.5), taxYear state |
| JURISDICTIONS cards + "+" | tax-profiles + AddJurisdictionDialog (2.5, 6.3) |
| "Sweden — Resident" / "Spain — Non-resident" | residency-facts derivation (2.5) |
| Readiness 82% ring + "On track" + action row | Food.tsx ring pattern + summary.readiness (2.5) |
| WARNINGS cards + "View all warnings" | review-queue/counts (1.5) + Review nav (2.5) |
| Topbar: toggle/title/chevrons/year dropdown/tabs/actions | Calendar gold-standard clone (2.4) |
| 5 KPI cards + sparkline + YoY chip | summary.previous_year (1.4) + timeseries (1.3) (Phase 3) |
| Net worth chart + "All accounts ▾" + "+18% vs Jan 1" | timeseries metric=net_worth group_by=account (3) |
| Passive income daily-aggregated chart + "All sources ▾" | metric=rewards group_by=source, day buckets (1.3, 3) |
| Tax readiness chart + "All jurisdictions ▾" | metric=readiness (1.3, 3) |
| TODAY table + status chips + "…" + "View all (14)" | /activity + filters (1.6), chips fin-chip--* (3) |
| Review: paginated 10/page, filters, group/ungroup, edit, evidence, confirm | Phase 4 over /review-groups + confirm/split/defer + PATCH events (1.2, 1.6) |
| Reports row 1: per-jurisdiction PDF export | POST /reports pdf_summary + reportlab (1.9, 5) |
| Reports row 2: category ZIP/CSV/PDF | ?category= (1.8, 5) |
| Residency summary + treaty/risk indicator | derived v1 card (5) |
| Evidence bundle ZIP with numbered folders | /evidence/bundle (1.7, 5) |
| + Add record | POST /events (1.1) + dialog (6.1) |
| Import CSV | existing preview/commit + wizard (6.2) |
| Import PDF statements w/ confidence + correction | pipeline (1.10) + wizard preview editing (6.2) |
| No Activity page / Accounts / Assets pages / AI assistant | not built; assistant deleted (1.11) |

## Deliberate v1 simplifications (Ponytail ledger)
- Keep migration 033 tables after assistant deletion — chain integrity > tidiness.
- Emoji flags, no flag asset pack.
- No react-query/store; page-owned fetch + refreshKey refetch-on-mutate.
- Timeseries computed per request, no cache.
- Generic PDF line heuristics, no per-bank templates.
- Treaty/risk = derived heuristic text, no ruleset model.
- No /settings/finance page.
- "SE"/"ES" Literals stay hardcoded (~17 spots) — widen with jurisdiction #3.
- PDF test asserts byte markers, no pypdf dep.
