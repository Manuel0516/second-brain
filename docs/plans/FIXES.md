# Bug fixes & polish backlog

Tracked during active use. Each fix has reproduction steps and expected behavior.

---

## FIX-1 — Multi-day drag splits resize incorrectly across days

**Observed:** When dragging an event that spans multiple days (e.g., a 3-day event), the split segments on the *previous* day and the *next* day both shrink/grow. Only the segment on the day where the mouse is should resize.

**Expected:** Dragging the bottom edge of a multi-day event should only resize the segment on the day being interacted with. Segments on other days should remain unchanged until the drag completes, then sync.

**Location:** `apps/web/src/modules/calendar/TimeGrid.tsx` — multi-day event resize handling

**Priority:** Medium

---

## FIX-2 — Overlapping events should share the grid column evenly

**Observed:** When two or more events overlap in the time grid, they sometimes take uneven column widths or overlap visually instead of splitting the available width evenly.

**Expected:** Overlapping events should use the same column-splitting algorithm as Google Calendar:
- 2 overlapping events → each takes 50% width
- 3 overlapping events → each takes 33% width
- Events that don't overlap with a given group should use full width
- The algorithm should greedily assign columns using the earliest-start-first approach

**Location:** `apps/web/src/modules/calendar/TimeGrid.tsx` — event positioning / overlap layout

**Priority:** High (visual polish)

---

## FIX-3 — Mobile: long-press to create, swipe to scroll

**Observed:** On mobile (touch devices), tapping and dragging on the time grid both creates selection ranges and scrolls the view. This makes it hard to scroll without accidentally creating events.

**Expected:**
- **Long-press** (hold ≥300ms) on an empty slot → enter create mode (show the selection range)
- **Swipe/drag** without long-press → scroll/navigate through the grid as normal
- On desktop, click-and-drag should still work as before (immediate selection, no delay)
- Implement via a touch-start timer: `touchstart` starts a 300ms timer; if the finger moves before it fires, cancel (it's a scroll). If the timer fires, enter selection mode.

**Location:** `apps/web/src/modules/calendar/TimeGrid.tsx` — touch event handling in day columns

**Priority:** Medium (mobile UX)

---

## FIX-4 — Add a vertical opaque colour line to the right of each event

**Observed:** Events currently show a coloured left border (3px) indicating the calendar category, but have nothing on the right side.

**Expected:** Add a **fully opaque vertical line** to the right edge of each event, using the same colour as the calendar it belongs to (or `color_override` if set). This gives events a more polished, framed look and improves visual balance.
- Line should be the same thickness as the left border (3px)
- Should be opaque (not affected by opacity changes from dimming)
- Should match the event's calendar colour (not the accent colour)
- Only applies to timed events in the week/day grid, not all-day or month events

**Location:** `apps/web/src/styles.css` — `.calendar-event` styles; verify `border-right` addition

**Priority:** Low (visual polish)
