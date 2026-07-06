# 0099 — LiveSession header distance/time labels and centering

Date: 2026-07-06
Status: accepted

## What changed
Updated the live fitness session table header so cardio exercises show Distance / Time instead of km / min, and centered the header cells over the value columns.

## Why
The live session panel needed clearer labels for cardio logging and better horizontal alignment between the column titles and the input fields.

## Files touched
- `apps/web/src/modules/fitness/LiveSession.tsx` — changed the table header labels for cardio rows.
- `apps/web/src/modules/fitness/fitness.css` — centered the live table header cells.

## How the pieces connect
`LiveSession` renders one shared table layout for strength and cardio sets. The JSX now swaps the second and third header labels based on exercise category, while the shared CSS keeps the header cells aligned with the underlying grid used by each set row.

## How to modify this later
Edit `apps/web/src/modules/fitness/LiveSession.tsx` if the live-session column names change again. If the table grid changes, update the `.fit-live-row.head` rules in `apps/web/src/modules/fitness/fitness.css` so the headers stay centered over the inputs.
