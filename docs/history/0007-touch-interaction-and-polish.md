# ADR 0007 — Touch interaction redesign, gesture engine, and visual polish

Status: **accepted**
Date: 2026-06-30

## Context

After the initial calendar implementation (ADR 0004, ADR 0005, ADR 0006) a
set of bug fixes and mobile interaction improvements were tracked as
implementation plans in `docs/work/plans/`. This ADR consolidates all of them into
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

## 9. Calendar sidebar — long-press drag to reorder

### Problem

Calendars in the sidebar had a fixed order with no way to rearrange them. An
initial drag attempt behaved poorly: only the held row received a `translateY`
while the other rows stayed put, and the drop position was guessed on release
from `round(delta / rowHeight)`. With no live feedback and fragile drop math,
the drag felt broken.

The desired interaction is a **dual action on the same `⋯` options button**:

- **Single click** → open the calendar's options menu (rename / colour / delete)
- **Long-press, then drag** → reorder the calendar into a preferred order

### Decision

Keep the long-press gate but rewrite the drag itself to **reorder live**.

**Activation (`startReorder`):**
- `pointerdown` on the `⋯` button captures the pointer and starts a
  `LONG_PRESS_DELAY` timer (set to **375 ms** after testing — 650 ms felt
  sluggish).
- Any pointer movement greater than 8 px before the timer fires cancels the
  drag — that movement is a scroll, and a subsequent `click` still opens the
  menu.
- When the timer fires, the drag becomes `active`, the options menu is closed,
  `suppressMenuClickRef` is set so the trailing `click` does not reopen the
  menu, and the row gains the `.reordering` lifted style.

**Live reordering (`moveReorder`):**
- The target index is computed **directly** from how far the finger has
  travelled: `toIndex = clamp(homeIndex + round(rawOffset / rowHeight))`, where
  `homeIndex` is the row's index captured at drag start.
- When `toIndex` differs from the row's current index, the order array is
  spliced and committed in a single `setCalendarOrder`, then persisted to
  `localStorage`. Other rows shift under the finger immediately — real feedback.
- The lifted row is **re-anchored** under the finger via
  `residual = rawOffset − (toIndex − homeIndex) × rowHeight`, so it tracks the
  finger instead of flying off with the raw delta.
- This single-update, direct-index approach avoids stale-closure bugs from
  incremental per-swap state updates and handles large/fast moves correctly.

**Drop (`finishReorder`):** order is already committed live, so the handler
just clears drag state.

### Details

- `ROW_GAP = 2` constant mirrors the `.calendar-list { gap }` so the per-row
  pitch (`rowHeight = measuredHeight + ROW_GAP`) matches the rendered layout and
  the re-anchoring does not drift.
- Order persists client-side only in `localStorage` under
  `sb-calendar-order` (no backend `position` column added — not needed yet).
  `orderedCalendars` is self-healing: calendars missing from the stored order
  sort to the end.
- A `touchmove` listener on the list (`passive: false`) calls `preventDefault`
  while a drag is active so the page does not scroll mid-reorder.
- Keyboard parity is unchanged: `Alt+ArrowUp/Down` on the `⋯` button reorders
  via the existing `reorder(id, targetId)` helper.

### Test

`Sidebar.test.tsx` exercises the full flow: single click opens the menu;
movement before the long-press does **not** start a drag; after the long-press,
a drag reorders the list and persists to `localStorage`. The one `translateY`
assertion was updated from the old raw-delta value to the re-anchored residual
(`translateY(-4px)`), documenting that the lifted row stays under the finger.

**Files:** `apps/web/src/modules/calendar/Sidebar.tsx` (drag handlers, state),
`apps/web/src/modules/calendar/Sidebar.test.tsx` (assertion update),
`apps/web/src/styles.css` (`.calendar-row.reordering` lifted style).

---

## 10. Delete calendar with confirmation

### Problem

There was no way to delete a calendar from the UI, and the backend `DELETE`
route refused to delete any calendar that still had events (409), forcing manual
event cleanup first.

### Decision

- **Backend** (`apps/api/app/routes/calendar.py`): the `DELETE
  /api/calendars/{id}` route now cascade-deletes the calendar's events before
  deleting the calendar. Synced (non-`local`) calendars are still rejected.
- **Frontend** (`Sidebar.tsx`): a **Delete** action (ghost/danger style) in the
  calendar edit card opens a confirmation dialog reusing the existing
  `.scope-prompt` / `.scope-card` overlay pattern. The dialog names the calendar
  (`Delete "<name>"?`) and warns that all its events are permanently removed.
  Confirming calls `DELETE`, closes the dialog and the edit menu, and refreshes
  the list.
