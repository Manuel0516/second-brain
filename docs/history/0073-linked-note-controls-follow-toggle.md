# 0073 — Linked note controls follow toggle

Date: 2026-07-05
Status: accepted

## What changed

The event editor's Linked card now hides note search and note creation controls when the Notes
connection toggle is off. Existing linked items remain visible and can still be opened or
unlinked.

## Why

Note-linking actions should not remain available when the event's Notes connection is disabled.

## Files touched

- `apps/web/src/modules/calendar/EventEditor.tsx` — conditions Linked note controls and empty-state copy on the Notes toggle.
- `apps/web/src/modules/calendar/EventEditor.test.tsx` — verifies the controls disappear while existing links remain visible.

## How the pieces connect

The Connections card owns `form.connect_notes`. The Linked card reads that same state to decide
whether it should expose note creation and search, avoiding a second source of truth.

## How to modify this later

Keep existing linked rows independent from the toggle so disabling new note actions never hides
or silently removes established links.
