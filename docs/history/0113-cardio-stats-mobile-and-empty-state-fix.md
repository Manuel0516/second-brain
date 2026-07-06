# 0113 — Cardio stats mobile stacking + empty-state fix

Date: 2026-07-06
Status: accepted

## What changed

Two fixes to `ExerciseStats.tsx`'s cardio view (Total distance / Total time /
Best pace headline tiles):

1. The tile row is now flagged with the `fit-stat-tiles` class so it picks up
   the existing `flex-direction: column` mobile rule at `max-width: 720px` —
   it was rendering with an inline `display: flex` only, so on mobile the
   three tiles stayed side-by-side and got cramped instead of stacking like
   the strength-view tiles already do.
2. The "No data for this exercise yet. Log some sets to see stats." empty
   state was only gated on `stats.distance_over_time.length <= 1`, so it
   could render underneath the Pace Trend and/or Weekly Distance & Time
   charts even when those had real data to show. It now only renders when
   distance, pace, and weekly are all empty (matching the pattern the
   strength-view empty state already used).

## Why

User request: stack the cardio stat tiles vertically on mobile, and stop
showing the "no data" message when there are graphs to show.

## Files touched

- `apps/web/src/modules/fitness/ExerciseStats.tsx` — added `className="fit-stat-tiles"`
  to the cardio headline-tile wrapper (~line 268); widened the cardio
  empty-state condition (~line 431) to check `distance_over_time`,
  `pace_over_time`, and `weekly` together.

## How the pieces connect

`.fit-stat-tiles` / `.fit-stat-tile` are shared CSS classes already used by
the strength-view "Estimated 1RM" tile row (`fitness.css` ~line 919); the
cardio tile row previously duplicated the flex layout inline without the
class, which is why the mobile column rule silently didn't apply to it.

## How to modify this later

If a future cardio stat is added as a fourth tile, it only needs
`className="fit-stat-tile"` — the shared `.fit-stat-tiles` wrapper handles
both desktop row and mobile column layout automatically.
