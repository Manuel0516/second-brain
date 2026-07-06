# 0111 — Goal sidebar cards: whole-card drag + drag animations

Date: 2026-07-06
Status: accepted

## What changed

Removed the dedicated drag-handle icon (⠿) from the Fitness sidebar goal
cards entirely — the whole card is now the drag grip (`cursor: grab`,
pointer events on the card itself). Dragging a card animates: the active
card scales up slightly, gains a stronger shadow and an accent-colored
border; hovering a card (desktop) also tints its border toward the accent
color for affordance. All transitions respect `prefers-reduced-motion`.

## Why

User iterated on this in three steps: first asked for the always-visible
handle to only reveal on hover/press; then asked for it to be fully invisible
at rest (fading in on hover) with the progress bar/label stretching to fill
the space it used to reserve; finally asked to drop the handle concept
altogether and make the entire card draggable, which is simpler and removes
the need for a floating overlay element.

## Files touched

- `apps/web/src/modules/fitness/Fitness.tsx` — `handleGoalPointerDown`'s
  event-target type changed back to `React.PointerEvent<HTMLDivElement>`;
  the sidebar goal-card `<div>` now carries `onPointerDown` (starts the drag)
  directly, plus `cursor: grab` / `touchAction: 'none'` inline, and the
  `aria-label`. The separate drag-handle `<span>` was deleted — the content
  `<div>` (progress bar + label) is the card's only child and uses its full
  width.
- `apps/web/src/modules/fitness/fitness.css` — `.fit-goal-sidebar-card` keeps
  its transition + `.is-dragging` (scale/shadow/border) state, gains a
  `:hover` border-tint rule for affordance; the now-unused
  `.fit-goal-drag-handle` rules were deleted along with their reference in
  the reduced-motion media query.

## How the pieces connect

`dragGoalId` (from the 0108 drag-reorder implementation) and the
`handleGoalPointerMove`/`handleGoalPointerUp` handlers are unchanged — only
which element's `onPointerDown` initiates the drag moved, from a small inner
`<span>` to the card `<div>` itself. Since Pointer Events (not HTML5
drag-and-drop) were already used specifically for touch support, no other
mobile-specific handling was needed to make "press anywhere on the card"
work identically on touch and mouse.

## How to modify this later

If a future design wants to exclude part of the card from initiating a drag
(e.g. a button inside the card), attach `onPointerDown` to a narrower wrapper
around the draggable region instead of the outer card, and stop propagation
on the excluded child.
