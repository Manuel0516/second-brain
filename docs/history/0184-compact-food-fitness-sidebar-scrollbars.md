# 0184 — Compact Food and Fitness sidebar scrollbars

Date: 2026-07-24
Status: accepted

## What changed

Food and Fitness sidebars now use a thin native scrollbar treatment, with a 2px WebKit
scrollbar and the browser's thin scrollbar mode elsewhere.

## Why

Their content-heavy left panels showed a visually heavy scrollbar that consumed more apparent
space than the Calendar and Notes navigation panels.

## Files touched

- `apps/web/src/styles.css` — scope compact scrollbar sizing and tokenized thumb colors to
  Food and Fitness sidebar panels.

## How the pieces connect

The existing shared `.app-sidebar` still owns panel sizing and scrolling. Page-scoped rules
only change scrollbar rendering for `.food-page` and `.fitness-page`, leaving the panel width,
content flow, and Calendar/Notes treatment untouched.

## How to modify this later

Adjust the scoped selectors beside `.app-sidebar` in `styles.css`. Keep the Firefox
`scrollbar-width` rule and WebKit width together so the experience remains consistent across
browsers.
