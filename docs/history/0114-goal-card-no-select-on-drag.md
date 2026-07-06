# 0114 — Goal sidebar card: no text-select on drag

Date: 2026-07-06
Status: accepted

## What changed

`.fit-goal-sidebar-card` now has `user-select: none` (plus `-webkit-` prefixes
and `-webkit-touch-callout: none`), so long-pressing a goal card to reorder it
no longer selects its label text first.

## Why

On mobile, dragging a goal card to reorder it was highlighting the card's
text before the drag gesture registered, making the reorder feel janky.

## Files touched

- `apps/web/src/modules/fitness/fitness.css` — added the `user-select: none`
  block to `.fit-goal-sidebar-card` (~line 255).

## How the pieces connect

`.fit-goal-sidebar-card` is the draggable sidebar summary card (distinct from
the editable `.fit-goal-card` grid in `GoalsSection.tsx`); its drag handling
lives in `Fitness.tsx`'s sidebar reorder logic (history 0111).

## How to modify this later

If another draggable card elsewhere in the fitness module shows the same
text-selection jank, apply the same three properties rather than inventing a
new rule.
