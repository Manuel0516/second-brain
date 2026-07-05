# 0081 — Cardio exercises default to 1 set

Date: 2026-07-05
Status: accepted

## What changed

Cardio exercises now start with 1 empty set by default (instead of 3) in all three
code paths that create initial sets for a new exercise. Strength and mobility exercises
keep 3 sets.

## Why

Cardio exercises (running, swimming, etc.) typically have a single distance+duration
entry per session. Three empty sets was noise that had to be manually deleted every time.

## Files touched

- `apps/web/src/modules/fitness/LiveSession.tsx` — `newSet` function exported (was
  module-private) so `SessionWizard.tsx` can reuse it. `addExercise` changed from
  `Array.from({ length: 3 }, ...)` to `Array.from({ length: category === 'cardio' ? 1 : 3 }, ...)`.
- `apps/web/src/modules/fitness/SessionWizard.tsx` — `buildActiveSession` replaced the
  hardcoded 3-set array literal with `Array.from({ length: cat === 'cardio' ? 1 : 3 },
  () => newSet(cat))`, importing `newSet` from `LiveSession`.
- `apps/web/src/modules/fitness/Fitness.tsx` — `planToActiveSession` replaced the
  hardcoded 3-set array literal with `Array.from({ length: cardio ? 1 : 3 },
  () => ({ ...emptySet }))`.

## How the pieces connect

Three entry points create initial exercise sets:
1. **LiveSession.addExercise** — user adds an exercise mid-session via the "+" button.
2. **SessionWizard.buildActiveSession** — user starts a new session from the wizard.
3. **Fitness.planToActiveSession** — user starts a planned/linked session.

All three now check the exercise category and produce 1 set for cardio, 3 for everything
else. The `newSet` helper (which returns the correct shape for cardio vs strength) was
already defined in `LiveSession.tsx`; it was exported so `SessionWizard.tsx` could reuse
it instead of duplicating the shape logic.

## How to modify this later

- To change the default set count for a category, find the three `Array.from({ length: ... })`
  expressions in the files above and adjust the ternary condition.
- To change the default set shape, edit `newSet` in `LiveSession.tsx` (exported).
- The `cat` variable in `SessionWizard.tsx` may be `undefined` (for unknown exercise names);
  `newSet(undefined)` correctly produces a strength set because `category === 'cardio'` is
  `false` for `undefined`.
