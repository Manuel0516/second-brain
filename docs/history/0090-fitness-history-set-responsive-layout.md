# 0090 — Fitness history edit set row responsive layout

Date: 2026-07-06
Status: accepted

## What changed
Reworked the editable workout history set row CSS so the desktop layout uses balanced column widths and the mobile layout stacks the feeling and set note beneath the main inputs.

## Why
The history edit row was cramped on desktop and awkward on mobile. The set number, reps, weight, feeling buttons, note field, and delete button needed clearer spacing and a responsive fallback that stayed readable on small screens.

## Files touched
- `apps/web/src/modules/fitness/fitness.css` — tightened the desktop grid for `.fit-history-set`, centered the feeling controls, and added a mobile layout that places the main inputs on the first row and the feeling/note below.

## How the pieces connect
`SessionForm.tsx` renders each set as a `.fit-history-set` grid with six children: set number, reps, weight, feeling, note, and delete button. The CSS controls all of the layout behavior, so a single grid update can improve both the desktop edit view and the mobile breakpoint without changing the component structure.

## How to modify this later
Find `.fit-history-set` in `apps/web/src/modules/fitness/fitness.css`. Adjust the desktop `grid-template-columns` to rebalance the row, and change the `@media (max-width: 720px)` block if you want a different stacked order or touch target size on mobile.