- **CSS**: added `.cal-card-actions .danger` (transparent background, `#d9573f`
  red text) matching the destructive colour used elsewhere in the app.

**Files:** `apps/api/app/routes/calendar.py`,
`apps/web/src/modules/calendar/Sidebar.tsx`, `apps/web/src/styles.css`.

---

## 11. Event-editor popups portalled to the document body

### Problem

The recurring-event scope chooser (edit/delete) and the repeat editor are
`position: fixed; inset: 0` full-screen overlays, but they appeared off-centre —
shifted toward the top or bottom of the screen depending on where the editor was
scrolled.

### Root cause

Both overlays were declared inside `editor-drag-wrap`, which always carries
`style={{ transform: translateY(${dragY}px) }}` (i.e. `translateY(0px)` at
rest), and `.event-editor` itself keeps a resting `transform` from its
`animation: editorIn … both`. **Any** non-`none` transform on an ancestor makes
`position: fixed` resolve against that ancestor instead of the viewport, so the
"full-screen centred" overlays were actually centred on the editor panel. The
`height: 105%` in `.scope-prompt` was a band-aid for the same issue.

### Decision

Render both overlays through `createPortal(…, document.body)` so they escape the
transformed ancestors and `position: fixed` resolves against the viewport. React
state and handlers are unaffected (the portal keeps the React tree). Removed the
`height: 105%` hack from `.scope-prompt`.

**Files:** `apps/web/src/modules/calendar/EventEditor.tsx` (`createPortal` for
the repeat and scope prompts), `apps/web/src/styles.css` (removed `height: 105%`).

---

## 12. Recurring event — siblings stay visible while editing

### Problem

Opening the editor on one occurrence of a repeating event made **all the other
occurrences of that series disappear** from the grid while the editor was open.

### Root cause

The backend expands a recurring event into occurrences that all share the same
`id` (differing only by `start_at`). The grid's draft filter hid every event
matching the draft by `id` (`event.id !== draftId`), which stripped the entire
series and left only the single live preview.

### Decision

Hide only the **specific occurrence** being previewed, matched by its
`occurrenceKey` (`id:start_at`) rather than by `id`.

- `Calendar.tsx` derives a stable `draftReplaceKey` from `editorEvent` — which
  keeps the *original* occurrence's `start_at` (only `draftPreview` moves as the
  user types) — and passes it to both `TimeGrid` and `MonthView`.
- Both views filter out only the occurrence whose `occurrenceKey` equals
  `draftReplaceKey`, then append the live preview. New-event drafts pass a null
  key, so all events stay visible. Non-recurring behaviour is unchanged (the key
  is unique anyway). The now-unused `draftId` was removed from `TimeGrid`.

**Files:** `apps/web/src/pages/Calendar.tsx` (`draftReplaceKey`),
`apps/web/src/modules/calendar/TimeGrid.tsx`,
`apps/web/src/modules/calendar/MonthView.tsx`.

---

## 13. Grabber hidden on desktop

### Problem

The pull-down-to-close grabber (§7) is a touch-only affordance but was still
visible (and showed a `grab` cursor) on desktop, where it does nothing — the
drag handlers already return early for non-touch pointers.

### Decision

Hide the grabber on pointer-fine (mouse) devices with
`@media (pointer: fine) { .editor-grabber { display: none } }`, mirroring the
existing `@media (pointer: coarse)` touch-only convention. CSS-only — no JS
change, and the touch gesture is unaffected.

**Files:** `apps/web/src/styles.css`.

---

## 14. Shared calendar order — event editor picker

### Problem

Reordering calendars by dragging in the sidebar changed the sidebar only. The
event editor's calendar picker still listed calendars in raw API order, and its
default-calendar fallback (`calendars[0]`) didn't match the first chip shown.

### Decision

Extract the ordering into one shared module now that a second consumer exists.

- New `apps/web/src/modules/calendar/order.ts` — single source of truth:
  `CALENDAR_ORDER_KEY`, `storedCalendarOrder()`, and
  `orderCalendars(calendars, order?)` (saved order first, unknown ids to the
  end).
- `Sidebar.tsx` refactored to import these (removed its duplicate key constant
  and inline sort); behaviour unchanged, confirmed by the existing reorder test.
- `EventEditor.tsx` orders `calendars` via `orderCalendars(...)` (memoised so
  the derived `selectedCalendarId` stays stable for the React Compiler) and uses
  it for both the picker chips and the default-calendar fallbacks.

