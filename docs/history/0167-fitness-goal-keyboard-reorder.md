# 0167 — Keyboard-accessible Fitness goal reordering

Date: 2026-07-24
Status: accepted

## What changed

Each goal card in the Fitness sidebar's "Goals" panel now has **Move up** / **Move down**
icon buttons (styled after the existing `.fit-goal-edit`/`.fit-goal-delete` 22×22px pattern)
alongside the existing pointer-drag handle. The first goal's up button and the last goal's
down button are `disabled`. Activating a button swaps the goal with its neighbor, persists the
changed `order_index` values via the same `updateGoal()` call the pointer-drag drop handler
already used, and updates a visually-hidden `role="status"` region with `"{label} moved to
position {n} of {total}"`. The buttons call `stopPropagation()` on both `pointerdown` and
`click` so activating one doesn't also trigger the card's own drag-start handler. Pointer drag
is unchanged.

`goalLabel()` was extracted from the inline label computation (previously duplicated per-card)
so both the card render and the move-announcement text stay in sync with one implementation.

## Why

UX-010 in `docs/work/UX-AUDIT.md`: the goal card was a plain `<div>` with pointer handlers and
a decorative `aria-label` — no role, no `tabIndex`, no keyboard commands, so keyboard and
switch-input users had no way to reorder goals. A small focused plan was written first per the
task instructions: `docs/work/PLAN-fitness-goal-keyboard-reorder.md`.

## Files touched

- `docs/work/PLAN-fitness-goal-keyboard-reorder.md` — the small focused plan.
- `apps/web/src/modules/fitness/Fitness.tsx` — `goalLabel()` helper, `moveGoal()`,
  `goalMoveAnnouncement` state/status region, up/down buttons per goal card.
- `apps/web/src/modules/fitness/fitness.css` — `.fit-goal-move-actions`/`.fit-goal-move`.
- `apps/web/src/modules/fitness/Fitness.goalReorder.test.tsx` — new: boundary buttons disabled,
  a move updates `goals` order, `updateGoal` PATCHes both affected goals' `order_index`, and
  the status region announces the new position.

## How the pieces connect

`moveGoal` mirrors `handleGoalPointerUp`'s persistence step exactly (loop over the reordered
array, PATCH `order_index` for every goal whose index changed) so both the pointer and keyboard
paths save through the identical code shape. The status region reuses the same visually-hidden
inline-style pattern already used for the login page's live region
(`position:absolute; opacity:0; pointerEvents:'none'`) rather than introducing a new `sr-only`
utility class, since none exists in this codebase yet.

## How to modify this later

To change the announcement wording or add Home/End "move to top/bottom" keyboard shortcuts,
edit `moveGoal` and add matching buttons/handlers next to the existing up/down pair — keep the
same `stopPropagation()` calls so new controls don't fight the pointer-drag handler on the
parent card.
