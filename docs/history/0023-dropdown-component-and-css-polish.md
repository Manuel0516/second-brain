# 0023 — Dropdown component and CSS polish

Date: 2026-07-02
Status: accepted

## What changed

- Created a shared `Dropdown` component (`src/components/Dropdown.tsx`) replacing all 9 native
  `<select>` elements across the notes and calendar modules with styled trigger + portalled
  popover UI.
- Fixed popover clipping in the sidebar context menu (`.calendar-menu`) and cover picker
  (`.notes-cover-picker`) with viewport-aware sizing.
- Centered the block drag handle vertically within each block's height.

## Why

Native `<select>` elements looked inconsistent with the project's custom UI language. The
Dropdown component provides consistent styling, keyboard navigation, viewport-edge overflow
protection, and the same popIn animation used by other popovers.

## Files touched

- `apps/web/src/components/Dropdown.tsx` — new shared component
- `apps/web/src/modules/notes/Sidebar.tsx` — replaced page-type native select with Dropdown
- `apps/web/src/modules/notes/database/PropertyConfig.tsx` — replaced property-type select
- `apps/web/src/modules/notes/database/PropertyCell.tsx` — replaced select-cell select
- `apps/web/src/modules/notes/database/CalendarView.tsx` — replaced date-property select
- `apps/web/src/modules/notes/database/BoardView.tsx` — replaced group-by select
- `apps/web/src/modules/calendar/EventEditor.tsx` — replaced finance/meal/reminder/frequency selects
- `apps/web/src/styles.css` — `.calendar-menu` max-width fix
- `apps/web/src/modules/notes/notes.css` — cover-picker max-width, block-gutter centering

## How the pieces connect

The `Dropdown` component is used wherever a `<select>` was previously rendered. It follows
the same pattern as `Segmented` and other form components in `src/components/`. The portalled
popover uses `createPortal` to avoid clipping by parent overflow boundaries, with viewport-aware
positioning that flips when near screen edges.

## How to modify this later

- Add `disabled` prop and loading state if needed for async option lists.
- Add multi-select mode (`DropdownMulti`) when a use case arises.
- Options can be dynamic arrays — the component re-renders on prop changes.
