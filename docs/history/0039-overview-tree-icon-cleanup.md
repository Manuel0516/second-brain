# 0039 — Notes overview tree: icon cleanup and folder icon

Date: 2026-07-04
Status: accepted

## What changed

- **Notes overview tree** (`Notes.tsx`): Removed the fallback document SVG icon from each row — if a page has no icon, nothing is shown.
- Added the sidebar's folder SVG icon for pages with `type: 'folder'` so folders are distinguishable in the overview tree without needing a custom emoji.

## Why

The user noticed the empty document icon was visual noise on the main notes page — it served no purpose when a note has no emoji set. Folders were indistinguishable from regular pages without an icon, so the same folder SVG used in the sidebar was added as a fallback for folders.

## Files touched

- `apps/web/src/modules/notes/Notes.tsx` — `OverviewTree` component: changed the icon column to only render when `page.icon` is set (showing the emoji) or `page.type === 'folder'` (showing the sidebar's folder SVG). Nothing is rendered for regular pages without an icon.

## How the pieces connect

The `OverviewTree` component renders the top-level notes page listing. Each row optionally shows an icon column. Previously it always rendered a document SVG fallback. Now it shows nothing for iconless pages (cleaner look) and the folder SVG for folders (easier to spot in the tree).

## How to modify this later

Find `OverviewTree` in `apps/web/src/modules/notes/Notes.tsx` and adjust the icon rendering logic inside the `<button>` row. The sidebar's folder icon is in `apps/web/src/modules/notes/Sidebar.tsx` around line 435 if the SVG needs updating.
