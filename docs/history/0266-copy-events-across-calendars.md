# 0266 — Copy events across calendars

Date: 2026-09-17
Status: accepted

## What changed

Existing events now offer a Copy to calendar section, defaulting to Personal when
available. It copies the saved event at the selected occurrence's time, preserving
title, description, location, URL, icon, color override, reminder, timezone, and
connection drafts. Incoming and outgoing note links retain their relationship to
the original notes. A recurring event is copied as one independent occurrence.
Keyboard pasting from read-only calendars now targets Personal or the first
writable calendar. The original source is unchanged.

## Why

The user wants to copy university calendar events into a personal calendar with
notes and links. Previously copies always targeted the source calendar, which
made ICS sources unusable, and note graph links were omitted.

## Files touched

- `apps/api/app/routes/calendar.py` — optional destination calendar and occurrence-only copy; readable source and writable destination checks; note edges and destination notifications.
- `apps/api/tests/test_calendar.py` — ICS copy fidelity, source preservation, private-source rejection, and read-only destination rejection.
- `apps/web/src/modules/calendar/EventEditor.tsx` — existing fieldset/dropdown patterns for destination selection and copy feedback.
- `apps/web/src/modules/calendar/EventEditor.test.tsx` — editor copy request and unchanged source behavior.
- `apps/web/src/modules/calendar/TimeGrid.tsx` — writable fallback destination for keyboard paste from read-only sources.
- `apps/web/src/modules/calendar/TimeGrid.interaction.test.tsx` — local and ICS keyboard paste behavior.
- `apps/web/src/modules/assistant/AssistantPanel.test.tsx` — waits for asynchronously loaded handoff content; fixes an existing full-check race discovered during verification.
- `docs/history/CHANGELOG.md` — indexes this entry.

## How the pieces connect

Both UI paths use POST /api/events/copy. The API reads source events using existing
calendar access rules, validates every destination before insertion, and creates
fresh event rows without external sync identity. The new explicit copy action
uses occurrence_only=true. Existing callers retain their previous recurrence
behavior. Accessible note edges are copied in either direction; notes themselves
are not duplicated. Existing workout/meal cloning remains restricted to the
requesting user's records. Destination calendars receive refresh notifications.

Verification: `npm run check` passed: 175 frontend tests, the production build,
API formatting/lint/type checks, and 151 API tests. The full run needed local
server access for existing browser integration tests.

## How to modify this later

Extend BulkEventCopy for new copy options and keep both UI callers in sync.
Keep source read permissions separate from destination write permissions. Do not
copy external IDs or recurrence-parent identity. New graph node types need an
explicit access check before being copied. Copy event operates on saved details;
its explanatory text must stay clear if draft-copy behavior is introduced.
