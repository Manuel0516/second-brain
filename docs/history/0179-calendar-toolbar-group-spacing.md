# 0179 — Calendar toolbar group spacing

Date: 2026-07-24
Status: accepted

## What changed

The Calendar desktop toolbar now keeps the date/navigation controls as a compact left group
and the Day/Week/Month selector plus add button as a right group, with the flexible empty
space between Today and the selector.

## Why

The previous full-width toolbar allowed the primary group to grow into the available space,
which did not match the established Fitness and Food desktop navbar composition.

## Files touched

- `apps/web/src/styles.css` — use space-between alignment and intrinsic sizing for the two
  Calendar desktop toolbar groups.

## How the pieces connect

The Calendar JSX already renders primary and secondary controls separately. The desktop flex
rule now keeps the primary group compact and pushes the secondary group to the opposite edge;
the base grid layout still controls narrower viewports.

## How to modify this later

Adjust the `.cal-toolbar` and `.cal-toolbar-primary` rules inside the `min-width: 801px`
media query. Keep the two groups separate so the responsive layout can continue stacking them.
