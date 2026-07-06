# 0061 — All-day event click fix + cursor change

Date: 2026-07-05
Status: accepted

## What changed
1. Fixed all-day events in the Day/Week (TimeGrid) view: clicking an all-day event
   now opens the event detail panel (EventEditor) instead of silently doing nothing.
2. Changed the all-day event cursor: hover shows `pointer` (click hand) instead of
   `grab`; on mousedown/active it shows `grabbing`, indicating the drag-to-convert
   behavior only activates while held down.

## Why
All-day event chips had pointer event handlers (`onPointerDown`, `onPointerMove`,
`onPointerUp`) for drag-to-convert behavior (dragging an all-day chip into the time
grid to convert it to a 30-minute timed event). However, `finishAllDayDrag` only
handled the "moved" case (actual drag). When the user clicked without moving
(`!current.moved`), it returned silently, leaving no way to open the event editor.

Timed events handled the same scenario correctly: `finishEventGesture` at line 819
calls `onEdit(clickedEvent)` when no movement occurred. The all-day path now matches.

The existing `onClick` handler at lines 1090–1094 uses `pointer.detail === 0` to
gate on keyboard/assistive activation only — this prevents double-firing when the
mouse path (via `finishAllDayDrag`) also calls `onEdit`.

## Files touched
- `apps/web/src/modules/calendar/TimeGrid.tsx` — in `finishAllDayDrag`, the early
  return `if (!current.moved) return` was changed to call `onEdit(event)` before
  returning, so a click without drag opens the event detail panel.
- `apps/web/src/styles.css` — `.allday-event` changed from `cursor: grab` to
  `cursor: pointer`; the existing `.allday-event:active { cursor: grabbing }` rule
  handles the while-held state.

## How the pieces connect
- `Calendar.tsx` holds `editorEvent` state and passes `onEdit={setEditorEvent}` to
  both `MonthView` and `TimeGrid`.
- In `TimeGrid`, timed events use `finishEventGesture` (line 805) which calls
  `onEdit` when unmoved (line 819); all-day events use `finishAllDayDrag` (line 925)
  which now does the same.
- `EventEditor.tsx` renders when `editorEvent` is non-null, providing the full
  slide-over detail/edit panel.

## How to modify this later
If you need to change all-day event click behavior, look at `finishAllDayDrag`
in `TimeGrid.tsx` (~line 925). The pattern is:
1. `startAllDayDrag` (pointerdown) — begins drag tracking with pointer capture
2. `moveAllDayDrag` (pointermove) — tracks movement beyond `DRAG_THRESHOLD` (3px)
3. `finishAllDayDrag` (pointerup) — if moved → convert to timed event; if not
   moved → `onEdit(event)` to open the detail panel
The `onClick` handler (lines 1090–1094) handles keyboard-only activation
(`pointer.detail === 0`) as a separate path.
