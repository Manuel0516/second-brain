# 0182 — Calendar toolbar space-between alignment

Date: 2026-07-24
Status: accepted

## What changed

Calendar desktop toolbar groups now use space-between alignment, distributing the date
controls, view selector, and add button across the full navbar width.

## Why

The selector and add button were still visually clustered after becoming direct toolbar
children. Matching the Fitness and Food navbar distribution gives each desktop control group
clear breathing room.

## Files touched

- `apps/web/src/styles.css` — distribute direct Calendar toolbar children with
  `justify-content: space-between` and remove the selector's auto-margin.

## How the pieces connect

The desktop toolbar is a flex row with three direct children: primary date controls,
`.calendar-tabs`, and `.cal-new-event-button`. Space-between places the free space between
those groups; the narrow grid rules remain independent.

## How to modify this later

Keep desktop distribution in the `min-width: 801px` rule. Adjust the group structure before
changing individual control sizes so the Fitness/Food alignment remains the reference.
