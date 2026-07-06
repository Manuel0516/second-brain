# Plan F — Fitness and Food (Roadmap Milestone 4)

> Audience: implementing AI or developer. Self-contained build spec for Fitness +
> Food. Read order: this plan → `docs/product/FITNESS_MODULE.md`,
> `docs/product/FOOD_MODULE.md`, `docs/product/CALENDAR_MODULE.md` (for the
> `created_by: system:*` event pattern), `docs/architecture/DATABASE.md` (the
> generic `Link` table — supersedes the FK sketches in the module docs, see §1
> below) → `docs/design/STYLE_GUIDE.md` for the visual pass → nearest
> `AGENTS.md`. Run `npm run check` (web) and `npm run check:api` before any
> task is "done". Reuse tokens/components already in `apps/web/src/styles.css`
> and `apps/web/src/components/` — no new visual language, no new component
> that already has an equivalent (progress bar, card, field, dropdown, popover
> all already exist).

Status: in progress — F1 (fitness core, migration `015_fitness_core.py`),
F2 (goals + statistics, migration `016_goals.py`) and F3 (fitness UI rework,
migration `017_set_feeling.py`: tabs, Overview landing graphs, Stats & Goals
tab, History tab + past-session editor, live-session per-set notes +
feeling dots) are shipped. 

**Food superseded**: the food portion of this plan (Phases G1/G2) has been
replaced by `docs/work/plans/FOOD_PAGE_PLAN.md` (AI photo capture, meal_logs,
calendar hooks). The old G1 implementation in `food.py` has been reverted to
a scaffold. See the new plan for the current food scope and ordering.

Revised 2026-07: Food is promoted to **its own
designed page** (Phase G, below) instead of a bolt-on view, and **calendar
integration (Phase 3) is the next active work**. See §2 for the revised
ordering.
Date: 2026-07-06 (revised)

---

## 0. Why this jumps the Finance milestone

