# 0185 — Conditional Food and Fitness sidebar padding

Date: 2026-07-24
Status: accepted

## What changed

Food and Fitness sidebar right padding is reduced only while the sidebar content actually
overflows and a scrollbar is needed.

## Why

The thin scrollbar still occupied a small amount of horizontal space when present. Reducing
the right padding only in the overflow state keeps content balanced without changing panels
that do not need scrolling.

## Files touched

- `apps/web/src/components/SidebarShell.tsx` — observes sidebar size/content changes and adds
  a `has-scroll` class when content height exceeds the viewport.
- `apps/web/src/styles.css` — applies the smaller right padding only to overflowing Food and
  Fitness sidebars.

## How the pieces connect

`SidebarShell` measures its scroll container with animation-frame scheduling, a resize
observer, and a mutation observer. The resulting state class is page-scoped in CSS, so shared
Calendar and Notes sidebars keep their existing padding.

## How to modify this later

Keep overflow detection in `SidebarShell` so every sidebar gets accurate state. Scope visual
adjustments with the page class if only one module should change, and preserve the closed-state
padding reset.
