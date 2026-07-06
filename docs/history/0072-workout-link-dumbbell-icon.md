# 0072 — Workout link dumbbell icon

Date: 2026-07-05
Status: accepted

## What changed

Replaced the ambiguous workout-link symbol in the event editor with a recognizable horizontal
dumbbell line icon.

## Why

The previous vertical shape looked like controls or sliders rather than workout equipment.

## Files touched

- `apps/web/src/modules/calendar/EventEditor.tsx` — replaced the workout-session link SVG path.

## How the pieces connect

`LinkIcon` selects this SVG whenever a linked item has `target_type` equal to
`workout_session`; notes and folders keep their existing icons.

## How to modify this later

Edit only the workout-session branch in `LinkIcon`. Keep the 24×24 view box and
`currentColor` stroke so sizing and themes continue to match linked rows.
