# 0051 — Fix BubbleMenu test timer leak

Date: 2026-07-04
Status: accepted

## What changed
Disabled TipTap BubbleMenu's debounced selection update so it updates immediately.

## Why
TipTap does not clear its pending BubbleMenu update timer during plugin destruction.
On slower CI runs the timer fired after jsdom teardown, raised `window is not defined`,
and failed deployment despite all assertions passing.

## Files touched
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — set the supported BubbleMenu `updateDelay` prop to zero.

## How the pieces connect
`BlockEditor` mounts TipTap's BubbleMenu for the inline formatting toolbar. A zero delay
runs position updates synchronously and leaves no delayed callback after React cleanup.

## How to modify this later
Keep `updateDelay={0}` until TipTap's BubbleMenu destruction clears its debounce timer.
If upgrading TipTap fixes that lifecycle bug, this prop can be removed.
