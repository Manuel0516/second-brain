# 0085 — LogPastModal set row alignment fix

Date: 2026-07-06
Status: accepted

## What changed
Changed `align-items: end` to `align-items: center` on `.fit-logpast-set` in `fitness.css`. This vertically centers the set number (strong), the two label+input stacks, and the remove button within each 4-column grid row.

## Why
The set rows in LogPastModal looked misaligned: with `align-items: end`, the single-height `<strong>` (set number) and the `<button>` (remove) sat at the bottom of the row while the `<label>` elements (which contain a `<span>` + `<input>` stacked vertically via `display: grid`) stretched from top. `align-items: center` makes all four columns share the same vertical center, matching the visual center of the label+input stacks.

## Files touched
- `apps/web/src/modules/fitness/fitness.css` — line 1412: `align-items: end` → `align-items: center`

## How the pieces connect
The `.fit-logpast-set` grid row has 4 columns: `28px 1fr 1fr 28px`. Column 1 is a `<strong>` (set number), columns 2-3 are `<label>` elements (each with a `<span>` + `<input>` in a sub-grid with `gap: 4px`), column 4 is a `<button>` (28×28px remove button). The parent's `align-items` property controls how all grid children align along the cross-axis (vertical). Changing from `end` to `center` moves the short elements (strong, button) from the bottom edge to the middle, aligning them with the middle of the taller label stacks. The `<strong>` retains its redundant `align-self: center` override (harmless, kept for minimum diff).

## How to modify this later
Find `.fit-logpast-set` in `apps/web/src/modules/fitness/fitness.css` (~line 1408). To change vertical alignment, modify the `align-items` property. If the label structure changes (e.g. flat layout instead of stacked grid), `align-items: center` may need re-evaluation. The label's internal `display: grid; gap: 4px` on line 1422-1424 controls the spacing between the span and input — increase that gap if the label feels too cramped.