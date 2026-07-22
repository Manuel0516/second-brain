# 0152 — Event editor doesn't auto-close after saving (parent re-render cancels close)

Date: 2026-07-22
Status: accepted

## What changed
After saving an event, the editor schedules its close on a timer. That timer was being
cancelled whenever the parent (`Calendar`) re-rendered during the ~700ms close window, so the
card stayed open. Split the editor's teardown so the pending close/error timers are cleared
only on unmount, not on every `onClose` identity change.

## Why
User report: creating an event that repeats did not close the create card automatically.

Root cause was not recurrence-specific. `Calendar.tsx` passes an inline `onClose={() => …}`,
so its identity changes on every parent render. The editor bundled its timer cleanup into the
same effect as the Escape-key listener, which depends on `onClose`:

```
}, [closeWithAnimation, onClose])
```

Creating an event broadcasts a `calendar` WebSocket update → `refreshCalendar()` re-renders
`Calendar` → new `onClose` → the effect's cleanup runs → `clearTimeout(saveStateTimer)` cancels
the scheduled close. Repeating events surfaced it most reliably because the extra backend work
(series row + one planned meal/workout per occurrence) shifts the WS refresh squarely into the
close window; a fast non-recurring save often finished closing first.

## Files touched
- `apps/web/src/modules/calendar/EventEditor.tsx` — split the mount effect: one effect keeps the
  Escape listener (deps `[closeWithAnimation, onClose]`); a new effect clears `closeTimer`,
  `saveStateTimer`, `errorFrame`, and `errorTimer` with `[]` deps so it only runs on unmount.
- `apps/web/src/modules/calendar/EventEditor.test.tsx` — two regression tests: closing after
  saving a new repeating event, and closing when a parent re-renders on a 40ms interval mid-save
  (reproduces the exact failure — fails before the fix, passes after).

## How the pieces connect
`commitSave` sets `saveStateTimer` to fire `closeWithAnimation` ~450ms after a successful save,
which then runs the parent's `onSaved`/`onClose` after the slide-out animation. That whole chain
lives in refs so a re-render can't lose it — but an effect cleanup keyed on `onClose` was
actively clearing those refs. Timer refs conceptually belong to the component's lifetime, so
their cleanup belongs in an unmount-only effect, independent of any changing prop.

## How to modify this later
- Any timer/RAF stored in a ref for the editor's lifetime should be cleared in the `[]`-deps
  unmount effect, never in an effect that also depends on a prop.
- Alternatively/additionally, `Calendar.tsx` could wrap `onClose`/`onSaved` in `useCallback`,
  but the component-level split is the durable fix because it does not depend on every caller
  memoizing its handlers.
