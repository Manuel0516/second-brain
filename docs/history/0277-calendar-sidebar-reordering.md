# 0277 — Calendar sidebar reordering

Date: 2026-11-21
Status: accepted

## What changed

The calendar options button centers its three dots independently of font metrics. Dragging the button moves its calendar once the pointer crosses a short movement threshold. Clicking still opens the options menu, and the order is saved in the same browser preference as before.

## Why

The ellipsis glyph sat below the center of the button. The reorder gesture canceled movement before its long-press timer fired, so a normal drag did nothing.

## Files touched

- `apps/web/src/modules/calendar/Sidebar.tsx` — starts reordering on pointer movement and transfers pointer capture to the calendar list.
- `apps/web/src/styles.css` — centers the calendar options dots and reserves touch gestures on the options button for reordering.
- `apps/web/src/modules/calendar/Sidebar.test.tsx` — exercises immediate dragging, ordinary menu clicks, and saved order.

## How the pieces connect

The options button captures the pointer on press. When movement crosses the threshold, the calendar list takes capture so events keep arriving as the dragged row moves in the DOM. Dragging updates the rendered order and its local storage entry. Keyboard reordering still uses the same entry.

## How to modify this later

Adjust the movement threshold in `moveReorder` in the calendar sidebar. Keep capture on the list once dragging starts, and update the interaction test if the gesture or order persistence changes. The menu dots and touch behavior are scoped to the calendar list and its button.
