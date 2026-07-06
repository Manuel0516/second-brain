# 0080 — ExerciseStats chart threshold fix

Date: 2026-07-05
Status: accepted

## What changed
Fixed three threshold mismatches in `ExerciseStats.tsx` so that new exercises with 1-2 logged sessions show consistent chart behaviour between the Overview landing and the ExerciseStats detail view:

1. **Strength progression chart** (line 616): changed threshold from `length > 2` to `length > 1` to match Overview's `> 1` threshold.
2. **Cardio empty state** (line 419): changed condition from `length === 0` to `length <= 1` so that 1 entry (which doesn't render a chart) shows the "no data" message instead of a blank area.
3. **Strength empty state** (line 648): added `volume_by_week.length <= 1` and `progression.length <= 1` checks so the empty message appears when no chart or table would render.

## Why
An exercise with exactly 2 progression entries showed a chart in Overview (threshold `> 1`) but not in ExerciseStats (threshold `> 2`). The empty-state messages had gaps where 1 entry would suppress the chart but not display a helpful message — the user saw a blank area instead.

## Files touched
- `apps/web/src/modules/fitness/ExerciseStats.tsx` — three condition changes (progression threshold, cardio empty state, strength empty state).

## How the pieces connect
`ExerciseStats.tsx` renders the detail view for a single exercise in the Fitness module. It conditionally shows charts and empty states based on `stats` array lengths. The Overview landing (`Overview.tsx`) renders its own mini chart for the selected exercise using the same data shapes. Both must agree on thresholds to avoid confusion. The empty-state message (`<p>No data for this exercise yet...</p>`) appears below the last chart/table section and is shown when no content would render.

## How to modify this later
- All three conditions are in `apps/web/src/modules/fitness/ExerciseStats.tsx`:
  - Strength progression chart gate: search for `stats.progression.length >` (line ~616).
  - Cardio distance empty state: search for `stats.distance_over_time.length <` (line ~419).
  - Strength empty state: search for `personal_records.length === 0` (line ~648).
- The Overview threshold lives in `apps/web/src/modules/fitness/Overview.tsx` at `exerciseSeries.length > 1` (line ~205) — keep ExerciseStats in sync with it.
- If chart thresholds change in the future, update the corresponding empty-state conditions to match.