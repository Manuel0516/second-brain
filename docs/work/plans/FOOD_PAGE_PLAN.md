# Phase 2 Fixes — Calendar Bulk Delete, Recurring Links, Food Polish

## Context

The Food module from the original plan (kept below for reference) is already substantially
built — confirmed by reading `Food.tsx`, `Overview.tsx`, `Stats.tsx`, `History.tsx`,
`MealLogModal.tsx`, `api.ts`, and `apps/api/app/routes/food.py` directly. The user's current
request is a different, smaller task: five targeted fixes across calendar and Food. This plan
supersedes the old plan for active work; the old plan's content is left below purely as
historical reference for what's already implemented.

## Fix 1 — Bulk delete selected calendar events (Delete/Backspace key)

`TimeGrid.tsx` already has multi-select (`selectedKeys: Set<string>`) and a keydown handler
(~line 650) with `c`/`C` copy and `v`/`V` paste via `clipboardRef`/`pasteEvents()`. Add a
`Delete`/`Backspace` case to that same handler.

- Frontend: on `Delete`/`Backspace` with `selectedKeys.size > 0`, call a new
  `deleteSelectedEvents()`. For each selected occurrence: if the occurrence's event has no
  `rrule`, delete with scope `all`; if it does, delete scope `this` with its `occurrence_start`
  (removes just that occurrence, never the whole series from a multi-select). Clear
  `selectedKeys` and refresh events after.
- Backend: no new endpoint needed — reuse the existing `DELETE /api/events/{event_id}` (its
  `scope`/`occurrence_start` query params already support this) via `Promise.all` from the
  frontend. Mirrors how `pasteEvents()` already loops client-side.

## Fix 2 — Recurring events with fitness/food links create one entry per occurrence

Today, `create_event` (`calendar.py` ~line 527) creates exactly **one** `WorkoutSession` /
`MealLog` + `Link` row for a recurring event's connections, tied to the parent's `start_at`. It
should create one per occurrence.

- In `create_event`: when `event.rrule` is set and `fitness`/`food` connections are present,
  iterate `_occurrence_starts(event, event.start_at)` (already exists, handles
  DAILY/WEEKLY/MONTHLY/YEARLY + count/until) and create one linked `WorkoutSession`/`MealLog` +
  `Link` per occurrence instead of a single one. Cap open-ended series at a safety ceiling (e.g.
  366 occurrences) — `// ponytail: caps unbounded series at ~1yr of entries; top-up job if a
  longer horizon is ever needed`.
- In `patch_event` (scope `all`): if the patch touches `connections` or any recurrence field
  (`rrule`, `recurrence_interval`, `recurrence_byday`, `recurrence_count`, `recurrence_until`,
  `start_at`) and the post-patch event has an `rrule` with fitness/food connections: delete the
  existing **planned** linked entries + their `Link` rows for this event (reuse
  `_linked_planned_sessions`/`_linked_planned_meals` + `_delete_event_links`, which already only
  ever touch `planned` status, never logged/active/completed), then regenerate fresh
  per-occurrence entries the same way as create.
- `delete_event` already unschedules (not deletes) all linked planned entries for an event's ids
  in a loop — no change needed there, it already handles "many linked entries" fine.
- Per explicit user decision: **no backfill** for existing recurring events already in the DB —
  this only applies going forward, to newly created or newly edited (connections/recurrence)
  recurring events.

## Fix 3 — Food: log-meal date input

`MealLogModal.tsx` hardcodes `today` in both `handleFileSelected` and `handleLogManually` when
creating a new `MealLog` (`createMealLog({ date: today, ... })`). Add a native
`<input type="date">` near the meal-type pill selector, state `mealDate` defaulting to today,
disabled when editing an existing `plannedMeal` (its date is fixed by the calendar link). Use
`mealDate` instead of the hardcoded `today` at both creation call sites.

## Fix 4 — Food Overview: show logged meals for the viewed week (not just "planned")

`Overview.tsx`'s `allPlannedMeals` only collects `status === 'planned'` meals, so a past week
full of logged meals still renders the "No planned meals..." empty state. Add a second list,
`allLoggedMeals` (same collection loop, `status === 'logged'`, sorted by `logged_at`/`date`), and
render a "Logged meals" section when non-empty — a compact read-only row (meal type, macro
summary, date; no edit/delete here, that's History's job). Only show the empty state when
**both** `allPlannedMeals` and `allLoggedMeals` are empty.

## Fix 5 — Food Stats: don't plot future dates

`Stats.tsx` builds `days` directly from `summary.days` with no date filter, so viewing the
current (or a future) week plots zeroed future days as if they were real data. Filter:
`summary?.days.filter(d => d.date <= todayStr) ?? []` before mapping to `DayPoint[]` (add a
`todayStr` local-date helper, same pattern already used in `Overview.tsx`/`Food.tsx`). The weight
series (`bwMetrics`) needs no change — it's already only real logged entries, never synthetic
future points.

## Fix 6 — Food Overview: note edits don't appear until reload

`Overview.tsx`'s `handleSaveNote` calls `updateMealLog(meal.id, { notes: ... })` then just clears
`editingNoteId` — it never refreshes `summary`, so the old note re-renders until a manual page
reload (there's already a `// ponytail:` comment on this spot acknowledging it as a known gap).
Fix: add an `onSaved: () => void` prop to `Overview` (mirrors the prop `Stats`/`History` already
take, wired to `Food.tsx`'s existing `loadWeek`), and call it after a successful
`updateMealLog` in `handleSaveNote` so the parent refetches and the edited note shows
immediately.

## OpenRouter env vars

`config.py` already defines `openrouter_api_key: str = ""` and
`openrouter_model: str = "google/gemini-2.5-flash"` (cheap, vision-capable — good default, no
change needed). Neither `.env` nor `.env.example` has these keys yet. Add both to `.env.example`
(key left blank) so the shape is documented; the user will add their real key to `.env`
themselves.

## Verification

- `npm run check` (web) and `npm run check:api` (API) pass.
- Calendar: multi-select several events (including one occurrence of a recurring event), hit
  Delete — non-recurring ones disappear entirely; the recurring occurrence disappears but the
  rest of its series remains.
- Create a recurring event (e.g. WEEKLY, 4x) with a food or fitness connection — confirm 4
  separate `MealLog`/`WorkoutSession` rows + `Link` rows exist, not 1.
- Food: log a meal for a past date via the new date input; confirm it shows up in that day's
  history and in that past week's Overview logged-meals list. View the current/a future week in
  Stats — graphs stop at today, don't extend into zeroed future days.
- History entry in `docs/history/` (5 sections) + `docs/history/CHANGELOG.md` index update.

---

## (Reference only — original Food-build plan, largely already implemented)

Backend (`meal_logs`, `food_daily_extras` tables, `apps/api/app/routes/food.py`), calendar
connections simplification, Food page frontend (sidebar week bars/calorie ring/macros/water/veg/
fruit/body-weight cards, Overview/Stats/History tabs, `MealLogModal.tsx` photo-based AI logging),
and settings (`food_*` keys) — all confirmed present in the repo already.
