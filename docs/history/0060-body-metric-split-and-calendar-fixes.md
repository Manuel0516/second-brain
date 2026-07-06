# 0060 — BodyMetricLog split + Calendar/Notes topbar redesign + exercise buttons center

Date: 2026-07-05
Status: accepted

## What changed

- **BodyMetricLog split**: Extracted the quick-log form into a new `BodyMetricForm`
  component (`apps/web/src/modules/fitness/BodyMetricForm.tsx`). The original
  `BodyMetricLog` now shows only the history list (recent entries + delete + show
  all). `BodyMetricForm` takes an `onSaved` callback and is wrapped in a
  `fitness-section` with a "Log Body Metrics" section heading.

- **Fitness.tsx**: Added `<BodyMetricForm onSaved={loadWeek} />` to the Stats tab
  (after GoalsSection). The History tab still shows `<BodyMetricLog />` (now
  history-only). Also centered exercise stat buttons on mobile via
  `justifyContent: isMobile ? 'center' : undefined`.

- **Calendar.tsx**: Redesigned the +New event button into a compact 34×34 + icon
  pinned absolute top-right (`position: absolute; top/right`). Removed the text
  label and `cal-new-event` class. Topbar now has `position: relative`. The left
  group (nav + view pills) fills the full width naturally.

- **Notes.tsx**: Same treatment — +New page is now a compact 34×34 + icon pinned
  absolute top-right. Removed `cal-new-event notes-new-page` classes. Topbar has
  `position: relative` on both mobile and desktop.

## Why

User wanted: 1) body-metric logging form on Stats tab with a section title;
2) exercise buttons centered on mobile; 3) both Calendar and Notes + buttons
as compact icons at the top-right corner, creating a clean symmetric layout:
`[☰]  TITLE  [+]`.

## Files touched

- `apps/web/src/modules/fitness/BodyMetricForm.tsx` — new file + section heading
- `apps/web/src/modules/fitness/BodyMetricLog.tsx` — history-only (removed form)
- `apps/web/src/modules/fitness/Fitness.tsx` — imports, Stats tab placement, mobile centering
- `apps/web/src/pages/Calendar.tsx` — + icon absolute top-right, topbar `position: relative`
- `apps/web/src/modules/notes/Notes.tsx` — + icon absolute top-right, topbar `position: relative`

## How the pieces connect

The + buttons use `position: absolute` inside their respective topbar containers
(which have `position: relative`). This puts them at the top-right corner without
affecting the flex layout. On both mobile and desktop, the toggle sits at
absolute-left, the title is centered, and the + sits at absolute-right — creating
a balanced header.

`CreatePageMenu` in Notes still works because the button retains its `ref={newPageRef}`
and `aria-expanded` — only the visual styling changed.

## How to modify this later

- To change the + icon size or position: adjust the `top`, `right`, `width`,
  `height` values in each button's style block. Calendar and Notes are separate
  so they can have different positions.
- To bring back labeled buttons: restore the `<span>` text, `className`, and
  remove the absolute positioning + relative container.
