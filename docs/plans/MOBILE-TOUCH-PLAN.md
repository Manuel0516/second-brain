# Mobile touch interaction plan

**Target file:** `apps/web/src/modules/calendar/TimeGrid.tsx`
**CSS target:** `apps/web/src/styles.css` (one touch-action rule)

---

## Behaviour spec

| Gesture | Where | Result |
|---|---|---|
| Single tap | Empty grid | Nothing (disabled) |
| Single tap | Event | Nothing (disabled) |
| Long-press ≥ 1000 ms, no movement | Empty grid | Open new-event card |
| Long-press ≥ 1000 ms, no movement | Event chip | Open edit card |
| One-finger horizontal swipe | Anywhere in grid | Navigate ±1 day (`onHorizontalNavigate`) |
| One-finger vertical slide | Anywhere in grid | Native vertical scroll (browser handles) |
| Pinch (two fingers) | Anywhere in grid | Scale row height (`onRowHeightChange`) |

Desktop pointer behaviour is **unchanged** — all gates below are conditional on
`pointerType === 'touch'`.

---

## Touch-action CSS (one line)

The day-column scroll container needs `touch-action: pan-y` so the browser
handles vertical scroll natively and we can intercept horizontal movement
without calling `preventDefault` on every move event.

```css
.day-column {
  touch-action: pan-y;
}
```

When a second pointer is detected (pinch), the handler sets
`touch-action: none` on the column element directly via `el.style.touchAction`
to take over from the browser, then restores `pan-y` on release.

---

## State machine

Replace the existing `touchTimerRef` / `touchMovedRef` pair with a single
`touchStateRef` object. Only one state is active at a time per column.

```ts
type TouchState =
  | { phase: 'idle' }
  | { phase: 'pending';  x: number; y: number; timer: ReturnType<typeof setTimeout>; target: 'grid' | 'event'; eventId?: string }
  | { phase: 'swipe';    startX: number; deltaX: number; pointerId: number }
  | { phase: 'pinch';    ids: [number, number]; pts: [{ x: number; y: number }, { x: number; y: number }]; baseHeight: number; baseDist: number }
  | { phase: 'scroll' }
```

---

## Implementation

### 1. Remove old FIX-3 stubs

Delete `touchTimerRef`, `touchMovedRef`, and the `if (event.pointerType === 'touch')` blocks scattered through `startNewSelection`, `moveNewSelection`, and `finishNewSelection`.

### 2. Add `touchStateRef`

```ts
const touchStateRef = useRef<TouchState>({ phase: 'idle' })
```

### 3. `onTouchPointerDown` — entry point for all touch interactions

Attach to the day column **and** to each event chip (with a `target` flag).

```ts
function onTouchPointerDown(
  e: React.PointerEvent<HTMLElement>,
  target: 'grid' | 'event',
  eventId?: string,
) {
  if (e.pointerType !== 'touch') return

  const state = touchStateRef.current

  // Second finger arriving → enter pinch
  if (state.phase === 'pending' || state.phase === 'swipe' || state.phase === 'scroll') {
    if (state.phase === 'pending') clearTimeout(state.timer)
    const col = e.currentTarget.closest('.day-column') as HTMLElement
    col.style.touchAction = 'none'
    col.setPointerCapture(e.pointerId)
    // find the first active pointer already captured
    const firstId = state.phase === 'swipe' ? state.pointerId : (state as any).pointerId ?? e.pointerId
    touchStateRef.current = {
      phase: 'pinch',
      ids: [firstId, e.pointerId],
      pts: [
        { x: e.clientX, y: e.clientY }, // will be corrected on first move
        { x: e.clientX, y: e.clientY },
      ],
      baseHeight: rowHeight,
      baseDist: 1, // will be set on first pinch move
    }
    return
  }

  // First finger
  e.currentTarget.setPointerCapture(e.pointerId)
  const timer = setTimeout(() => {
    const s = touchStateRef.current
    if (s.phase !== 'pending') return
    touchStateRef.current = { phase: 'idle' }
    if (target === 'event' && eventId) {
      const ev = /* look up event by id from local state */ getEventById(eventId)
      if (ev) onEdit(ev)
    } else {
      const minute = yToMinute(s.y, e.currentTarget)
      onCreate(dateAtMinute(day, minute))
    }
  }, 1000)

  touchStateRef.current = { phase: 'pending', x: e.clientX, y: e.clientY, timer, target, eventId }
}
```

> **Long-press feedback:** at the 500 ms mark add a CSS class `long-press-active`
> to the target element so it darkens slightly. Remove it on cancel or fire.

### 4. `onTouchPointerMove`

Attach to the day column (captures both grid and event moves via pointer capture).

