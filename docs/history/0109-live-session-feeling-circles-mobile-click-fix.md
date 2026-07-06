# 0109 — Live session feeling circles unclickable on mobile

Date: 2026-07-06
Status: accepted

## What changed

Fixed the last two "feeling" circles (the 5-dot scale under each set in the
Live Session view) being unclickable on mobile.

## Why

User-reported: on the mobile Live Session card layout, tapping the 4th/5th
feeling circle did nothing.

## Files touched

- `apps/web/src/modules/fitness/fitness.css` — in the `@media (max-width: 720px)`
  block, `.fit-live-tools` (the note/remove icon buttons) was assigned
  `grid-column: 3 / -1`, overlapping `.fit-live-row .fit-feeling`'s
  `grid-column: 2 / 4` in the same grid row. The empty flex space of the tools
  container sat on top of (later in DOM/paint order than) the feeling circles
  underneath, intercepting clicks on whichever circles fell in the shared
  column. Changed `.fit-live-tools` to `grid-column: 4 / -1` so it only
  occupies the column reserved for it, with no overlap.

## How the pieces connect

`.fit-live-row` mobile layout uses a 4-column CSS grid
(`18px minmax(0,1fr) minmax(0,1fr) 44px`) with the feeling scale and the
note/remove tools sharing row 2 side by side. Grid items don't clip pointer
events to their visible content — an element's full grid-area box is
hit-testable even where it renders nothing, so any column overlap between two
siblings means the one later in the DOM wins clicks in that region. This is
the same class of bug as any CSS grid layout with overlapping explicit
`grid-column`/`grid-row` ranges; the fix is always to make the ranges
disjoint.

## How to modify this later

If a future change needs to widen `.fit-live-tools` or `.fit-feeling` again,
verify their `grid-column` ranges in the mobile media query don't intersect —
this is easy to reintroduce since the grid has only 4 tracks and both
elements are flexible-width containers.
