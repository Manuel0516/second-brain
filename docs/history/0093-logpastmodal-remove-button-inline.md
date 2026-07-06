# 0093 — LogPastModal remove button stays inline with set inputs

Date: 2026-07-06
Status: accepted

## What changed
Adjusted the LogPastModal set card layout so the remove `×` button stays on the same row as the set number and input fields instead of dropping below them.

## Why
The button wrapping to a second line made the card feel loose and uneven. Keeping the delete action inline with the inputs makes the modal card read like one coherent row and matches the desired workout-entry flow.

## Files touched
- `apps/web/src/modules/fitness/fitness.css` — changed the modal-specific set card override to a grid layout and pinned the remove button to the top row.

## How the pieces connect
`LogPastModal.tsx` already uses the shared `.fit-history-set` card. The modal-specific CSS override now controls only this surface, so the exercise rows keep their width behavior while the top row stays compact and the secondary controls move below it.

## How to modify this later
If the remove button should move again, edit the `.fit-logpast-modal .fit-history-set` grid rules in `apps/web/src/modules/fitness/fitness.css`. Keep the modal override scoped so the history editor’s row layout does not change with it.
