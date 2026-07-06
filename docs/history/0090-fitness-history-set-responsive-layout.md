# 0090 — Fitness history edit set row responsive layout

Date: 2026-07-06
Status: accepted

## What changed
Reworked the editable workout history set row CSS into a flex-based card so the desktop layout is centered and balanced, and the mobile layout stacks the secondary controls beneath the main inputs.

## Why
The history edit row was cramped on desktop and awkward on mobile. The set number, reps, weight, feeling buttons, note field, and delete button needed clearer spacing and a responsive fallback that stayed readable on small screens.

## Files touched
- `apps/web/src/modules/fitness/fitness.css` — converted `.fit-history-set` to a centered flex layout, gave the row a cleaner card treatment, and added a mobile order/stacking pass for the set number, inputs, feeling buttons, note, and delete button.

## How the pieces connect
`SessionForm.tsx` renders each set as a `.fit-history-set` with six children: set number, reps, weight, feeling, note, and delete button. The CSS controls all of the layout behavior, so a single flex layout update can improve both the desktop edit view and the mobile breakpoint without changing the component structure.

## How to modify this later
Find `.fit-history-set` in `apps/web/src/modules/fitness/fitness.css`. Adjust the desktop flex basis/row width to rebalance the row, and change the `@media (max-width: 720px)` block if you want a different stacked order or touch target size on mobile.
