# 0190 — Stable Food and Fitness sidebar padding

Date: 2026-07-24
Status: accepted

## What changed

Removed asynchronous sidebar overflow detection and made the compact Food/Fitness padding
stable from the first render. The sidebar no longer changes padding when loaded data creates a
scrollbar.

## Why

Food and Fitness sidebar content arrives asynchronously, so detecting overflow after the first
paint caused the right margin to jump even with layout-phase measurement.

## Files touched

- `apps/web/src/components/SidebarShell.tsx` — removes the generic overflow observers and
  post-render `has-scroll` class.
- `apps/web/src/styles.css` — applies the compact sidebar and content padding consistently to
  Food/Fitness while preserving the closed-state reset.

## How the pieces connect

The module-specific compact spacing is now a static layout decision, independent of async
content height. Calendar, Notes, and Settings continue using the shared sidebar defaults.

## How to modify this later

Keep Food/Fitness compact padding stable unless a future layout can reserve the same space
before data loading. Avoid reintroducing post-paint overflow-driven padding changes.
