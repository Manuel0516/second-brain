# 0003 — Calendar view behavior decisions

Date: 2026-06-28
Status: accepted

## What changed

Defined and implemented the durable behavioral contract for the calendar: views, navigation,
event creation, event editing, drag/resize, multi-select, and calendar identity.

## Why

After the initial calendar MVP, several behaviors had been left implicit. Codifying them
prevents future agents from accidentally changing fundamental UX decisions when touching
related code.

## Files touched

- `apps/web/src/modules/calendar/TimeGrid.tsx` — week/day grid with drag, resize, create
- `apps/web/src/modules/calendar/MonthView.tsx` — month grid
- `apps/web/src/modules/calendar/Sidebar.tsx` — calendar list
- `apps/web/src/modules/calendar/EventEditor.tsx` — create/edit card
- `apps/web/src/modules/calendar/time.ts` — time math utilities
- `apps/web/src/styles.css` — event chip styles, calendar color identity

## How the pieces connect

**View and navigation:** `Calendar.tsx` holds `currentDate` state and passes it to
`TimeGrid.tsx` (week/day view) or `MonthView.tsx`. Navigation buttons in the header call
`setCurrentDate`. The "Today" button resets to Monday of the current week.

**Event creation:** clicking the grid calls `TimeGrid.tsx → handlePointerDown`. A click
without drag calls `onCreateAt(minute)` in `Calendar.tsx` which opens `EventEditor.tsx`.
Dragging sets `draftEvent` state in `TimeGrid.tsx` which renders a ghost chip.

**Drag and resize:** handled entirely in `TimeGrid.tsx` via pointer events. Snap logic is
in `time.ts → minuteAtPointer()` (rounds to nearest 5 minutes). The moved event is sent
to the API only on pointer release.

**Calendar identity:** each event `<button>` gets an inline `--cal-color` CSS custom
property injected from the event's calendar color. A `::before` pseudo-element uses that
property to render a small color dot at the top-left.

## How to modify this later

- **Change snap interval:** `SNAP_MINUTES` constant in `time.ts`.
- **Change default event duration:** `settings.default_event_minutes` (from UserSettings).
- **Change week start:** `settings.week_start` in `SettingsContext` — the grid uses this
  to determine which day to show first.
- **Add a new view (e.g. day view):** add a new view component under `modules/calendar/`,
  add it to the view switcher in `Calendar.tsx`, and add routing if needed.
- **Change the color dot:** `apps/web/src/styles.css` → `.calendar-event::before`.
