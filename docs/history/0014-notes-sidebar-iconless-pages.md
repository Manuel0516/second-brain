# 0014 — Notes sidebar iconless pages

Date: 2026-07-02
Status: accepted

## What changed

Notes sidebar rows no longer render a placeholder square when a page has no emoji icon.
The title moves into the released space automatically.

## Why

The fallback square looked like a broken or undefined emoji and added unnecessary space
before iconless page titles.

## Files touched

- `apps/web/src/modules/notes/Sidebar.tsx` — renders the icon element only when the page
  has an icon.

## How the pieces connect

`Sidebar` renders each page as a flex title button. Because the icon element is now
conditional, the existing flex gap applies only to rows that actually have an icon.

## How to modify this later

Change the conditional `page.icon` block in `Sidebar.tsx` if a deliberate page-type icon
is introduced later. Do not restore a placeholder solely to reserve spacing.
