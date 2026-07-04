# 0053 — Fitness module (Phases F1 + F1.1 + F2)

Date: 2026-07-04
Status: accepted

## What changed

Complete fitness module built in three phases:
- **F1:** Backend models, API, live workout tracking UI
- **F1.1:** Real data replacing all hardcoded placeholders
- **F2:** Goals, statistics, recharts integration

### Backend
- `created_by` on CalendarEvent + 4 models (Exercise, WorkoutSession, SetEntry, BodyMetric). Migration 015.
- `goals` table with computed `current_value`. Migration 016.
- 17 CRUD endpoints + 2 stats endpoints (`/fitness/stats/exercise/{id}`, `/fitness/stats/body-weight`).
- PR history, Epley 1RM, weekly volume, body weight trend (7-day moving average).
- Calendar integration: session creation auto-links CalendarEvent via Link table.

### Frontend
- **Module shell:** Rail→sidebar→canvas layout, week strip (real calendar events + sessions), live sidebar (goals, body weight sparkline).
- **Session wizard:** 2-step modal (type grid → exercise toggles), exercise library with 7 session types + performance hints.
- **Live workout tracking:** Exercise cards with inline set rows (weight/reps inputs, done checkmark, delete button), 90s rest timer overlay, pulsing "Session live" indicator.
- **Statistics:** ExerciseStats panel with recharts (volume bar chart, progression line chart), PR table, 1RM estimate card. Body weight sparkline in sidebar.
- **ProgressBar:** Shared component in `src/components/`, reusable by Food module.
- **Log past modal:** Dense exercise grid, session type pills, notes input.
- **Body metrics:** Compact horizontal quick-log form.
- Cyan (`#22D3EE`) accent throughout.

## Files

**New backend (3):**
- `apps/api/alembic/versions/015_fitness_core.py` — 4 tables + created_by
- `apps/api/alembic/versions/016_goals.py` — goals table
- `apps/api/app/routes/fitness.py` — 19 endpoints + stats

**New frontend (12):**
- `modules/fitness/Fitness.tsx`, `SessionWizard.tsx`, `exerciseLibrary.ts`, `LiveSession.tsx`, `RestTimer.tsx`, `WeekStrip.tsx`, `LogPastModal.tsx`, `SessionForm.tsx`, `BodyMetricLog.tsx`, `ExerciseStats.tsx`, `fitness.css`, `api.ts`

**New shared (1):**
- `src/components/ProgressBar.tsx`

**Modified (7):**
- `models.py`, `main.py`, `alembic/env.py`, `App.tsx`, `AppRail.tsx`, `DATABASE.md`, `CHANGELOG.md`

**Removed (1):**
- `SetEntryRows.tsx` — replaced by LiveSession inline sets

**Dependencies added:** `recharts`

## How the pieces connect

**Data flow:** WeekStrip reads from `/api/events` + `/api/fitness/sessions` → sidebar goals from `/api/fitness/goals` (with computed current_value from SetEntries) → stats load per-exercise from `/api/fitness/stats/exercise/{id}` → body weight sparkline from `/api/fitness/stats/body-weight`. All share a single `loadWeek()` function in Fitness.tsx that refreshes on mount and after any save operation.

**Session flow:** Wizard → local ActiveSession → LiveSession UI → Finish saves to API → loadWeek refreshes all data.

**Cross-module:** ProgressBar in `src/components/` is generic (value, max, label, color) — Food module (Phase G2) reuses it for nutrition targets. Goals table uses computed current_value (never stored) to avoid stale denormalized data.

## How to modify this later

- To add exercises to the library: edit `exerciseLibrary.ts`.
- To change the rest timer: edit `startRest()` in `LiveSession.tsx`.
- Week strip shows ALL calendar events — filter by Fitness calendar ID once it's known.
- Goals creation/deletion UI not yet wired — backend endpoints exist, frontend needs a form.
- recharts is the charting library for all future charts (food macros, finance net worth).
