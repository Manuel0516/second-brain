# 0186 — Sidebar content padding compensation

Date: 2026-07-24
Status: accepted

## What changed

Food and Fitness sidebar content now has its horizontal padding in CSS, allowing the right
padding to shrink conditionally when the sidebar scrollbar is present. The sidebar edge
padding was reduced slightly as well.

## Why

The previous adjustment only changed the outer panel padding. The sidebar content wrapper
still kept its full right padding, so the scrollbar compensation was not visually noticeable.

## Files touched

- `apps/web/src/modules/food/Food.tsx` — gives the sidebar content wrapper a scoped class.
- `apps/web/src/modules/fitness/Fitness.tsx` — gives the sidebar content wrapper a scoped class.
- `apps/web/src/styles.css` — defines the shared content padding and smaller overflow-state
  right padding for Food/Fitness.

## How the pieces connect

`SidebarShell` adds `has-scroll` when the panel overflows. The page-scoped content selectors
then reduce both the outer sidebar edge padding and the direct content wrapper's right padding;
non-overflowing sidebars retain the original spacing.

## How to modify this later

Keep the base content padding and overflow-state override together in `styles.css`. If the
sidebar content wrapper structure changes, update the direct-child selectors to preserve the
conditional behavior.
