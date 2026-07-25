# 0202 — Prevent mobile auto-zoom on form focus

Date: 2026-07-25
Status: accepted

## What changed
Added a single global rule so tapping any input, textarea, or select on a
touch device no longer triggers the browser's auto-zoom.

## Why
User-reported: on mobile, focusing any text/number field (titles, quantities,
set values, etc.) anywhere in the app zoomed the page in. iOS Safari (and
some other mobile browsers) auto-zoom on focus whenever the focused form
control's computed font-size is under 16px — and many of this app's inputs
are intentionally styled smaller than that for desktop density (e.g.
`.fit-live-cell input` at 14px, various 12–13px fields across notes/food/
fitness).

## Files touched
- `apps/web/src/styles.css` — added an `@media (pointer: coarse)` block
  forcing `font-size: 16px !important` on `input`, `textarea`, `select`.
  `pointer: coarse` scopes this to touch-primary devices only, so desktop
  (mouse/trackpad) sizing is untouched. `!important` is used deliberately
  here: dozens of per-component font-size rules are scattered across
  `styles.css`, `notes.css`, `food.css`, `fitness.css`, and
  `ShareManager.css`, and a single override point is simpler than patching
  each one individually.

## How the pieces connect
This rule sits next to the existing global `button, input, textarea { font:
inherit }` base rule in `styles.css`, which is loaded on every page. It runs
after all module stylesheets in the cascade but wins on `!important` alone,
so load order doesn't matter.

## How to modify this later
If a specific input needs to stay below 16px even on touch devices (unlikely
— it would reintroduce the zoom), scope an exception with a more specific
selector plus its own `!important`. Don't remove the `pointer: coarse` guard
or apply this without it — that would force 16px on desktop too, where many
fields are deliberately smaller for density.
