# 0175 — Centered responsive Fitness and Food navbars

Date: 2026-07-24
Status: accepted

## What changed

Fitness and Food topbar controls now wrap and center as a group at intermediate viewport
widths. Navigation controls can wrap internally, while tabs and action buttons remain
centered when the topbar no longer has room for a single row.

## Why

At tablet and narrow desktop widths, the topbar groups could split unevenly and leave a
visually awkward left- or right-aligned row. Centering each wrapped line keeps the layout
balanced without changing the established control sizes.

## Files touched

- `apps/web/src/modules/fitness/fitness.css` — center and wrap the Fitness topbar below
  1024px.
- `apps/web/src/modules/food/food.css` — apply the same responsive centering to Food.

## How the pieces connect

Each page renders its topbar row as a wrapping flex container. The new breakpoint rules
center the row and its child groups, and allow the navigation group itself to wrap, so the
existing desktop layout remains unchanged while narrower layouts stay balanced.

## How to modify this later

Adjust the shared 1024px breakpoint rules in the two module stylesheets together. Preserve
the fixed control widths and use the existing spacing and color tokens when adding further
responsive behavior.
