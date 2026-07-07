# 0142 — Fix: logged meal meta text overflow on mobile

Date: 2026-07-07
Status: accepted

## What changed
Added mobile CSS overrides for `.food-planned-meta` and `.food-planned-info` in `food.css` so that the long nutrition summary text in logged meal cards can wrap on narrow phone screens instead of overflowing the card.

## Why
On the Food module overview page, logged meal cards show a meta line like "450 kcal · 30g P · 50g C · 20g F · Mon, Jul 7, 12:30 PM". The `.food-planned-meta` class had `white-space: nowrap`, which prevented this text from wrapping on narrow viewports, causing it to overflow the card boundary.

## Files touched
- `apps/web/src/modules/food/food.css` — added mobile (≤720px) overrides:
  - `.food-planned-info { min-width: 0 }` — ensures the info container can shrink below its content width
  - `.food-planned-meta { white-space: normal; overflow-wrap: break-word; word-break: break-word }` — allows the long meta string to wrap across multiple lines

## How the pieces connect
The logged meals section (Overview.tsx lines 288–313) reuses the `.food-planned-card` / `.food-planned-info` / `.food-planned-meta` class structure from planned meal cards. On mobile, `.food-planned-card` already switched to `flex-direction: column; align-items: stretch` (line 1058–1061), but `.food-planned-meta` still forced single-line rendering. The new overrides let the meta text break naturally across lines within the card's available width.

## How to modify this later
To adjust mobile breakpoint or wrapping behavior, find the `@media (max-width: 720px)` block at the bottom of `food.css`. The `.food-planned-meta` and `.food-planned-info` overrides are grouped with the existing `.food-planned-card` mobile rules. If the meta text needs different formatting (e.g. separate lines for macros vs date), modify the JSX in `Overview.tsx` instead.
