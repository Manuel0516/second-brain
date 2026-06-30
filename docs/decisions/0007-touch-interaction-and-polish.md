# ADR 0007 — Touch interaction redesign, gesture engine, and visual polish

Status: **accepted**
Date: 2026-06-30

## Context

After the initial calendar implementation (ADR 0004, ADR 0005, ADR 0006) a
set of bug fixes and mobile interaction improvements were tracked as
implementation plans in `docs/plans/`. This ADR consolidates all of them into
a single record and supersedes the individual plan files.

Three categories of work were addressed:

1. **Visual polish** — event identity (calendar colour dot), time-display
   overflow, overlap-algorithm replacement.
2. **Interaction fixes** — multi-day drag resize scoped to the active day
   segment.
3. **Mobile touch redesign** — full state machine replacing ad-hoc touch
   stubs, replacing long-press with double-tap, adding pull-down-to-close on
   the event editor.

---

## 1. Calendar identity colour dot

### Problem

Events had their own colour and a left border matching the calendar colour,
but no clear visual indicator of which calendar an event belonged to. A
previous right-edge gradient was too subtle and tied event colour to calendar
colour incorrectly.

### Decision

Replace the `::after` right-edge gradient with a `::before` pseudo-element
that renders a small colour dot (10 px × 10 px, rounded, positioned at the
top-left of the event chip) using the `--cal-color` CSS custom property.

**Key properties (final implementation):**

- Element: `::before` pseudo-element, `pointer-events: none`
- Position: absolute, top-left corner of the event chip
- Size: 10 px × 10 px, `border-radius: 2px`
- Colour: `var(--cal-color)` — injected inline on each `<button>`
- Responsive: hidden in `compact`, `compact-short`, `solo`, and `tiny` size
  variants; visible in normal mode
- Past events: opacity reduced via `opacity: 0.5`
- Selected state: hidden (solid fill replaces need)

**Files:** `apps/web/src/styles.css` only — no JS changes. The `--cal-color`
property was already injected inline on each event `<button>` from a prior
change.

---

## 2. Time-display overflow

### Problem

The time-range text (e.g. `10:00–11:00`) in event chips could overflow the
chip bounds on narrow columns, creating visual clipping or line wrapping.

### Decision

Wrap the time `<span>` in a container with `overflow: clip` and
`white-space: nowrap`. The simplest approach: a plain `<span>` with
`overflow: clip` as an inline style — no new classes or wrappers.

**Files:** `apps/web/src/modules/calendar/TimeGrid.tsx` — apply
`style={{ overflow: 'clip' }}` on the time `<span>`.

---

## 3. Overlap algorithm — Google Calendar greedy columns

### Problem

The original overlap layout function assigned uneven widths to overlapping
events, sometimes rendering them on top of each other instead of splitting the
column width evenly.

### Decision

Replace the overlap-layout function with a Google-Calendar-style greedy column
assignment algorithm:

1. Sort events by start time (ties broken by longest duration first).
2. Group events that intersect into overlap groups. Events that don't overlap
   with anything get full width (100 %, left = 0).
3. Within each overlap group, greedily assign each event to the first column
   slot where it doesn't overlap with the last event in that slot.
4. `groupMax =` the maximum column index used by any event in the group.
5. Each event: `width = 1 / groupMax`, `left = col / groupMax`.

The function `overlapOffsets()` returns a `Map<eventKey, { left, width, col }>`
and is called once per day column during render.

**Files:** `apps/web/src/modules/calendar/TimeGrid.tsx` — `overlapOffsets()`
function.

---

## 4. Multi-day drag resize — scope to active segment

### Problem

When resizing a multi-day event by dragging its bottom-edge handle, all split
segments (previous day, current day, next day) changed height simultaneously.
Only the segment on the day being dragged should resize during the gesture.

### Decision

Add a `resizingDay` state (string — the `toDateString()` of the active column).
Set it on `pointerdown` of a resize handle, clear on `pointerup`.

During render, the `height` style of each segment is conditionally adjusted:
only the segment whose day matches `resizingDay` gets the `gesture.rawY`
offset added to its height. Other segments render at their original computed
height.

On `pointerup` the full recalculation (persist to API) runs with the final
total duration, and `resizingDay` is cleared.

