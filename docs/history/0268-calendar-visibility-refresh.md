# 0268 — Refresh events when calendar visibility changes

Date: 2026-09-22
Status: accepted

## What changed
Calendar sidebar changes now refresh the displayed events as well as the calendar
list. Hiding or showing an owned or shared calendar updates the current view after
the save succeeds, without requiring a browser refresh.

## Why
The sidebar previously reloaded only calendar metadata. The event views reload
when their date range or refresh counter changes, so visibility changes left the
old events on screen.

## Files touched
- `apps/web/src/pages/Calendar.tsx` — connect the sidebar's `onChanged` callback to
  the existing `refreshCalendar` handler instead of `loadCalendars`.
- `docs/history/0268-calendar-visibility-refresh.md` — record this fix.
- `docs/history/CHANGELOG.md` — index this entry.

## How the pieces connect
The sidebar calls `onChanged` after a successful calendar or shared-calendar
update. `refreshCalendar` reloads calendar metadata and increments the refresh
counter passed to `TimeGrid` and `MonthView`. Their existing effects fetch the
updated event list for the current date range.

## How to modify this later
Keep sidebar mutations connected to `refreshCalendar` when they can affect the
displayed events. Calling only `loadCalendars` updates metadata but does not
invalidate either view's event list. Check both hiding and showing calendars in
the month and time-grid views when changing this flow.
