# 0187 — Sidebar padding animation timing

Date: 2026-07-24
Status: accepted

## What changed

Sidebar overflow is now measured in a layout effect before the first paint, so Food and
Fitness apply their conditional compact padding before the sidebar entrance animation begins.

## Why

The previous post-paint measurement added the `has-scroll` class after the entrance animation
started, making the Fitness sidebar appear to shift in a visible second step.

## Files touched

- `apps/web/src/components/SidebarShell.tsx` — use a layout-phase initial overflow measurement
  while retaining scheduled observer updates for later content changes.

## How the pieces connect

`SidebarShell` determines the initial scrollbar state synchronously before paint, then its
resize and mutation observers continue to schedule measurements as the sidebar changes. The
existing page-scoped CSS can therefore apply compact padding without a post-animation jump.

## How to modify this later

Keep the initial measurement in `useLayoutEffect`; only observer-driven recalculations should
be deferred with animation-frame scheduling to avoid forcing repeated layout work.
