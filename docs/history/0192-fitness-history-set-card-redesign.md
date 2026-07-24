# 0192 — Fitness history set card redesign

Date: 2026-07-24
Status: accepted

## What changed
Redesigned the editable workout history set row (`.fit-history-set`) into a bordered card
with a clear header (set number top-left, delete cross top-right), a two-column
distance/time or reps/weight row with a divider between the fields, a centered "Feel"
section with a visible label, and a full-width set-note field — each section separated by
a divider line. The delete button now uses the same `×` glyph used everywhere else in the
project (list-item/tag/exercise remove buttons) instead of a lowercase `x`, and it now
renders on desktop as well as mobile. Applied the same restructure to the past-workout
logging modal's set rows for consistency, including its compact single-row mobile grid.

## Why
User request: match a reference design showing the set row as a proper card (header with
set label + cross, two-column fields, centered feel row, note row), and make sure the
delete control matches the `×` used elsewhere in the app rather than the plain "x" text
that only this component used.

## Files touched
- `apps/web/src/modules/fitness/SessionForm.tsx` — moved the delete button next to the set
  number (header of the card) instead of after the note field, wrapped the distance/time
  (or reps/weight) `<label>` pair in a new `.fit-history-set-fields` div, added a visible
  "Feel" label inside the feeling `fieldset`, and switched the delete glyph from `x` to `×`.
- `apps/web/src/modules/fitness/LogPastModal.tsx` — same restructure applied to the past-
  workout draft set rows, which share the `.fit-history-set` class and previously had
  slightly different markup (delete button already used `×` here).
- `apps/web/src/modules/fitness/fitness.css` — reworked `.fit-history-set` into a
  `var(--r-lg)` / `var(--bg-elevated)` card with generous padding; added
  `.fit-history-set-fields` (flex row with a divider between the two fields, column-stacked
  with no divider under `max-width: 720px`); added dividers above `.fit-feeling` and
  `.fit-history-set-note`; added `.fit-history-set .fit-feeling > span` styling for the new
  visible "Feel" label. Removed the old mobile-only `order`-based stacking hack (now the
  base layout already stacks header/fields/feeling/note via `flex-basis: 100%`, so only
  sizing tweaks remain in the `720px` media query). Updated the `.fit-logpast-modal` dense
  mobile grid to target `.fit-history-set-fields` as a single grid cell instead of two
  separate label cells.

## How the pieces connect
Both `SessionForm.tsx` (editing an existing session's sets) and `LogPastModal.tsx` (adding
sets to a backfilled past workout) render sets with the same DOM shape and the same
`.fit-history-set` / `.fit-history-set-fields` / `.fit-feeling` / `.fit-history-set-note` /
`.fit-remove-button` classes, so a single CSS pass restyles both call sites. The visual
"card" is built entirely with `flex-wrap` + `flex-basis: 100%` on each section (no wrapper
divs needed for the header row) — the browser naturally line-breaks after each 100%-basis
section, so DOM order alone determines the stacked layout at every viewport width; only the
inner `.fit-history-set-fields` row switches from a 2-column row to a stacked column under
`max-width: 720px`. `LogPastModal`'s mobile view additionally overrides `.fit-history-set`
to a dense single-row grid (space is tighter inside the modal), so its own media query block
needed updating to place `.fit-history-set-fields` as one grid cell.

## How to modify this later
Find `.fit-history-set` in `apps/web/src/modules/fitness/fitness.css`. The header
(`<strong>` + `.fit-remove-button`) is always the first line because both are small,
non-100%-basis flex items and everything after them has `flex-basis: 100%`. To change what
appears in the header, keep those two elements first in the JSX in both `SessionForm.tsx`
and `LogPastModal.tsx` — don't reintroduce the old `order:` CSS hack. The `×` used for
delete comes from the project's shared `.fit-remove-button` class (also used by
`LogPastModal`'s exercise-remove button, `DatabasePage.tsx`, `AdminSettings.tsx`,
`EventEditor.tsx`) — keep using that glyph for any new "remove this row" control instead of
inventing another icon.
