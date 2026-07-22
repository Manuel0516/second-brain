# 0150 — ICS subscription circular color picker

Date: 2026-07-22
Status: accepted

## What changed

The ICS subscription form's rectangular native color input was replaced with the same complete
picker used by event create/edit: favorite-color circles followed by a circular custom-color
swatch. The custom circle displays the chosen color, uses a contrast-aware pencil icon, and still
opens the browser's native color picker. The Name and Color labels share the same top alignment,
and the swatch row matches the name input's height so its circles are vertically centered.

## Why

The old rectangular input did not match color selection elsewhere in the website. The requested
UX change makes calendar creation consistent without changing subscription behavior or data.

## Files touched

- `apps/web/src/modules/settings/CalendarIntegrations.tsx` — reads favorite colors from Settings
  and renders the established `color-swatch`/`color-custom` controls with the `onColor` helper.

## How the pieces connect

`icsColor` remains the form state submitted to `/api/integrations/ics`. Favorite swatches set that
state directly; the invisible native input in the last circle handles arbitrary colors. Existing
global swatch/custom/active styles supply the shape, ring, and interaction.

## How to modify this later

Change the shared `.color-custom` rules in `apps/web/src/styles.css` if all custom color circles
should change together. Keep the ICS field on the shared classes so it does not drift from the
calendar sidebar and event editor.
