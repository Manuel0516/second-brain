# 0065 — Restore event connection cards

Date: 2026-07-05
Status: accepted

## What changed

Restored the Notes and Fitness connection cards when editing existing calendar events. Both
cards remain available during event creation as before.

## Why

The prior rollback hid these editor controls, but the intended scope was the fitness-event
linking implementation rather than the connection cards themselves.

## Files touched

- `apps/web/src/modules/calendar/EventEditor.tsx` — renders Notes and Fitness cards in create and edit modes.
- `apps/web/src/modules/calendar/EventEditor.test.tsx` — verifies both switches are visible in edit mode.

## How the pieces connect

The cards edit the existing `connections` draft stored on the calendar event. Their rendering
is independent of the removed planned-workout API and workout-link inference.

## How to modify this later

Keep card visibility separate from future calendar-to-fitness linking behavior. Change the
connection payload and persistence flow only after that workflow is redesigned.
