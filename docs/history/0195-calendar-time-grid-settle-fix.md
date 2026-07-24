# 0195 — Remove the calendar time-grid settle jump

Date: 2026-07-24
Status: accepted

## What changed

Horizontal time-grid scrolling now approaches its selected day boundary monotonically and
keeps transform transitions disabled until the exact final position has been painted.
Day-column navigation is committed synchronously with each transform rebase, so old events
cannot appear for a frame in their new column positions.
The buffered event request uses one immutable range key so the callback remains stable under
React Compiler validation.

## Why

A slow release could retain velocity pointing away from the rounded destination, and the last
sub-pixel correction could re-enable CSS transitions in the same frame as a day-width rebase.
Either case could produce a brief forward-then-backward movement at the end of scrolling.
Even after removing that correction, an asynchronous cursor update could leave a nearly
imperceptible frame where events appeared to jump by one day.
The range key also preserves the buffered fetch behavior without mutable date dependencies.

## Files touched

- `apps/web/src/modules/calendar/TimeGrid.tsx` — clamps the settle spring to its destination
  and defers transition restoration until the frame after the exact final offset; atomically
  commits day navigation with transform rebases; uses a primitive key for the buffered event
  range.
- `apps/web/src/modules/calendar/TimeGrid.interaction.test.tsx` — verifies monotonic settling
  and that the final position is painted before transitions are restored, with the new day
  columns already committed at the exact rebase moment.

## How the pieces connect

Trackpad and touch input both feed the same horizontal offset and release spring. The spring
updates the buffered time grid without transitions; day-boundary rebases update the calendar
cursor while preserving the visible content position. Transition restoration now happens only
after that final offset and cursor state have had a paint frame to settle together.
Synchronous navigation commits also keep every intermediate day-boundary rebase atomic.

## How to modify this later

Keep release motion monotonic when tuning the spring constants or fling projection. If the
buffer/rebase logic changes, retain the one-frame separation between writing the exact final
offset and removing `is-swiping`, keep the cursor update atomic with each transform rebase, and
update the interaction tests with the new rest offset.