**Files:** `apps/web/src/modules/calendar/TimeGrid.tsx` — `resizingDay` state,
`setResizingDay`/`setResizingDay(null)` in resize handlers, conditional height
in JSX.

---

## 5. Mobile touch state machine

### Problem

The original touch handling used scattered refs (`touchTimerRef`,
`touchMovedRef`) and `if (pointerType === 'touch')` guards inside the desktop
selection handlers (`startNewSelection`, `moveNewSelection`,
`finishNewSelection`). This made the code fragile and prevented supporting
gestures beyond simple tap-and-drag.

### Decision

Implement a unified `TouchState` discriminated-union type and a single
`touchStateRef` that tracks the current gesture phase:

```ts
type TouchState =
  | { phase: 'idle' }
  | { phase: 'pending';  x, y, pointerId, target, event? }
  | { phase: 'swipe';    startX, deltaX, pointerId }
  | { phase: 'pinch';    ids, pts, baseHeight, baseDist }
  | { phase: 'scroll';   pointerId }
```

Three handler functions (`onTouchPointerDown`, `onTouchPointerMove`,
`onTouchPointerUp`) contain all touch logic. The day-column
`onPointerDown/Move/Up/Cancel` dispatch to touch handlers when
`e.pointerType === 'touch'`, and to the existing desktop handlers otherwise.

### State transitions

```
idle → pending          (first finger down)
pending → swipe         (horizontal movement > 8 px)
pending → scroll        (vertical movement > 8 px)
pending/swipe/scroll → pinch  (second finger arrives)
pending → idle          (finger lifts before timeout)
swipe → idle            (finger lifts; commit if delta ≥ 50 px)
pinch → scroll          (one finger lifts, other remains)
pinch → idle            (all fingers lift)
scroll → idle           (finger lifts)
```

### Gesture-to-action mapping

| Gesture | Action |
|---|---|
| One-finger vertical slide | Native scroll (browser handles via `touch-action: pan-y`) |
| One-finger horizontal swipe (≥50 px) | Navigate ±1 day (`onHorizontalNavigate`) |
| Pinch (two fingers) | Scale row height (`onRowHeightChange`), clamped 40–120 px |
| Short tap | Nothing |
| Long-press (originally 1 s) | **Replaced by double-tap** (see below) |

### Pinch zoom

When a second pointer is detected, the handler immediately sets
`touch-action: none` on the column element to take control from the browser.
On release, `touch-action` is restored to `pan-y`. The pinch calculates a
distance ratio from the initial two-finger baseline and applies it to the
current `rowHeight`.

### Touch-action CSS

```css
.day-column {
  touch-action: pan-y;   /* was none — allows vertical scroll */
}
```

---

## 6. Double-tap replaces long-press

### Problem

During testing, the 1-second long-press to create/edit was too slow and had a
500 ms visual feedback that didn't feel responsive. More critically,
long-press competes with the browser's own long-press context menu on some
devices.

### Decision

Replace the long-press timer with a double-tap detector. A `lastTapRef`
tracks the most recent tap's `timeStamp`, position (x, y), and target type
(`'grid' | 'event'`).

**Double-tap parameters:**
- Window: 300 ms between taps
- Distance tolerance: 30 px from first tap position
- Target must match (grid or event)

On a valid double-tap:
- **Grid double-tap** → `onCreate()` at the tapped minute
- **Event double-tap** → `onEdit(event)` opens the event editor

### Removal

- `timer` field removed from the `pending` `TouchState` variant
- 1-second long-press `setTimeout` removed from `onTouchPointerDown`
- 500 ms visual feedback `setTimeout` removed
- `.long-press-active` CSS class and its styles removed
- `clearTimeout(timer)` calls removed from move, pinch, and cancel handlers

### Event-editor close guard

The double-tap introduced a race: the second tap's `pointerup` fires
`onEdit(event)`, React mounts the EventEditor, then the browser synthesises a
`mousedown` event from the same touch point — hitting the now-visible backdrop
and closing the editor instantly.

**Fix:** Add a `mountedAt` ref in `EventEditor` that records
`performance.now()` on mount. The backdrop's `onMouseDown` handler includes a
guard: only close if `e.timeStamp - mountedAt.current > 300 ms`.

