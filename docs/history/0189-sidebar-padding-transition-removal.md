# 0189 — Sidebar padding transition removal

Date: 2026-07-24
Status: accepted

## What changed

Food and Fitness sidebar transitions no longer animate padding. Width, opacity, and transform
still transition normally, while scrollbar compensation padding applies immediately.

## Why

Even with pre-paint overflow measurement, the shared padding transition animated the compact
right edge separately from the sidebar entrance, creating a visible two-step load.

## Files touched

- `apps/web/src/styles.css` — override Food/Fitness sidebar transitions to exclude padding.

## How the pieces connect

The `has-scroll` class still controls conditional padding. Its page-scoped transition override
ensures that only the sidebar’s movement and opacity animate; the content edge is stable from
the first visible frame.

## How to modify this later

Keep padding out of the Food/Fitness sidebar transition list unless the overflow state is
intentionally meant to animate. The shared base transition remains available to other pages.
