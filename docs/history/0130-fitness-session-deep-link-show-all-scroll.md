# 0130 — Fix: deep-linked workout session didn't auto-expand history

Date: 2026-07-06
Status: accepted

## What changed

Clicking a fitness-linked past-event card (from Calendar) now always expands the History tab's
"show all" list and scrolls to the linked workout session — previously the user had to manually
press "Show all" if the session wasn't one of the 3 most recent.

## Why

Bug report: "if the workout session is hidden or was before the last three you need to press the
button to show all the workout sessions." The intent (`initialShowAll={!!editSessionId}` in
`Fitness.tsx`) already existed but didn't work: `SessionForm` seeds `showAll` from
`initialShowAll` via `useState`, which only reads that prop on mount. Since the URL already
contains `?tab=history` when the deep link fires, `SessionForm` mounts before the `edit_session`
effect in `Fitness.tsx` sets `editSessionId`, so `initialShowAll` is `false` at mount time and the
later prop change has no effect on the already-initialized state.

## Files touched

- `apps/web/src/modules/fitness/SessionForm.tsx` — split the single deep-link effect into two:
  the first (deps `[editSessionId, sessions]`) calls `startEditing(session)` and unconditionally
  `setShowAll(true)`; the second (deps `[editSessionId, sessions, showAll]`) looks up the
  `session-row-{id}` element and scrolls to it, re-running automatically once the `showAll`
  flip causes the row to exist in the DOM, then calls `onEditConsumed`.

## How the pieces connect

`Fitness.tsx` still owns the `?edit_session=` query-param parsing and passes `editSessionId` +
`initialShowAll` into `SessionForm`, but `SessionForm` no longer relies on the one-shot
`initialShowAll` prop for anything except itself; the fix lives entirely inside `SessionForm`
since it's the component that actually knows when the target row exists in the DOM. `initialShowAll`
prop is left as-is (harmless first-mount seed) since removing it would be an unrelated cleanup.

## How to modify this later

If another deep-link needs the same "force expand + scroll" behavior on a collapsed list, follow
this two-effect split: one effect sets the expand flag unconditionally, a second effect (with the
expand flag in its deps) performs the DOM lookup/scroll — a single effect can't do both reliably
because the state update it triggers doesn't render the target element until the next commit.
