# 0074 — Fitness connection icons and notes

Date: 2026-07-05
Status: accepted

## What changed

Replaced all six workout-type icons with clearer line symbols and reduced the Fitness
connection's workout-notes field to a compact height.

## Why

The prior workout symbols were ambiguous, and the shared editor textarea minimum made the
short workout-notes field unnecessarily tall.

## Files touched

- `apps/web/src/modules/fitness/sessionTypes.tsx` — replaces Push, Pull, Legs, Upper, Cardio, and Custom SVG paths.
- `apps/web/src/modules/calendar/EventEditor.tsx` — marks workout notes as a compact textarea.
- `apps/web/src/styles.css` — gives only the workout-notes textarea a 52px height.

## How the pieces connect

`SessionTypeIcon` is shared by calendar and fitness surfaces, so every workout-type card uses
the same symbols. The dedicated textarea class overrides only the event editor's global 80px
textarea minimum.

## How to modify this later

Change workout symbols in `SessionTypeIcon` so all consumers remain consistent. Adjust
`.workout-notes` rather than the global event-editor textarea rule.
