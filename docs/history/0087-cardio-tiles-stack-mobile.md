# 0087 — Cardio stat tiles stack vertically on mobile

Date: 2026-07-06
Status: accepted

## What changed

- Added `className="fit-stat-tiles"` to the cardio tiles flex container in `ExerciseStats.tsx`.
- Added a mobile CSS rule in `fitness.css` that sets `flex-direction: column` and `gap: 8px` on `.fit-stat-tiles` at the `max-width: 720px` breakpoint.

## Why

The three cardio stat tiles (Total distance, Total time, Best pace) didn't fit in a single row on narrow phones even after previous padding/font-size reductions. Stacking them vertically solves the overflow while keeping the layout clean.

## Files touched

- `apps/web/src/modules/fitness/ExerciseStats.tsx` — added `className="fit-stat-tiles"` to the cardio tiles flex container at line 262. The strength tiles container at line 439 was left untouched.
- `apps/web/src/modules/fitness/fitness.css` — added `.fit-stat-tiles { flex-direction: column; gap: 8px; }` inside the existing `@media (max-width: 720px)` block.

## How the pieces connect

On desktop (no breakpoint match), the inline `display: flex; gap: 12px` on the container keeps all 3 tiles in a row. On mobile (max-width: 720px), the CSS class overrides `flex-direction` to `column`, stacking the tiles vertically with a tighter `8px` gap. The strength container (2 tiles) has no such class, so it stays in a row at all sizes.

## How to modify this later

Find the `.fit-stat-tiles` class in `apps/web/src/modules/fitness/fitness.css` inside the `@media (max-width: 720px)` block. Adjust `flex-direction` (e.g. `row` to revert) or `gap` as needed. The className is attached in `apps/web/src/modules/fitness/ExerciseStats.tsx` on the cardio tiles container div.