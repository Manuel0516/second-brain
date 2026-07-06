# 0108 — Fitness goal editing/reorder, sidebar weekly target, and two small fixes

Date: 2026-07-06
Status: accepted

## What changed

Five fixes/additions to the Fitness module:

1. Fixed a bug in "Log Past Workout" where the exercise category picker stayed
   visible and squeezed into the header even after a category was chosen.
2. Added the ability to edit an existing goal's exercise/metric and target value
   (previously create/delete only).
3. Added drag-to-reorder for the goal cards shown in the Fitness page sidebar,
   persisted via a new `order_index` column.
4. Moved the weekly-session-target progress card from the Overview tab to the
   Fitness page sidebar (it no longer appears on Overview).
5. Fixed the "Log Body Metrics" input row overlapping on narrow phone widths.

## Why

User-reported: the category picker in "Log Past Workout" never disappeared for
manually-typed exercise names, rendering a broken/squished control next to the
category badge. Goals could only be created/deleted, not corrected. Goals had
no user-controlled ordering. The weekly-target progress card (added in 0107)
was requested on the sidebar instead of the Overview tab. The body-metrics
input row overlapped on phone screens.

## Files touched

- `apps/api/app/models.py` — added `order_index` (int, default 0) to `Goal`.
- `apps/api/alembic/versions/020_goal_order.py` — migration adding `order_index`
  to `goals` with server default `0`.
- `apps/api/app/routes/fitness.py` — `list_goals` now orders by `order_index`
  then `created_at`; `GoalResponse`/`GoalPatch` carry `order_index`; `create_goal`
  assigns the next `order_index` (current goal count); `update_goal` accepts
  patching `order_index` (reused for both goal edits and drag-reorder persistence
  — no new endpoint needed).
- `apps/web/src/modules/fitness/api.ts` — added `order_index` to the `Goal`
  interface and a new `updateGoal()` PATCH wrapper.
- `apps/web/src/modules/fitness/GoalsSection.tsx` — the existing create form is
  now reused for editing: an "Edit" (✎) button per goal card pre-fills the form
  and calls `updateGoal` instead of `createGoal` on submit.
- `apps/web/src/modules/fitness/Fitness.tsx` — sidebar goal cards get a drag
  handle (⠿) using Pointer Events (not HTML5 drag-and-drop, so it works with
  touch on phones); dragging reorders the local `goals` array live and, on
  release, PATCHes `order_index` for any goal whose position changed. Also
  added a "Weekly sessions" progress card (using `settings.fitness_weekly_session_target`
  and the existing locally-computed `weeklySessions`) below the week strip.
- `apps/web/src/modules/fitness/Overview.tsx` — removed the "Weekly sessions"
  card (moved to the sidebar); dropped the now-unused `ProgressBar` import.
- `apps/web/src/modules/fitness/LogPastModal.tsx` — the category control for an
  exercise is now either the `Segmented` picker (while unset, or while actively
  editing) or the `CategoryBadge` (once chosen) — never both. For exercises not
  matched against the known exercise library, the badge is a button that
  reopens the picker on click; matched exercises show a plain (non-interactive)
  badge.
- `apps/web/src/modules/fitness/fitness.css` — `.fit-category-badge-button`
  (unstyled wrapper so the badge stays clickable); `.fit-goal-card-actions`/
  `.fit-goal-edit` (edit button next to delete); `.fit-metric-form-grid` (new
  class replacing the inline grid style in `BodyMetricForm.tsx`, collapsing to
  2 columns with a full-width submit button under 720px).
- `apps/web/src/modules/fitness/BodyMetricForm.tsx` — swapped the inline grid
  style for the new `.fit-metric-form-grid` class.

## How the pieces connect

Goal ordering reuses the existing single-goal `PATCH /api/fitness/goals/{id}`
endpoint rather than adding a bulk-reorder endpoint — after a drag, the
frontend just PATCHes `order_index` for each goal whose index changed.
`list_goals` sorts by that column so both the Stats-tab grid and the sidebar
list reflect the saved order. The sidebar drag itself is plain React state
(`dragGoalId` + reordering the `goals` array) driven by Pointer Events with
`setPointerCapture`, chosen over HTML5 `draggable` specifically because HTML5
drag-and-drop doesn't fire from touch input on phones — this app is used
mobile-first (see 0107, 0104). The category-picker fix follows the same
principle as `CategoryBadge`/`Segmented` elsewhere: exactly one of "picker" or
"badge" renders at a time, keyed off a single `editCategoryIdx` state value
instead of two independent conditionals that could both be true.

## How to modify this later

- To add more goal fields: extend `GoalCreate`/`GoalPatch`/`GoalResponse` in
  `fitness.py` and the `payload` object built in `GoalsSection.tsx`'s
  `handleSubmit` — the same form/endpoint serves both create and edit.
- To change how sidebar reordering persists: the commit point is
  `handleGoalPointerUp` in `Fitness.tsx` — it currently PATCHes every goal
  whose `order_index` differs from its new array position.
- The category-picker toggle state (`editCategoryIdx`) lives in
  `LogPastModal.tsx` only; if the same "click badge to change category" pattern
  is needed elsewhere, consider promoting it into `CategoryBadge` itself
  (currently a dumb display-only component in `exerciseLibrary.tsx`).
