# 0059 — Mobile topbar layouts (Fitness, Calendar, Notes)

Date: 2026-07-05
Status: accepted

## What changed

Reworked the topbar/header layout for all three module pages on mobile (≤640 px)
using the same design language:
- **Fitness**: Toggle absolute left, title centered, action buttons full-width,
  tabs centered. Desktop remains `space-between`.
- **Calendar**: Same pattern — toggle absolute left, date title centered,
  nav row (‹ Today ›) centered below, view pills centered, New event full-width.
- **Notes**: Toggle absolute left, page title centered, New page full-width.
  Uses `display: contents` on the desktop wrapper to avoid JSX duplication.

Removed conflicting CSS mobile overrides for `.cal-topbar-nav`,
`.cal-new-event-label`, and `.cal-new-event` in `styles.css` (≤800 px
breakpoint) so the new inline styles can control layout.

## Why

User liked the Fitness mobile layout and wanted the same centered topbar
treatment applied to Calendar and Notes for consistency.

## Files touched

- `apps/web/src/styles.css` — Removed mobile overrides for `.cal-topbar-nav`,
  `.cal-new-event-label`, `.cal-new-event` (kept only padding compact).
- `apps/web/src/pages/Calendar.tsx` — Topbar container, date-nav section, view
  pills, and new-event button all use conditional `isMobile` styles.
- `apps/web/src/modules/notes/Notes.tsx` — Topbar container, toggle+title
  wrapper, and new-page button all use conditional `isMobile` styles.
- `apps/web/src/modules/fitness/Fitness.tsx` — Header and tabs already done
  in the first pass of this change (earlier in this session).

## How the pieces connect

All three pages share the same `isMobile` pattern (640 px breakpoint). Each
topbar uses `flexDirection: isMobile ? 'column' : 'row'` and either JSX
branching (Calendar) or `display: contents` wrappers (Notes) to restructure
the layout on mobile without duplicating markup.

The removed CSS rules in `styles.css` were at the 800 px breakpoint and forced
`cal-new-event` into a tiny icon-only button and `.cal-topbar-nav` into a
single centered row. With inline styles taking over, Calendar and Notes both
get the full Fitness-style treatment: absolute-left toggle, centered title,
and full-width action buttons.

## How to modify this later

To change the mobile breakpoint, update the `640` value in the `isMobile`
state + `matchMedia` call in each page. All mobile-specific inline styles
are gated on the same variable.

If the `display: contents` approach in Notes causes any cross-browser issues
(IE doesn't support it, but we target modern browsers), switch to the JSX
branching approach used in Calendar.
