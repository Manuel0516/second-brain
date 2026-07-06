# 0103 — LiveSession desktop header stretch alignment

Date: 2026-07-06
Status: accepted

## What changed
Changed the desktop live-session header row to stretch its grid items across their columns instead of centering the items themselves.

## Why
The desktop column titles were still reading slightly off-center above the inputs even though the mobile layout was already correct.

## Files touched
- `apps/web/src/modules/fitness/fitness.css` — changed the desktop header row alignment from centered items to stretched grid cells.

## How the pieces connect
`LiveSession` uses the same grid columns for the header row and the data rows. Stretching the header items makes each label occupy the full width of its grid cell, so the text centering happens inside the actual column instead of on a smaller centered box.

## How to modify this later
If the desktop header titles drift again, adjust `.fit-live-row.head` and `.fit-live-row.head span` together in `apps/web/src/modules/fitness/fitness.css`. Keep the mobile breakpoint separate so touch sizing stays intact.