```ts
function onTouchPointerMove(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'touch') return
  const state = touchStateRef.current

  if (state.phase === 'pending') {
    const dx = Math.abs(e.clientX - state.x)
    const dy = Math.abs(e.clientY - state.y)
    const THRESHOLD = 8 // px — dead zone before classifying

    if (dx < THRESHOLD && dy < THRESHOLD) return // still in dead zone

    clearTimeout(state.timer)
    e.currentTarget.classList.remove('long-press-active')

    if (dx > dy) {
      // Horizontal intent → swipe mode
      touchStateRef.current = {
        phase: 'swipe',
        startX: state.x,
        deltaX: e.clientX - state.x,
        pointerId: e.pointerId,
      }
    } else {
      // Vertical intent → hand off to browser scroll
      touchStateRef.current = { phase: 'scroll' }
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    return
  }

  if (state.phase === 'swipe' && e.pointerId === state.pointerId) {
    touchStateRef.current = { ...state, deltaX: e.clientX - state.startX }
    // Optional: translate the grid visually with a CSS transform for feel
    return
  }

  if (state.phase === 'pinch') {
    // Update the moving finger's position
    const idx = state.ids.indexOf(e.pointerId) as 0 | 1
    if (idx === -1) return
    const pts = [...state.pts] as typeof state.pts
    pts[idx] = { x: e.clientX, y: e.clientY }

    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)

    if (state.baseDist === 1) {
      // First move with two fingers — record baseline distance
      touchStateRef.current = { ...state, pts, baseDist: dist }
      return
    }

    const ratio = dist / state.baseDist
    const MIN_ROW = 40
    const MAX_ROW = 120
    const next = Math.min(MAX_ROW, Math.max(MIN_ROW, Math.round(state.baseHeight * ratio)))
    onRowHeightChange(next)
    touchStateRef.current = { ...state, pts }
  }
}
```

### 5. `onTouchPointerUp`

```ts
function onTouchPointerUp(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'touch') return
  const state = touchStateRef.current

  if (state.phase === 'pending') {
    // Tap — do nothing (disabled)
    clearTimeout(state.timer)
    e.currentTarget.classList.remove('long-press-active')
    touchStateRef.current = { phase: 'idle' }
    return
  }

  if (state.phase === 'swipe') {
    const COMMIT_THRESHOLD = 50 // px
    if (Math.abs(state.deltaX) >= COMMIT_THRESHOLD) {
      onHorizontalNavigate(state.deltaX < 0 ? 1 : -1)
    }
    touchStateRef.current = { phase: 'idle' }
    return
  }

  if (state.phase === 'pinch') {
    const remaining = state.ids.filter((id) => id !== e.pointerId)
    if (remaining.length === 0) {
      const col = e.currentTarget.closest('.day-column') as HTMLElement
      col.style.touchAction = ''
      touchStateRef.current = { phase: 'idle' }
    } else {
      // One finger lifted, one still down — go back to pending/scroll
      touchStateRef.current = { phase: 'scroll' }
    }
    return
  }

  touchStateRef.current = { phase: 'idle' }
}
```

### 6. Wire handlers to JSX

**Day column** (the empty grid background):
```tsx
onPointerDown={(e) => {
  if (e.pointerType === 'touch') { onTouchPointerDown(e, 'grid'); return }
  startNewSelection(e, day)  // desktop unchanged
}}
onPointerMove={(e) => {
  if (e.pointerType === 'touch') { onTouchPointerMove(e); return }
  moveNewSelection(e)
}}
onPointerUp={(e) => {
  if (e.pointerType === 'touch') { onTouchPointerUp(e); return }
  finishNewSelection(e)
}}
onPointerCancel={(e) => {
  if (e.pointerType === 'touch') {
    if (touchStateRef.current.phase === 'pending')
      clearTimeout((touchStateRef.current as any).timer)
    touchStateRef.current = { phase: 'idle' }
    return
  }
  cancelNewSelection()
}}
```

**Event chips** — add `onPointerDown` only (move/up bubble to column):
```tsx
onPointerDown={(e) => {
  if (e.pointerType === 'touch') {
    e.stopPropagation()
    onTouchPointerDown(e, 'event', event.id)
    return
  }
  startEventGesture(e, event)  // desktop drag unchanged
}}
onClick={(e) => {
  if (e.pointerType === 'touch') return  // disabled on touch
  onEdit(event)
}}
```

### 7. Long-press visual feedback

```css
.calendar-event.long-press-active,
.day-column.long-press-active {
  filter: brightness(1.2);
  transition: filter 200ms ease;
}
```

---

## Helper: `getEventById`

The touch handler needs to look up an event by id to pass to `onEdit`. Either:
- Keep a `Map<string, CalendarEvent>` derived from the events array in the
  component, or
- Pass the full event object into the `onTouchPointerDown` call from the event
  chip's closure (simpler).

**Prefer the closure approach** — no extra data structure needed:

```tsx
// in the event chip's onPointerDown
onPointerDown={(e) => {
  if (e.pointerType === 'touch') {
    e.stopPropagation()
    onTouchPointerDown(e, 'event', event) // pass full event object
    return
  }
  ...
}}
```

Update the `TouchState.pending` type accordingly:
```ts
| { phase: 'pending'; ...; target: 'grid' | 'event'; event?: CalendarEvent }
```

---

## What to delete

- `touchTimerRef` and `touchMovedRef` refs (FIX-3 stubs)
- The `if (event.pointerType === 'touch') return` early exits in
  `moveNewSelection` and `finishNewSelection`
- The 300 ms timer block in `startNewSelection`

---

## Verification checklist

- [ ] One-finger vertical slide scrolls the grid (browser native, no jank).
- [ ] One-finger horizontal swipe navigates to the next/previous day.
- [ ] Swipe threshold (50 px) prevents accidental navigation on small wiggles.
- [ ] Long-press on empty grid (1 s, no movement) opens the new-event card at
      the correct time slot.
- [ ] Long-press on event chip (1 s, no movement) opens the edit card.
- [ ] Short tap on empty grid does nothing.
- [ ] Short tap on event chip does nothing.
- [ ] Pinch-open increases row height; pinch-close decreases it.
- [ ] Row height stays within [40, 120] px bounds.
- [ ] Visual feedback (brightness) appears at ~500 ms on long-press and clears
      on release or cancel.
- [ ] Desktop: all existing pointer behaviour unchanged (drag, resize, click to
      edit, click to create).
- [ ] `npm run check` passes with no new type or lint errors.
