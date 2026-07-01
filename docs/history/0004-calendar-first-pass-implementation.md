# 0004 — Calendar first-pass implementation

Date: 2026-06-29
Status: accepted

## What changed

Completed the full calendar module: CRUD events, recurrence, drag/resize, multi-calendar,
event editing card, color system, and cross-module connection stubs. Also added the calendar
color dot, overlap algorithm, and mobile compact view.

## Why

Phase 1 completion. The calendar is the main view and the spine of the product — every other
module connects to it.

## Files touched

- `apps/api/app/routes/calendar.py` — full CRUD: GET/POST/PATCH/DELETE for calendars and
  events; recurrence expansion on read; cascade delete events when calendar is deleted
- `apps/api/app/models.py` — CalendarEvent with full recurrence fields + connections JSON
- `apps/web/src/pages/Calendar.tsx` — page-level state, editor open/close, draft management
- `apps/web/src/modules/calendar/TimeGrid.tsx` — week grid with gesture engine
- `apps/web/src/modules/calendar/MonthView.tsx` — month grid
- `apps/web/src/modules/calendar/EventEditor.tsx` — create/edit card (portalled to body)
- `apps/web/src/modules/calendar/Sidebar.tsx` — calendar list with drag-to-reorder, delete
- `apps/web/src/modules/calendar/time.ts` — snap, overlap, grid position math
- `apps/web/src/modules/calendar/order.ts` — sidebar order stored in localStorage
- `apps/web/src/modules/calendar/colors.ts` — color preset constants
- `apps/web/src/styles.css` — event chip, editor card, sidebar styles

## How the pieces connect

**Recurrence expansion:** the API stores one row per series. On `GET /events?from=&to=`,
`calendar.py` reads all matching base events and calls `expand_recurrences()` which uses
`rrule` to generate virtual occurrences. Override rows (`recurrence_parent_id` is set) are
merged in — they replace the occurrence they override.

**Draft preview while editing:** `Calendar.tsx` holds `editorEvent` (the event being edited)
and derives `draftReplaceKey = occurrenceKey(editorEvent)`. `TimeGrid.tsx` filters out the
event matching that key from the real event list and instead renders the live draft ghost.
This means other occurrences of the same series remain visible while one is being edited.

**Event editor portal:** `EventEditor.tsx` uses `ReactDOM.createPortal(..., document.body)`
to escape any `transform`-containing ancestor (which would break `position: fixed`).

**Sidebar order:** `order.ts` stores the user's calendar order as an array of IDs in
`localStorage` under `CALENDAR_ORDER_KEY`. `orderCalendars()` merges the stored order with
the API-returned calendars list (handles newly added calendars gracefully).

**Cross-module connection stubs:** the `connections` JSON column on `CalendarEvent` stores
draft link intentions (e.g. `{ notes: true, finance: false }`) for modules not yet built.
When a real target record exists, an actual `Link` row is created instead.

## How to modify this later

- **Change recurrence expansion logic:** `apps/api/app/routes/calendar.py → expand_recurrences()`.
- **Add a new recurrence field:** add to `CalendarEvent` model, create migration, update
  the Pydantic schemas in `routes/calendar.py`, update `EventEditor.tsx`.
- **Change the editor card layout:** `EventEditor.tsx` + `styles.css → .event-editor`.
  The card is portalled — CSS targeting must use `.event-editor` at document level.
- **Change drag behavior:** `TimeGrid.tsx → handlePointerMove`. Snap is in `time.ts`.
- **Add Google Calendar sync:** add a `source = "google"` calendar, store `google_event_id`
  on events, add a background job for polling/webhooks. The existing data model already
  supports this.
