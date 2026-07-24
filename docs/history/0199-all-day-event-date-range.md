# 0199 — All-day event date range

Date: 2026-07-24
Status: accepted

## What changed

The event editor now allows an all-day event to use the same start and end date. All-day
end dates are presented as inclusive dates in the editor and converted to an exclusive
next-day endpoint when saved.

## Why

A single-day all-day event previously initialized with identical timestamps but was blocked
by the timed-event rule requiring the end to be strictly after the start.

## Files touched

- `apps/web/src/modules/calendar/EventEditor.tsx` — applies all-day-specific date validation
  and translates between inclusive editor dates and exclusive stored endpoints.
- `apps/web/src/modules/calendar/EventEditor.test.tsx` — verifies a same-day all-day event
  saves with a valid one-day stored duration.

## How the pieces connect

The editor accepts same-day all-day ranges while the calendar API continues receiving a
positive duration. This preserves the backend assumptions used by range queries, recurrence
expansion, and external calendar sync without applying the relaxed rule to timed events.

## How to modify this later

Keep the inclusive-to-exclusive conversion at the event-editor boundary. If all-day ranges
are added to another editor, reuse the same date semantics and continue sending an endpoint
after the start to the API.
