# 0172 — Fitness and Food navigation button placement

Date: 2026-07-24
Status: accepted

## What changed

The Fitness and Food mobile topbars now keep their navigation toggle in normal flow directly
to the left of the page title. The toggle no longer anchors to the far edge of the topbar and
has a raised stacking level so it remains available above the mobile app-rail layer.

## Why

The edge-anchored button could end up behind the app rail on a phone, making the navigation
toggle difficult to reach. Keeping it beside the title gives it a stable position in both
topbars and preserves the existing button size and behavior.

## Files touched

- `apps/web/src/modules/fitness/Fitness.tsx` — removes the mobile-only absolute positioning
  from the Fitness navigation toggle.
- `apps/web/src/modules/food/Food.tsx` — removes the mobile-only absolute positioning from
  the Food navigation toggle.
- `apps/web/src/modules/fitness/fitness.css` — keeps the Fitness toggle in title flow and
  above the mobile rail stacking layer.
- `apps/web/src/modules/food/food.css` — mirrors the same stable placement for Food.

## How the pieces connect

Both page components render the same toggle-before-title structure inside their topbar nav
groups. Their module-specific rules now share the same flow and stacking behavior without
changing sidebar state, rail rendering, or navigation callbacks.

## How to modify this later

Keep the first navigation button static in the `.fit-topbar-nav` and `.food-topbar-nav` flex
groups. If the mobile rail z-index changes, update the toggle stacking level with it rather
than returning to viewport-edge absolute positioning.