---

## 7. Event-editor pull-down-to-close gesture

### Problem

On mobile, the event editor panel had no way to dismiss it via gesture — the
user had to tap the small X button or the backdrop. A swipe-down gesture is
standard on mobile sheets.

### Decision

Add a grabber bar at the top of the editor panel that implements a
pull-down-to-close gesture.

**Implementation:**

- **Grabber element** — a 28 px-tall sticky `<div className="editor-grabber">`
  at the top of the `<aside>` with a centred 32×4 px handle
  (`editor-grabber-handle`). Only responds to touch
  (`e.pointerType !== 'touch'` returns early).
- **Drag tracking** — `isDragging` state + `dragY` state + `dragYRef` ref +
  `dragStartRef` ref. Pointer capture on the grabber.
- **Visual feedback** — the editor content (`editor-drag-wrap` div) is
  translated downward via `transform: translateY(${dragY}px)`. The backdrop
  opacity fades linearly (`1 - dragY / 200`) as the user drags.
- **Threshold** — if `dragY > 80 px` on release, `closeImmediate()` is called
  (closes instantly without the slide-right `editorOut` animation — the panel
  has already been dragged down, so a rightward slide would look wrong).
  Otherwise, the panel snaps back with a 350 ms spring-like transition.
- **Transition control** — the `editor-drag-wrap` has a CSS transition for
  smooth snap-back. During active drag the `.no-transition` class disables it
  so the panel follows the finger without delay.

**CSS additions:**
- `.editor-grabber` — `position: sticky; top: 0; z-index: 3; touch-action: none`
- `.editor-grabber-handle` — 32×4 px rounded bar
- `.editor-drag-wrap` — `transition: transform 0.35s cubic-bezier(0.22,1,0.36,1)`
- `.editor-drag-wrap.no-transition` — `transition: none`
- Respects `prefers-reduced-motion`

---

## 8. Resize handle disabled on mobile

### Problem

The bottom-edge resize handle on event chips (used to change event duration by
dragging) was impractical on touch devices. The handle is small, and
accidental touches during scrolling triggered unwanted resize mode.

### Decision

Add a touch guard at the top of the resize handle's `onPointerDown`:

```ts
if (pointer.pointerType === 'touch') return
```

This makes the resize handle inert on touch devices. Desktop/mouse users are
unaffected — the handle continues to work with `pointerType === 'mouse'`.

---

## Files changed

| File | Changes |
|---|---|
| `apps/web/src/modules/calendar/TimeGrid.tsx` | `overlapOffsets()` algorithm, `resizingDay` state, touch state machine (`TouchState`, handlers), double-tap detection, time-display overflow clip, day-column touch dispatch, event-chip touch dispatch, resize handle touch guard |
| `apps/web/src/modules/calendar/EventEditor.tsx` | Pull-down grabber + drag handlers, `closeImmediate()` (skips `editorOut` on grabber close), `mountedAt` close guard |
| `apps/web/src/styles.css` | `.day-column` `touch-action: pan-y`, calendar colour `::before` dot, `editor-grabber`/`editor-grabber-handle`/`editor-drag-wrap` styles, removed `long-press-active` styles |

---

## Superseded documents

The following plan files in `docs/plans/` are superseded by this ADR and have
been removed:

- `FIXES.md` — bug-fix backlog (multi-day drag, overlap, mobile, colour dot)
- `FIXES_PLAN.md` — implementation plan for FIX-1 through FIX-4
- `FIX-4-EVENT-CALENDAR-COLOR.md` — revised calendar colour glow approach
  (replaced by simpler dot)
- `MOBILE-TOUCH-PLAN.md` — original touch state machine design (long-press
  variant)

---

## Future considerations

- **Swipe visual feedback** — the horizontal swipe gesture currently commits
  on pointer-up without animating the grid translation. A future enhancement
  could translate the grid proportionally during the gesture.
- **Event-editor drag threshold** — the 80 px close threshold can be adjusted
  based on user testing.
- **Desktop event drag** — the desktop `startEventGesture`/`moveEventGesture`
  could be unified with the touch state machine for a single code path.
