# 0181 — Calendar toolbar direct controls

Date: 2026-07-24
Status: accepted

## What changed

The Calendar view selector and add-event button are now direct children of the toolbar,
matching the Fitness and Food navbar structure. On desktop they can position independently,
with the selector pushed toward the right and the add button following it with the shared
toolbar gap.

## Why

The secondary wrapper constrained the selector and add button as one rigid group. Removing
that layout boundary lets the desktop toolbar distribute its controls naturally while still
keeping the two controls together on the narrow second row.

## Files touched

- `apps/web/src/pages/Calendar.tsx` — removes the `cal-toolbar-secondary` wrapper.
- `apps/web/src/styles.css` — defines direct-child grid placement for narrow layouts and
  independent flex positioning for desktop.

## How the pieces connect

The primary date controls remain one toolbar child. The selector and add button are now sibling
children, so desktop flex alignment can place the selector with `margin-left: auto` and leave
the empty space between Today and the selector. At narrow widths, explicit grid placement
keeps the primary group on the first row and both controls on the second.

## How to modify this later

Change the direct-child `.calendar-tabs` and `.cal-new-event-button` rules together. Preserve
their desktop `margin-left: auto` relationship and the narrow grid row assignments.