The editor remounts on open (it's keyed), so it reads the latest saved order
from `localStorage` each time — the reorder syncs on next open, not live.

**Files:** `apps/web/src/modules/calendar/order.ts` (new),
`apps/web/src/modules/calendar/Sidebar.tsx`,
`apps/web/src/modules/calendar/EventEditor.tsx`.

---

## 15. Default calendar from settings applied on create

### Problem

The Calendar settings page exposed a **default calendar** (`default_calendar_id`),
but nothing consumed it. New events always opened on the first calendar.

### Decision

`Calendar.tsx` `createAt` now seeds the draft's `calendar_id` with the settings
default when that calendar still exists, falling back to `orderCalendars(...)[0]`
(so it also matches the saved order):

```ts
const defaultCalendar =
  calendars.find((c) => c.id === settings.default_calendar_id) ??
  orderCalendars(calendars)[0]
```

**Files:** `apps/web/src/pages/Calendar.tsx`.

---

## 16. 5-minute snap for create, move, and resize

### Problem

Event creation, move, and resize resolved to 1-minute granularity, so events
rarely landed on clean 5-minute boundaries. Move/resize snapped the drag *delta*
to 5 minutes but added it to an off-grid original time, preserving the arbitrary
offset (e.g. a 10:07 event stayed at :07).

### Decision

Snap the **result**, not just the delta, to a 5-minute grid.

- **Create/select** (`time.ts` `minuteAtPointer`) rounds to the nearest 5
  minutes (`SNAP_MINUTES = 5`) instead of flooring to 1, clamped to
  `MINUTES_PER_DAY − SNAP_MINUTES`.
- **Move/resize** (`TimeGrid.tsx` `moveEventGesture`) captures an `anchorMinute`
  on the gesture — the minute-of-day of the dragged edge (start for move, end
  for resize) — and computes
  `target = round((anchorMinute + rawMinutes) / 5) * 5`, then
  `deltaMinutes = target − anchorMinute`. The dragged edge lands on a boundary
  regardless of the event's original offset; move preserves duration, resize
  snaps the end. Preview and committed value share `deltaMinutes`, so there is no
  jump on drop. Both desktop and touch route through the same function.

**Files:** `apps/web/src/modules/calendar/time.ts` (`minuteAtPointer` snap),
`apps/web/src/modules/calendar/TimeGrid.tsx` (`anchorMinute`, snapped delta),
`apps/web/src/modules/calendar/TimeGrid.test.ts` (snap assertions).

---

## Files changed

| File | Changes |
|---|---|
| `apps/web/src/modules/calendar/TimeGrid.tsx` | `overlapOffsets()` algorithm, `resizingDay` state, touch state machine (`TouchState`, handlers), double-tap detection, time-display overflow clip, day-column touch dispatch, event-chip touch dispatch, resize handle touch guard, `draftReplaceKey` occurrence-scoped draft filter, 5-min `anchorMinute` snap for move/resize |
| `apps/web/src/modules/calendar/MonthView.tsx` | `draftReplaceKey` occurrence-scoped draft filter |
| `apps/web/src/modules/calendar/time.ts` | `minuteAtPointer` snaps to nearest 5 minutes |
| `apps/web/src/modules/calendar/TimeGrid.test.ts` | 5-minute snap assertions |
| `apps/web/src/modules/calendar/order.ts` (new) | Shared calendar-order source of truth (`orderCalendars`, `storedCalendarOrder`, `CALENDAR_ORDER_KEY`) |
| `apps/web/src/pages/Calendar.tsx` | Derives `draftReplaceKey`; applies settings default calendar in `createAt` |
| `apps/web/src/modules/calendar/EventEditor.tsx` | Pull-down grabber + drag handlers, `closeImmediate()` (skips `editorOut` on grabber close), `mountedAt` close guard, repeat/scope prompts rendered via `createPortal` to `document.body`, ordered calendar picker |
| `apps/web/src/modules/calendar/Sidebar.tsx` | Long-press (375 ms) drag-to-reorder with live reordering + finger re-anchoring, `homeIndex`/`ROW_GAP`, `localStorage` order persistence via shared `order.ts`, delete-calendar confirmation dialog |
| `apps/web/src/modules/calendar/Sidebar.test.tsx` | Reorder flow assertions (re-anchored `translateY`) |
| `apps/api/app/routes/calendar.py` | `DELETE /api/calendars/{id}` cascade-deletes events instead of rejecting with 409 |
| `apps/web/src/styles.css` | `.day-column` `touch-action: pan-y`, calendar colour `::before` dot, `editor-grabber`/`editor-grabber-handle`/`editor-drag-wrap` styles, removed `long-press-active` styles, `.calendar-row.reordering` lifted style, `.cal-card-actions .danger`, removed `.scope-prompt { height: 105% }`, `@media (pointer: fine)` grabber hide |

---

## Superseded documents

The following plan files in `docs/work/plans/` are superseded by this ADR and have
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
