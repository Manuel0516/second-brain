# 0174 — Fitness responsive rail and Log past width

Date: 2026-07-24
Status: accepted

## What changed

Fitness now gives its Log past action the same 300px responsive maximum as the section tabs.
All primary app pages treat widths up to 800px as rail-mobile: the app rail stays hidden
while page content remains visible, and only opens as the navigation drawer when the user
explicitly toggles it.

## Why

The Fitness Log past button was wider than the Overview/Stats/History controls on tablets.
At an intermediate tablet width, the fixed app rail was rendered over page content because
the page state used a narrower 640px mobile breakpoint than the shared rail CSS.

## Files touched

- `apps/web/src/modules/fitness/Fitness.tsx` — adds an 800px rail breakpoint and hides the
  rail until the mobile drawer is opened.
- `apps/web/src/modules/food/Food.tsx` — applies the same 800px rail behavior for Food.
- `apps/web/src/pages/Calendar.tsx` — applies the rail-only breakpoint without changing its
  640px calendar content behavior.
- `apps/web/src/modules/notes/Notes.tsx` — applies the rail-only breakpoint to the notes shell.
- `apps/web/src/modules/fitness/fitness.css` — caps responsive Fitness topbar actions at 300px.

## How the pieces connect

Each page’s `isRailMobile` state now matches the shared `@media (max-width: 800px)` rail
positioning. Existing 640px `isMobile` behavior remains separate for content formatting,
while sidebar state controls whether the drawer is intentionally opened.

## How to modify this later

Keep the 800px rail breakpoint synchronized with the global app-rail CSS. If the tab width
changes, update the Fitness action `max-width` alongside the Food equivalent.
