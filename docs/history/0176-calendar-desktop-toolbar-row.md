# 0176 — Calendar desktop toolbar row

Date: 2026-07-24
Status: accepted

## What changed

The Calendar toolbar now places its primary date controls and view controls on one centered
row at desktop widths. The compact two-row layout remains available below the rail/mobile
breakpoint.

## Why

The responsive navigation adjustments left the Calendar toolbar visually split on desktop,
where the available width is sufficient for the controls to sit together. Restoring a single
desktop row keeps the navigation compact and balanced.

## Files touched

- `apps/web/src/styles.css` — add a desktop-only flex layout for the Calendar toolbar while
  preserving the existing mobile/tablet grid layout.

## How the pieces connect

The Calendar JSX still renders primary and secondary controls as separate groups. The new
desktop rule changes only their shared `.cal-toolbar` container to flex, allowing the two
groups to occupy one row; the existing grid and mobile breakpoint rules continue to control
the narrower layout.

## How to modify this later

Keep the desktop breakpoint aligned with the 800px app-rail breakpoint. If the toolbar gains
another control, adjust the container width or group flex rules before changing individual
button dimensions.
