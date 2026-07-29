# Finance agent execution plan

This plan is for implementing the Finance module with multiple one-shot agents:

- **Codex agents:** backend, domain logic, imports, ledger, tax/reporting, AI safety and tests.
- **Claude Code goal-mode agent:** Finance frontend UX and interaction polish.

The target remains one repository-native `/finance` module. Agents must follow the root
`AGENTS.md` and this finance folder's `AGENTS.md`.

## Short answer: can both tracks run at the same time?

Yes, after the foundation contract is frozen.

Claude can build the Finance UI while Codex builds backend logic if:

1. The API/data contract is written first.
2. Claude works only in the web-owned files and uses fixtures or mocked API responses until the
   backend is available.
3. Codex agents do not edit Finance UI files or global CSS.
4. Only one agent owns `models.py` and migration ordering at a time.
5. A final integration agent runs the complete checks after both tracks are combined.

Do not run independent agents against the same working tree. Use separate worktrees or branches,
then integrate the outputs into `feature/finance-module` deliberately.

## Ownership map

| Area | Owner | Rule |
|---|---|---|
| Finance schema, invariants and migrations | Codex foundation/lead | One owner for `models.py` and migration sequence |
| FastAPI routes and finance services | Codex backend agents | No UI edits; all routes are owner-scoped |
| Import parsers and evidence | Codex ingestion agent | Uses existing MinIO; preserves raw inputs |
| Ledger, lots, valuation, reconciliation | Codex ledger agent | Decimal-safe, revisioned, fixture-driven |
| Tax profiles, reports and exports | Codex reporting agent | Versioned rules and frozen snapshots |
| AI tools and security tests | Codex AI/security agent | Read-first, typed, confirmation-gated |
| `/finance` screens and module CSS | Claude Code | Uses frozen API contract and existing style tokens |
| `App.tsx` route and `AppRail.tsx` scaffold | Codex foundation, then locked | Claude does not rework routing or shared rail |
| Global `styles.css`, shared components | Lead/integrator only | Change only with explicit design-system justification |
| History entries and `CHANGELOG.md` | Integrator | One coherent entry per completed vertical slice |

## Execution graph

```text
Wave 0: Codex foundation
  ├─ schema + invariants + fixtures
  ├─ API contract + route scaffold
  └─ /finance route + active rail scaffold
             │ contract freeze
             ├──────────────────────────────┐
Wave 1: Codex ingestion/ledger       Wave 1: Claude UX goal-mode
  ├─ imports + evidence               ├─ overview/activity/review shell
  ├─ events + revisions               ├─ fixture-driven states
  └─ postings + reconciliation        └─ responsive/accessibility polish
             │──────────────────────────────┘
Wave 2: Codex tax/report/AI + Claude UX deep screens
  ├─ Sweden/Spain profiles and reports ├─ accounts/assets/evidence
  ├─ frozen exports and lineage        ├─ reports/assistant panel
  └─ typed AI tools and security       └─ confirmation/error/empty states
             │
Wave 3: Codex integration and release gate
  ├─ merge conflict resolution
  ├─ full backend/frontend/security tests
  ├─ visual and API contract verification
  └─ history/changelog and handoff
```

## Wave 0 — Codex foundation agent

Run this first and only once.

### Scope

- Read the repository root instructions, finance plan, backend/database/frontend architecture and
  style guide.
- Freeze the first vertical-slice event vocabulary and decimal-string API contract.
- Add the first Finance ORM models and forward-only Alembic migration(s).
- Add finance route registration in `apps/api/app/main.py`.
- Add `/finance` lazy route in `apps/web/src/App.tsx` and enable the existing Finance button in
  `apps/web/src/components/AppRail.tsx`.
- Create the initial module shell and placeholder API/types files only; do not build the full UI.
- Add anonymized fixtures and invariant test scaffolding.
- Produce `docs/work/plans/second-brain-finance-module/09-delivery/FINANCE_API_CONTRACT.md` with
  request/response examples, decimal-string rules, status values, IDs and error shapes.

### Acceptance

- Authenticated `/finance` loads an empty state.
- The API router is mounted and protected.
- The first migration applies cleanly and is reversible in development.
- Fixture values and expected totals are documented.
- `npm run check` passes.

### One-shot prompt

> Implement Wave 0 of the Finance agent execution plan. Work only on the foundation scope. Use
> the existing React/Vite, FastAPI, SQLAlchemy, Alembic, MinIO, JWT and Link conventions. Do not
> add dependencies, Redis, a worker or a second app. Freeze the API contract and fixture
> invariants before adding UI or advanced finance features. Run the relevant checks, update the
> finance plan documentation, and report files changed, tests, assumptions and deferred work.

## Wave 1A — Codex ingestion/evidence agent

### Scope

- CSV first: upload, preview, column mapping, parser version, commit and idempotency.
- Raw import and raw-record persistence with rejected rows.
- File hash and row/provider/semantic duplicate detection.
- Finance evidence upload for allowed PDF/CSV/JSON/image/archive types.
- MinIO object provenance and deletion protection for finance evidence.
- Lineage endpoint from source → raw record → event revision.

### Constraints

- Do not overwrite raw source bytes or raw rows.
- Do not change Notes' image-only upload behavior.
- Do not add a migration without coordinating with the foundation owner.
- Keep parser logic deterministic and fixture-driven.

### Acceptance

- Importing the same fixture twice does not change totals or duplicate postings.
- Rejected rows remain visible.
- Evidence can link to multiple events and be retrieved only by its owner.
- Malicious file/archive limits are tested.

