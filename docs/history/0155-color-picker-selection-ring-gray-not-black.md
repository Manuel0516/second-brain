# 0155 — Color picker selection ring: gray instead of black on light swatches

Date: 2026-07-22
Status: accepted

## What changed
The shared color-picker `onColor` helper now returns a light gray (`#a8a298`) instead of
near-black (`#131210`) for very light swatches. This is the value behind `--cc-on`/`--sw-on`,
which paints both the on-swatch icon/checkmark and the `.active` selection ring.

## Why
User report: when a light custom color is selected, the selection ring turned near-black and
blended into the dark app background, making it hard to tell the swatch was selected. A gray
that is distinct from the background reads clearly there while still being legible as an icon
on a light swatch.

## Files touched
- `apps/web/src/modules/calendar/colors.ts` — `onColor` dark branch changed from `#131210` to
  `#a8a298`; comment updated.

## How the pieces connect
Every color picker (event editor, calendar sidebar, settings ICS field, notes text/highlight/
block colors) feeds each swatch `--cc-on`/`--sw-on = onColor(color)`. In `styles.css` the
`.color-swatch.active` / `.color-custom.active` rules draw the selection ring with
`box-shadow: 0 0 0 2px var(--cc-on, …)`, and `.color-custom-icon` uses the same token for the
pencil color. The preset palette is all mid-tone, so `onColor` only returns the dark value for
light *custom* colors — exactly the case the user hit. Fixing the one helper corrects the ring
across every picker at once.

## How to modify this later
- The gray lives in `onColor` in `apps/web/src/modules/calendar/colors.ts`. The `> 0.72`
  luminance threshold decides which swatches get it.
- If the on-swatch icon ever needs stronger contrast than the ring (they currently share
  `--cc-on`), split them: keep `onColor` for the icon and give the `.active` ring its own
  page-contrast token in `styles.css`.
