# 0101 — LiveSession desktop header centering

Date: 2026-07-06
Status: accepted

## What changed
Centered the live session table headers directly over their input columns on desktop.

## Why
The distance/time and strength column titles were not visually lining up with the inputs below them.

## Files touched
- `apps/web/src/modules/fitness/fitness.css` — made the live table header labels fill their grid cells and center their text.

## How the pieces connect
`LiveSession` uses a shared grid for the live set table. The row header now stretches each label across its column, so the column titles sit above the matching inputs without changing the table structure.

## How to modify this later
If the live table columns change, adjust the `.fit-live-row` grid and the `.fit-live-row.head span` rule together in `apps/web/src/modules/fitness/fitness.css` so the headings keep lining up with the inputs.