## Wave 1B — Codex ledger/reconciliation agent

### Scope

- Canonical finance events and append-only revisions.
- Event components and balanced postings.
- Decimal-safe valuation snapshots.
- Review groups for daily passive-income micro-events.
- Transfer matching and opening + movements = closing reconciliation.
- Confirm/edit/split/defer actions with audit entries.

### Acceptance

- A 24-event reward fixture displays as one group but expands to all 24 records.
- Confirming a group creates the expected revision/postings/audit data.
- Splitting preserves totals.
- Material reconciliation differences block report readiness.

## Wave 1C — Claude Code Finance UX agent

Start after Wave 0's contract freeze. This may run concurrently with Waves 1A and 1B.

### Scope

Own only:

- `apps/web/src/modules/finance/**` except foundation-owned `api.ts`/`types.ts` when those are
  already created;
- Finance module CSS using existing global tokens;
- Finance-specific component tests.

Build:

- Overview with tax-year/jurisdiction/readiness context.
- Activity with grouped/raw-event progressive disclosure.
- Review queue with filter/sidebar/detail inspector and confirmation preview.
- Accounts/assets/evidence navigation states.
- Loading, empty, error, missing-evidence, missing-price and reconciliation-warning states.
- Mobile evidence capture/review and keyboard-accessible desktop review.
- Assistant launcher/panel shell using the later typed-tool contract.

### Claude goal-mode prompt

> Build the Finance UX as a new `/finance` module inside the existing Second Brain React/Vite
> app. Read root AGENTS.md, the finance plan AGENTS.md, STYLE_GUIDE.md, FRONTEND.md and
> FINANCE_API_CONTRACT.md before coding. Use only existing CSS custom properties and the existing
> rail→sidebar→canvas shell. Do not introduce new colors, spacing scales, radii, animation
> systems, dependencies, routes, API shapes or backend logic. Use fixture/mock data where APIs
> are not ready, but keep all components aligned to the frozen contract. Implement the full
> overview, activity, review, accounts, assets, evidence, reports and assistant-panel UX with
> accessible empty/error/loading states and responsive behavior. Run `npm run check:web`, report
> every file changed, and list any backend contract assumptions without silently changing them.

## Wave 2A — Codex tax/reporting agent

Run after event/revision/posting contracts are stable.

### Scope

- Sweden/Spain tax profiles and residency facts.
- Versioned candidate/confirmed tax treatments.
- Lots, funds/ETF/gold, crypto, staking, lending, futures, funding, fees and bot-equity
  calculations as their fixtures become available.
- Frozen report runs, schedules, evidence index, open questions and ZIP/CSV/PDF-summary exports.
- Report lineage and invalidation rules.

### Acceptance

- The same event can have separate Sweden and Spain candidate treatments.
- No residency conclusion is auto-confirmed.
- Every report number links to event, valuation, treatment and evidence revisions.
- Re-running a frozen report produces equivalent output after unrelated later edits.

## Wave 2B — Codex AI/security agent

Run after the finance read endpoints and report lineage exist.

### Scope

- Typed read/calculation/proposal finance tools.
- Ownership/scope checks, result-size limits, redaction and tool audit records.
- Official-source research with citations and access dates.
- Confirmation-only write proposals.
- Prompt-injection, malicious-document, privacy leakage and tool-abuse tests.

### Acceptance

- Exact balances/counts/amounts come from deterministic tools.
- The model cannot write SQL, execute trades, change treatments or access credentials.
- Every proposal renders a before/after confirmation flow.
- Current guidance is cited and clearly separated from ledger facts.

## Wave 3 — integration/release agent

This should be one agent with authority to resolve integration issues, not several competing
agents.

### Scope

- Combine Codex and Claude outputs in `feature/finance-module`.
- Resolve API/type/schema conflicts without inventing compatibility shims.
- Verify route, rail, design tokens, responsive behavior and accessibility.
- Run `npm run check`, finance fixture tests, security tests and restore checks.
- Add the required finance history entry and update `docs/history/CHANGELOG.md` after production
  code is complete.

### Acceptance

- No duplicate financial sources of truth.
- No unowned or unvalidated finance endpoint.
- No raw source overwrite path.
- All core invariants and end-to-end fixture flows pass.
- The final report lists unresolved scope honestly; no half-implemented feature is hidden.

## Integration protocol for one-shot agents

Every agent must finish with:

```text
STATUS: complete | blocked
FILES CHANGED:
API/UX CONTRACTS CHANGED:
TESTS RUN:
ASSUMPTIONS:
KNOWN RISKS:
DEFERRED WORK:
```

Agents must not deploy, push, publish, mutate the VPS, add dependencies, edit unrelated files or
delete the duplicate `… 2` artifacts already present in the worktree. If an agent discovers a
contract problem, it stops at the boundary and reports it rather than silently changing another
agent's ownership area.

## Safe parallelization matrix

| Work | Parallel with Claude UX? | Parallel with other Codex agents? |
|---|---:|---:|
| Foundation schema/migrations | No — prerequisite | No — single owner |
| API contract/types | No — freeze first | No — single owner |
| Import/evidence | Yes | Yes, after schema freeze |
| Ledger/reconciliation | Yes | Yes, but migrations serialized |
| Tax/reporting | Yes, after event/report contracts | Usually after ledger |
| AI/security | Yes, after read tools exist | After API contracts |
| Final integration/checks | No | No — one integrator |

The practical answer is: run Wave 0 first, then run the Claude UX agent and the ingestion/ledger
Codex agents concurrently. Keep tax/report/AI and final integration behind their dependencies.