The roadmap lists Finance (Milestone 3) before Fitness/Food (Milestone 4), but
the user has asked to build gym + food logging next. That's fine — the two
milestones don't depend on each other except for one thing: **wearable/CSV
import reuses Finance's `ImportTemplate` system (§9 `FINANCE_MODULE.md`), which
doesn't exist yet.** Rather than building a generic import abstraction early
(speculative — Finance hasn't defined its exact shape yet), wearable import is
its own deferred phase (§7). Everything else in this plan has zero dependency
on Finance.

---

## 1. Data model reconciliation: FK sketches vs. the `Link` table

Both `FITNESS_MODULE.md` and `FOOD_MODULE.md` sketch direct foreign keys
(`linked_event_id FK -> CalendarEvent`, `photo_id FK -> Attachment`). Per
`DATABASE.md`, this project's actual convention is the generic `links` table —
no module gets a foreign key into another module's table. **Use `Link` rows
for all cross-module connections in the real implementation**; the module docs'
FK sketches describe the *relationship*, not the literal column. Only true
in-module relationships (e.g. `SetEntry.workout_session_id`) get real FKs.

`photo_id` is the one exception worth keeping as a direct FK: it points at the
existing `files` table (migration 012, `File` model) exactly the way Notes'
image blocks already do — that's in-stack reuse, not a new pattern.

---

## 2. Phase breakdown

> Revised ordering: F1 and F2 are **done**. Next up, in order:
> **Phase F3 (fitness UI
> rework)** — then the Food phases (G1/G2), which now build a **dedicated,
> designed Food page** (own rail entry, own layout pass against
> `docs/design/STYLE_GUIDE.md`), not a minimal form bolted onto Fitness.

### Phase F1 — Fitness core (exercises, sessions, sets, body metrics)
- Migration `015_fitness_core.py`: `exercises`, `workout_sessions`, `set_entries`,
  `body_metrics` tables per `FITNESS_MODULE.md` §1. `workout_sessions.notes` is
  a `JSON` column using the **same block-content shape as `Page.content`** —
  do not reinvent a text field.
- `apps/api/app/routes/fitness.py`: `GET/POST /api/fitness/sessions`,
  `GET/POST /api/fitness/sessions/{id}/sets`, `GET/POST /api/fitness/body-metrics`,
  plus the standard `PATCH`/`DELETE` pairs the other routers already have.
- Logging a session creates/links a Fitness-calendar `CalendarEvent`
  (`created_by: "system:fitness"`) via a `Link` row — follow the exact pattern
  `notes.py` already uses for event↔page links (grep `created_by` there first).
- Frontend: `apps/web/src/modules/fitness/` following the Calendar/Notes
  rail→sidebar→canvas shell (`SidebarShell`, `Card`, `Field` — all already in
  `src/components/`). Session log form, set entry rows, body metric quick-log.

### Phase F2 — Goals + statistics
- Migration adds `goals` table (`target_type`, `exercise_id | null`,
  `metric_key | null`, `target_value`, `target_date | null`); `current_value` is
  **computed on read**, never stored (per spec — avoid a denormalized value
  going stale).
- `GET /api/fitness/stats/exercise/{id}` (PR history, 1RM via Epley/Brzycki,
  volume per week/month), `GET /api/fitness/stats/body-weight`.
- Progress bar is a **shared component** (`src/components/ProgressBar.tsx`) —
  Food's `NutritionTarget` bars (Phase G2) reuse the identical component. Build
  it generically from the start since both consumers are in this same plan,
  not a hypothetical future one.
- Charts: check `package.json` for an already-installed charting lib before
  adding one; if none exists, ask before adding a dependency (per root
  `AGENTS.md` §6 — dependencies need rationale + approval).

### Phase F3 — Fitness UI rework (done)
- Migration `017_set_feeling.py`: `set_entries.feeling` (int 1–5, nullable,
  per-set subjective rating) + `set_entries.note` if missing; fix
  `weight` Integer→Float (use `batch_alter_table` for SQLite).
- Tabs via `useSearchParams` (`/fitness?tab=overview|stats|history`), no new
  App routes. **Overview** (landing): highlight graphs — body weight, top
  exercise progression, feeling trend — that disappear while a live session is
  active. **Stats**: exercise + body statistics, goals, body-weight quick-log
  (moved out of the landing view). **History**: full training log; past-session
  editor reworked (`SessionForm.tsx`) with add-set/add-exercise.
- Live session: per-set note + `FeelingDots` (1–5) shared component.
- New backend surface kept tiny: `GET /api/fitness/stats/overview` for the
  landing graphs; everything else reuses existing stats endpoints.

### Phase G1 — Food core (logs, water, targets, daily summary)
- Migration `016_food_core.py`: `food_logs`, `water_logs`, `nutrition_targets`
  per `FOOD_MODULE.md` §1. `food_logs.items` is `JSON`, shape
  `[{name, quantity, unit, calories, protein, carbs, fat}]` exactly as spec'd —
  this structure is what makes Phase 5 AI capture a drop-in later, don't
  simplify it to a flat total now.
- `nutrition_targets.effective_from` lets targets change over time; the
  "current" target for a date is the latest row with `effective_from <= date`.
- `apps/api/app/routes/food.py`: `GET/POST /api/food/logs`,
  `GET /api/food/summary?date=`, `GET/POST /api/food/water`,
  `GET/POST /api/food/targets`.
- Frontend: `apps/web/src/modules/food/` — **a dedicated, designed page** with
  its own rail entry and its own layout pass against
  `docs/design/STYLE_GUIDE.md` (not a bolt-on view inside Fitness). Daily view
  reuses the `ProgressBar` component from F2 for
  calories/protein/carbs/fat/water, one shared component rendering five times,
  not five bespoke bars.

### Phase G2 — Recipes (Notes database, no new backend)
- A `Database` page named "Recipes" with properties `Tags` (multi-select),
  `Calories/serving`, `Macros/serving`, `Source URL`, `Prep time` — created
  through the existing `/pages` + `/databases` API (`NOTES_MODULE.md` §7,
  already shipped). **This phase is almost entirely a seed/UX task**: a
  "Recipes" template page + maybe a dedicated `/food/recipes` nav entry that
  deep-links into that database page. No new backend code.
- TikTok source preview: fetch `https://www.tiktok.com/oembed?url=...`
  server-side (avoid CORS/SSRF the same way `GET /api/embed` already guards
  bookmark-card previews — reuse that endpoint, don't build a second one) when
  `Source URL` matches a TikTok URL pattern.

### Phase 3 (calendar integration, cross-cutting)
- Both modules' session/log creation link to calendar events via `Link` rows,
  same as Notes already does. No separate calendar code needed — this is
  wiring, not a new feature.

---

## 3. Deferred (explicitly out of scope for the first pass)

- **Wearable import** (`WearableMetric` table, CSV/Apple Health XML parsing) —
  blocked on Finance's `ImportTemplate` existing first (§0). Pick up when
  Finance Milestone 3 lands, or build a minimal one-off CSV parser here if the
  user wants wearable data sooner than Finance — ask before doing that, it's a
  scope call, not an obvious default.
- **AI food capture** (`source: "ai_capture"`) — Phase 5 (`AI_ASSISTANT_MODULE.md`).
  The `source` column ships now (per spec, cheap to add), the actual capture
  flow does not.
- **Gadgetbridge / Health Connect Android companion** — a real native app, not
  a config toggle. Not started until wearable import itself is prioritized.

---

## 4. Verification

After each phase: `npm run check:api` (new routes/migrations),
`npm run check --workspace @secondbrain/web` (new UI). Manually exercise the
`/fitness` and `/food` rail entries end to end before calling a phase done —
this project's `verify` skill applies here same as anywhere else.
