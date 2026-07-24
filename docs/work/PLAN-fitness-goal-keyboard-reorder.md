# Plan: Keyboard-accessible Fitness goal reordering

Status: ready for immediate implementation

Date: 2026-07-24

## Summary

Resolve UX-010: the Fitness sidebar goal cards can only be reordered by pointer drag. Add
explicit **Move up** / **Move down** buttons to each goal card so keyboard and switch-input
users can reorder without a pointer. Pointer drag is unchanged.

## Changes

- Each goal card in the sidebar (`Fitness.tsx`) gets two small icon buttons, `Move {label} up`
  and `Move {label} down`, styled after the existing `.fit-goal-edit`/`.fit-goal-delete` icon
  buttons (22×22px, same hover treatment).
- The first goal's "up" button and the last goal's "down" button are `disabled`.
- Activating a button swaps the goal with its neighbor, persists the new `order_index` for
  every goal whose index changed (reusing the same `updateGoal` call already used by the
  pointer-drag drop handler), and updates a visually-hidden `role="status"` region with
  `"{label} moved to position {n} of {total}"`.
- The buttons stop pointer-event propagation so activating one does not also trigger the
  parent card's drag-start handler.
- No change to `handleGoalPointerDown`/`Move`/`Up` pointer drag logic, goal data shape, or any
  API contract.

## Acceptance

- Every goal can be moved to any position using only Tab and Enter/Space.
- Each move is announced via the status region.
- Clicking a goal card without dragging still does not reorder (unchanged pointer behavior).
- `npm run check` passes.

## Tests

Extend or add a Fitness sidebar test proving: up/down buttons move the goal in `goals` state,
boundary buttons are disabled, `updateGoal` is called with the new `order_index` values, and
the status region text updates after a move.
