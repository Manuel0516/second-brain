# 0100 — LiveSession mobile row controls tightened

Date: 2026-07-06
Status: accepted

## What changed
Reduced the height of the live session row inputs and the set-complete check button on mobile.

## Why
The live set rows were reading as too tall and bulky on mobile.

## Files touched
- `apps/web/src/modules/fitness/fitness.css` — tightened the live row padding and control heights.

## How the pieces connect
`LiveSession` uses one shared grid row for set logging. The CSS controls the visual density of those rows, so lowering the input and check-button heights makes the whole row feel lighter without changing the data flow or behavior.

## How to modify this later
Adjust the `.fit-live-row`, `.fit-live-cell`, and `.fit-live-check` rules in `apps/web/src/modules/fitness/fitness.css` if the live-row density needs to change again. Keep the mobile overrides intact so touch targets stay usable.
