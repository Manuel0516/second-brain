# 0094 — LogPastModal flex remove button alignment

Date: 2026-07-06
Status: accepted

## What changed
Removed the modal-specific grid layout for LogPastModal set cards and kept the delete `×` button vertically centered in the shared flex-based set row.

## Why
The modal needed to use the simpler flex row requested by the user, while still keeping the remove action aligned cleanly with the input fields.

## Files touched
- `apps/web/src/modules/fitness/fitness.css` — deleted the modal grid override for `.fit-history-set` and set the shared remove button alignment to `center`.

## How the pieces connect
`LogPastModal.tsx` already renders the shared `.fit-history-set` card. With the modal-specific grid removed, the existing flex row controls the layout again, and the delete button now aligns vertically in the same row as the inputs.

## How to modify this later
If the remove button should move again, change `.fit-history-set .fit-remove-button` in `apps/web/src/modules/fitness/fitness.css`. If the modal needs a different row shape, add a modal-scoped override back under `.fit-logpast-modal`.
