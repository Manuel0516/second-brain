# 0095 — LogPastModal single-row flex set card

Date: 2026-07-06
Status: accepted

## What changed
Forced the LogPastModal set card to stay on one flex row so the remove `×` button remains alongside the inputs and the set number stays vertically centered with the input boxes.

## Why
The modal card was wrapping the delete button onto a second line. The requested layout is a single compact row that mirrors the input alignment of the rest of the fitness UI.

## Files touched
- `apps/web/src/modules/fitness/fitness.css` — added a modal-specific flex nowrap override for `.fit-history-set`, relaxed the modal label widths, and kept the remove button vertically centered in the row.

## How the pieces connect
`LogPastModal.tsx` still reuses the shared `.fit-history-set` card. The modal-specific CSS now only changes the flex behavior for this surface, so the row stays compact while the history editor can keep its own wrapping behavior.

## How to modify this later
If the modal needs to wrap again, remove the `.fit-logpast-modal .fit-history-set` override in `apps/web/src/modules/fitness/fitness.css`. If the button alignment shifts, adjust the shared `.fit-history-set .fit-remove-button` rule instead of adding a second modal-only rule.
