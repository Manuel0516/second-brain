# Plan C — Bug fixes & polish

> Audience: implementing AI or developer. Execute tasks in priority order.
> Run `npm run check` after each fix before moving to the next.
> All changes are in `apps/web/src/modules/calendar/TimeGrid.tsx` unless noted.

---

## FIX-1 — Multi-day drag resize: only resize the active day segment

**Priority:** Medium

### Problem

When resizing a multi-day event by dragging its bottom edge, all segments
(previous day, current day, next day) change size simultaneously. Only the
segment on the day being dragged should resize during the drag; other segments
should stay frozen until the drag completes.

### Root cause

The resize handler recomputes the event's total duration and redistributes it
across all segments. It should instead clamp the resize to the active column
only and defer full recalculation to `mouseup`/`pointerup`.

### Fix

1. Add a `resizingSegmentDate` ref that is set to the column's date on
   `pointerdown` of a resize handle.
2. In the `pointermove` handler, compute the new segment end time only for the
   column whose date matches `resizingSegmentDate`. All other segments render
   their original `splitEnd` time unchanged.
3. On `pointerup`, fire the existing full-recalculation / persist logic with
   the final duration.

**Files:** `TimeGrid.tsx` (resize `pointerdown`, `pointermove`, `pointerup` handlers)

---

## FIX-2 — Overlapping events: even column splitting

**Priority:** High

### Problem

Overlapping events take uneven widths or render on top of each other instead
of sharing the available column width evenly.

### Algorithm (Google Calendar approach)

```
1. Sort events by start time (ties broken by longest duration first).
2. Greedily assign each event to the first column slot it fits (no overlap
   with the event already in that slot).
3. group_width = max column index used by any event in an overlapping group + 1
4. Each event: width = 1 / group_width, left = column_index / group_width
5. Events that belong to no overlapping group: width = 100%, left = 0.
```

### Fix

Replace the existing overlap-layout function (or add one if absent) with the
algorithm above. Return `{ left: string; width: string }` per event.
Apply the returned style in the event render. No new dependency needed — pure
array manipulation.

**Files:** `TimeGrid.tsx` — extract/replace overlap layout logic;
optionally move to `apps/web/src/modules/calendar/overlapLayout.ts` if the
function exceeds ~40 lines.

---

## FIX-3 — Mobile: long-press to create, swipe to scroll

**Priority:** Medium

### Problem

On touch devices, dragging on the grid both creates selection ranges and
scrolls, making it hard to scroll without starting an event creation.

### Fix

Implement a 300 ms long-press gate on `touchstart`:

```ts
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let touchMoved = false;

onTouchStart(e) {
  touchMoved = false;
  longPressTimer = setTimeout(() => {
    if (!touchMoved) enterSelectionMode(e);
  }, 300);
}

onTouchMove(e) {
  touchMoved = true;
  clearTimeout(longPressTimer!);
  // browser handles scroll
}

onTouchEnd() {
  clearTimeout(longPressTimer!);
}
```

Desktop `mousedown` / `mousemove` path is unchanged — immediate selection, no
delay.

**Files:** `TimeGrid.tsx` — day column touch event handlers

---

## FIX-4 — Right-edge opaque colour line on timed events

**Priority:** Low

### Problem

Events have a 3 px coloured left border but nothing on the right, giving an
unbalanced look.

### Fix

Add `border-right: 3px solid var(--event-color)` to `.calendar-event` in
`styles.css`. The right border should use the same CSS custom property as the
left border and must not be dimmed by any opacity rule applied to the event body.

If the event body has an `opacity` rule for past-event dimming, add the right
border to a `::after` pseudo-element positioned at the right edge so it stays
fully opaque:

```css
.calendar-event::after {
  content: '';
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 3px;
  background: var(--event-color);
  opacity: 1; /* explicit, not inherited */
}
```

**Files:** `apps/web/src/styles.css`

---

## Verification checklist

- [ ] FIX-2: Create 2 and 3 overlapping events; verify equal widths and no
      visual overlap.
- [ ] FIX-1: Resize a 3-day event; only the active day's segment changes height
      during drag.
- [ ] FIX-3: On a touch device (or DevTools mobile emulation), swipe scrolls
      the grid; a 300 ms hold enters selection mode.
- [ ] FIX-4: Events show a right-edge line matching the left border colour; past
      events dimmed by opacity do not dim the right line.
- [ ] `npm run check` passes with no new type or lint errors.
