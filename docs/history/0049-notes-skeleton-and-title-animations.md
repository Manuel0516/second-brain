# 0049 — Notes skeleton loading and title entrance animations

Date: 2026-07-04
Status: accepted

## What changed
- Added `NotesSkeleton` component in `Notes.tsx` — a shimmer skeleton loader shown
  while pages are fetching, with distinct layouts for overview and page-view states.
- Added `springUp` entrance animation to `.notes-page-head` (icon + title row),
  staggered after the page container enters.
- Added `fadeUp` entrance animation to `.notes-breadcrumbs`.
- Added opacity fade transition to `.notes-tree-group-inner` so that collapsing
  tree sections fade their children out instead of just clipping.
- Added staggered `springUp` entrance delays to `.notes-overview-row` list items
  on the front page (matching the settings-page card stagger pattern).
- Changed heading-toggle animation from CSS `@keyframes` to Web Animations API
  (`element.animate()`), fixing a bug where CSS animations would not trigger on
  elements that went from `display:none` to visible in the same frame.
- Added collapse animation: blocks now slide up under their heading
  (`translateY(0)` → `-10px` + fade) before being hidden, instead of vanishing
  instantly.
- Both expand and collapse now use a slower 420ms duration with Expo-out easing.
- Added `@media (prefers-reduced-motion: reduce)` overrides for all new animations.

## Why
The notes module had no skeleton loading — just a "Loading…" text — and the page
title and overview list appeared instantly with no motion, feeling dead compared
to the settings and calendar pages which use `springUp` / `fadeUp` entrances.
The heading toggle used `fadeUp` which moved content upward; a downward
slide-out-from-under feels more natural for content emerging beneath a heading.

## Files touched
- `apps/web/src/modules/notes/Notes.tsx` — added `NotesSkeleton` component and
  wired it into the render when `loading` is true (picking overview vs page layout
  based on whether a `pageId` URL param is present).
- `apps/web/src/modules/notes/notes.css` — added `springUp` to `.notes-page-head`,
  `fadeUp` to `.notes-breadcrumbs`, opacity transition to `.notes-tree-group-inner`,
  staggered `--enter-delay` for `.notes-overview-row` children, skeleton layout
  classes (`.notes-skeleton-overview`, `.notes-skeleton-page`),
  `@keyframes headingExpand`, and reduced-motion overrides.
- `apps/web/src/modules/notes/editor/CollapsibleHeading.ts` — replaced CSS
  `@keyframes` / decoration-class approach with Web Animations API
  (`animateExpand`). Added `blocksAfterHeading` DOM walker (finds heading via
  `button.closest('h1,h2,h3')`). Added `collapseAnimKey` plugin state that
  prevents `display:none` while a collapse animation plays. Removed old
  `sectionRangeFor`, `toggleAnimKey`, `animateCollapse`, and
  `notes-heading-opening` decoration. Both directions animate at 600ms.
  Guarded `element.animate()` calls for jsdom (test environment).

## How the pieces connect
- `NotesSkeleton` follows the same pattern as `SettingsSkeleton` in
  `SettingsLayout.tsx`: `.skeleton` class from `styles.css` for the pulse shimmer.
- The overview skeleton shows 5 row-shaped placeholders; the page skeleton shows a
  breadcrumb placeholder, icon + title row placeholders, and content line blocks.
- The skeleton is inserted in the ternary chain before `selected ?` so loading
  takes priority over both the selected page and the overview.
- Skeleton CSS classes are scoped under `.notes-skeleton-overview` and
  `.notes-skeleton-page` — no global style pollution.

## How to modify this later
- To change skeleton appearance: edit `NotesSkeleton` in `Notes.tsx`. The
  `.skeleton` class is defined globally in `styles.css` (line ~310).
- To adjust stagger timing: the `--enter-delay` values on `.notes-overview-list > li:nth-child(...)`.
- To add a skeleton variant for a new state: add a `type` option to `NotesSkeleton`
  and a matching CSS class block in `notes.css`.
- To change heading toggle duration: edit `TOGGLE_DURATION_MS` in
  `CollapsibleHeading.ts` (currently 420ms).
