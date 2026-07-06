# 0068 — Fitness topbar calendar parity

Date: 2026-07-05
Status: accepted

## What changed

Reworked the fitness page header to match the calendar's `cal-topbar`/`cal-topbar-nav` pattern:

- **CSS**: Added `.fit-topbar`, `.fit-topbar-row`, `.fit-topbar-nav`, `.fit-topbar-nav-btn`, `.fit-topbar-today`, `.fit-topbar-title`, `.fit-topbar-sub`, `.fit-topbar-nav-group`, `.fit-topbar-nav-buttons`, `.fit-topbar-actions`, `.fit-topbar-secondary-btn` — all mirroring the calendar/notes topbar token language.
- **Fitness.tsx**: Replaced all inline styles in the header section with CSS classes. Restructured `<main>` to be a flex-column container with the topbar as a `flex-shrink: 0` child (with `border-bottom`) and content in a separate scrollable div — matching the calendar layout.
- **Removed** the unused `weekNavBtnStyle` constant (all nav buttons now use `.fit-topbar-nav-btn`).
- Updated nav button sizing from 22×22 → 26×26 to match the calendar's `navBtnStyle`.
- Title font-size changed from 21px → 17px to match the calendar's title.
- Today button now uses the calendar's style (color-mix background, 11.5px font-size, no border).
- Mobile layout at ≤720px: toggle absolute left, centered title, centered week nav + buttons.
- Left the `fit-topbar-secondary-btn` (Log past) and `fit-primary-button` (Start session) action buttons in place.

## Why

The calendar page is the visual gold standard for topbars. The fitness header had hardcoded inline styles with mismatched sizing (22px nav buttons, 21px title) that diverged from the project's established pattern. This makes the fitness page consistent with the rest of the app.

## Files touched

- `apps/web/src/modules/fitness/fitness.css` — Added new `.fit-topbar-*` classes after line 960 and a mobile media query block at `@media (max-width: 720px)`
- `apps/web/src/modules/fitness/Fitness.tsx` — Replaced lines 693-916 (header section) with CSS-class-based topbar; removed `weekNavBtnStyle` constant; restructured `<main>` to flex-column with separate scrollable content area

## How the pieces connect

The `<main>` element is now `display: flex; flex-direction: column; overflow: hidden`. Its first child is `.fit-topbar` (non-scrollable, `flex-shrink: 0`) with a `.fit-topbar-row` that holds the nav, tabs, and actions in a flex row (column on mobile). The second child is a scrollable content div with the original padding — wrapping the existing `{tab === ...}` conditional render blocks.

The CSS classes directly mirror the notes/calendar conventions:
- `.fit-topbar` ↔ `.cal-topbar` / `.notes-topbar`
- `.fit-topbar-nav-btn` ↔ `navBtnStyle` / `.notes-nav-btn`
- `.fit-topbar-today` ↔ calendar's Today button inline style
- `.fit-topbar-title` ↔ `.notes-topbar-title` / calendar's `fontSize: 17, fontWeight: 700`

## How to modify this later

- To adjust topbar padding or border: edit the `.fit-topbar` rule and its `@media (max-width: 720px)` override.
- To change nav button size: edit `.fit-topbar-nav-btn` dimensions.
- To change the Today button: edit `.fit-topbar-today`.
- To alter mobile layout: edit the media query block — the toggle button uses `:first-child` positioning via `.fit-topbar-nav > .fit-topbar-nav-btn:first-child`.
- The Segmented tabs container remains `.fitness-tabs` with a width of 300px.
