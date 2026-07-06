# 0102 — LiveSession header label block centering

Date: 2026-07-06
Status: accepted

## What changed
Changed the live session header labels to use block-level centered text instead of a flex wrapper.

## Why
The grid header labels were still reading slightly off-center above the input columns in desktop layout.

## Files touched
- `apps/web/src/modules/fitness/fitness.css` — simplified the header label box model to improve centering.

## How the pieces connect
`LiveSession` renders the live set table with CSS grid. The header labels now behave like normal block text inside each grid cell, which keeps the titles visually centered without changing the row structure or the input alignment.

## How to modify this later
If the live table needs another alignment tweak, adjust `.fit-live-row.head` and `.fit-live-row.head span` together in `apps/web/src/modules/fitness/fitness.css`. Keep the row grid tracks and the label centering in sync.
