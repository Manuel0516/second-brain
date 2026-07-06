# 0104 — LiveSession desktop header grid match

Date: 2026-07-06
Status: accepted

## What changed
Set the desktop live-session header row to use a fixed Feel column width that matches the feeling controls in the data rows.

## Why
The header grid was allocating a narrower Feel column than the set rows, which shifted the Distance and Time titles off the input columns on desktop.

## Files touched
- `apps/web/src/modules/fitness/fitness.css` — matched the desktop header grid template to the row layout.

## How the pieces connect
`LiveSession` uses the same grid structure for the header row and the set rows. The Feel column now consumes the same horizontal space in both places, so the fr-based Distance and Time columns stay aligned above the inputs.

## How to modify this later
If the feeling control width changes, update the fixed `124px` track in `.fit-live-row.head` alongside the feeling button sizes in `apps/web/src/modules/fitness/fitness.css`.
