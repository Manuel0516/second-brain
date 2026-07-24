import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { apiCall } from '../../lib/api'
import {
  clampRowHeight,
  eventSegmentForDay,
  minuteAtPointer,
  resizeIsoRange,
  shiftIsoRange,
  withBufferDays,
} from './time'
import { occurrenceKey } from './types'
import type { CalendarData, CalendarEvent } from './types'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES_PER_DAY = 24 * 60
const DEFAULT_DURATION = 60
const TIME_COL = 52
const DRAG_THRESHOLD = 3
const LONG_PRESS_DELAY = 650
const TOUCH_RESIZE_EDGE = 18
// Extra days rendered off-screen on each side so horizontal scroll reveals real
// content instead of a fake nudge. Bump if fast flicks show empty buffer days.
const BUFFER_DAYS = 1
// Trackpad momentum scrolling keeps sending decaying wheel events with gaps
// well past 100ms between them; too short a gap here was cutting a single
// fast flick into several small fragments (each rounding to its own nearest
// day, often springing back) instead of one continuous multi-day glide.
const WHEEL_IDLE_MS = 220
// How far (in ms) to project the release velocity forward before rounding to
// the nearest day boundary — the settle spring's fixed destination, decided
// once up front so a fast flick can target more than one day away.
const FLING_PROJECTION_MS = 150
// Critically-damped spring constants (tuned in seconds) for the settle
// animation: damping = 2*sqrt(stiffness) is the critical ratio — the fastest
// approach to the target with no overshoot, so it can't bounce back past a
// day boundary and swing forward again.
const SPRING_STIFFNESS = 170
const SPRING_DAMPING = 2 * Math.sqrt(SPRING_STIFFNESS)
// Safety cutoff in case the spring never quite crosses the "settled" epsilon
// (shouldn't happen for a critically-damped spring, but bounds the worst case).
const SPRING_MAX_MS = 2000
// Cancel-drag uses a short plain glide back to rest (no fling projection —
// a cancel should feel like an abrupt stop, not a continued momentum).
const FINAL_SETTLE_MS = 120

interface NewSelection {
  day: Date
  anchorMinute: number
  currentMinute: number
}

interface Gesture {
  mode: 'move' | 'resize'
  pointerId: number
  clientX: number
  clientY: number
  columnWidth: number
  events: CalendarEvent[]
  // Minute-of-day of the dragged edge (start for move, end for resize) — the
  // result is snapped to a 5-minute grid relative to this anchor.
  anchorMinute: number
  deltaMinutes: number
  deltaDays: number
  // Snapped pixel offset used by the live drag preview.
  rawX: number
  rawY: number
  moved: boolean
  // On release, the transform animates from rawX/rawY to the snapped grid
  // position; once settling the transition is enabled so it glides, not jumps.
  settling: boolean
}

interface AllDayDrag {
  event: CalendarEvent
  pointerId: number
  x: number
  y: number
  moved: boolean
}

interface Props {
  days: Date[]
  rowHeight: number
  calendars: CalendarData[]
  refresh: number
  onCreate: (start: Date, end?: Date) => void
  onCreateAllDay: (day: Date) => void
  onEdit: (event: CalendarEvent) => void
  onRowHeightChange: (value: number) => void
  onHorizontalNavigate: (days: number) => void
  draftEvent?: Partial<CalendarEvent> | null
  draftReplaceKey?: string | null
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable)

function dateAtMinute(day: Date, minute: number) {
  const date = new Date(day)
  date.setHours(0, minute, 0, 0)
  return date
}

// Move/resize snap granularity, in minutes.
const SNAP_MINUTES = 5
const minuteOfDay = (iso: string) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

// ponytail: O(n²) per day column; day columns rarely hold enough events to matter.
// For each event, count overlapping events that are longer — that count becomes its
// horizontal offset level so the shorter event sits slightly right and on top.
interface TimedEventSegment {
  event: CalendarEvent
  start: Date
  end: Date
}

function overlapOffsets(segments: TimedEventSegment[]) {
  // Google Calendar greedy column assignment — only within overlap groups.
  // Events that don't overlap with anything get full width (100%).
  const meta = segments
    .map(({ event, start, end }) => ({
      id: occurrenceKey(event),
      start: start.getTime(),
      end: end.getTime(),
    }))
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))

  // Assign each event to an overlap group: events that share time intersect
  // belong to the same group.
  const groups: { id: string; start: number; end: number }[][] = []
  const groupFor = new Map<string, number>()

  for (const m of meta) {
    // Find first group this event overlaps with
    let groupIdx = -1
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi]
      if (g.some((e) => e.start < m.end && e.end > m.start)) {
        groupIdx = gi
        break
      }
    }
    if (groupIdx === -1) {
      groupIdx = groups.length
      groups.push([])
    }
    groups[groupIdx].push(m)
    groupFor.set(m.id, groupIdx)
  }

  // Within each group, run greedy column assignment
  const assignments = new Map<string, { col: number; groupMax: number }>()

  for (const group of groups) {
    const columns: { id: string; end: number }[][] = []
    for (const m of group) {
      let col = 0
      while (col < columns.length) {
        const last = columns[col][columns[col].length - 1]
        if (last.end <= m.start) break
        col++
      }
      if (col >= columns.length) columns.push([])
      columns[col].push(m)
      assignments.set(m.id, { col, groupMax: columns.length })
    }
    // Ensure all events in this group know the true max column count
    for (const m of group) {
      const a = assignments.get(m.id)!
      a.groupMax = Math.max(a.groupMax, columns.length)
    }
  }

  // Solo events (groups of 1) get full width
  const result = new Map<string, { left: number; width: number; col: number }>()
  for (const [id, a] of assignments) {
    if (a.groupMax <= 1) {
      result.set(id, { left: 0, width: 1, col: 0 })
    } else {
      const width = 1 / a.groupMax
      result.set(id, { left: a.col * width, width, col: a.col })
    }
  }
  return result
}

export function TimeGrid({
  days,
  rowHeight,
  calendars,
  refresh,
  onCreate,
  onCreateAllDay,
  onEdit,
  onRowHeightChange,
  onHorizontalNavigate,
  draftEvent,
  draftReplaceKey,
}: Props) {
  const renderDays = withBufferDays(days, BUFFER_DAYS, BUFFER_DAYS)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [newSelection, setNewSelection] = useState<NewSelection | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [interactionError, setInteractionError] = useState('')
  const [nowMinute, setNowMinute] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })
  const [allDayDrag, setAllDayDrag] = useState<AllDayDrag | null>(null)
  const allDayDragRef = useRef<AllDayDrag | null>(null)
  const selectionRef = useRef<NewSelection | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const clipboardRef = useRef<CalendarEvent[]>([])
  const pasteTargetRef = useRef<Date | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const didInitialScroll = useRef(false)
  const wheelNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [resizingDay, setResizingDay] = useState<string | null>(null)
  const setCurrentGesture = (next: Gesture | null) => {
    gestureRef.current = next
    setGesture(next)
  }

  // ── Mobile touch state machine ─────────────────────────────────────
  type TouchState =
    | { phase: 'idle' }
    | {
        phase: 'pending'
        x: number
        y: number
        pointerId: number
        target: 'grid' | 'event'
        event?: CalendarEvent
        mode?: Gesture['mode']
        column?: HTMLElement
        timer?: ReturnType<typeof setTimeout>
      }
    | {
        phase: 'swipe'
        x: number
        y: number
        pointerId: number
      }
    | {
        phase: 'pinch'
        ids: [number, number]
        pts: [{ x: number; y: number }, { x: number; y: number }]
        baseHeight: number
        baseDist: number
      }
    | { phase: 'scroll'; x: number; y: number; pointerId: number }
    | {
        phase: 'event-drag'
        pointerId: number
        event: CalendarEvent
        mode: Gesture['mode']
      }

  const touchStateRef = useRef<TouchState>({ phase: 'idle' })

  // Cumulative horizontal drag, in px, always rebased back into (-dayWidth, dayWidth)
  // as day boundaries are crossed — see applyDrag.
  const dragPx = useRef(0)
  // Recent drag speed (px/ms, same sign convention as dragPx) and when it was
  // last sampled — lets settleDrag project a fast flick a bit further, instead
  // of only ever being able to land one day past wherever the raw drag ended.
  const dragVelocity = useRef(0)
  const lastDragTime = useRef(0)

  // Real rendered width of one day column, measured from the DOM (not derived
  // from a formula) so it always matches what's actually on screen — but
  // cached rather than re-measured on every wheel tick/animation frame.
  // getBoundingClientRect() forces a synchronous layout recalculation, and
  // every applyOffset call just wrote a style property; measuring on every
  // single rAF frame (up to ~60/s) is a write-then-read layout-thrash loop
  // that can itself stutter the animation it's trying to drive. The column
  // width doesn't change mid-gesture, only on resize/view changes, both of
  // which explicitly refresh the cache below.
  const dayWidthCache = useRef<number | null>(null)
  const measureDayWidth = useCallback(() => {
    const measured =
      scrollRef.current?.querySelector<HTMLElement>('.day-column')
    // jsdom returns 0 for layout rects; the 80px floor keeps that (and the
    // rebase loop below) from ever dividing by/looping on zero.
    dayWidthCache.current = Math.max(
      80,
      measured?.getBoundingClientRect().width || 0,
    )
    return dayWidthCache.current
  }, [])
  const dayWidthPx = useCallback(
    () => dayWidthCache.current ?? measureDayWidth(),
    [measureDayWidth],
  )

  // In-flight momentum coast (see settleDrag), so a new real drag starting
  // mid-coast can cancel it instead of fighting it.
  const coastFrame = useRef<number | null>(null)
  const stopCoast = useCallback(() => {
    if (coastFrame.current !== null) {
      cancelAnimationFrame(coastFrame.current)
      coastFrame.current = null
    }
  }, [])

  // Core offset update, shared by real drag input and the settle spring
  // below. `offsetDeltaPx` is in "content offset" terms: positive shifts the
  // grid right (reveals earlier days). Each time the cumulative drag crosses
  // a full day-width, the cursor shifts by one day and the drag is rebased by
  // that same width — same calendar day ends up in the same viewport pixels
  // right before and after, so the rebase is visually a no-op and arbitrarily
  // long/fast scrolling just keeps revealing real days.
  //
  // `dw` is passed in rather than re-measured here on every call: a settle
  // animation re-triggers React renders (via onHorizontalNavigate) mid-flight,
  // and re-querying the DOM on every single animation frame risked catching
  // a transient in-between layout state and using a subtly different width
  // than the one the caller's target/threshold math was based on — a real
  // (if small) mismatch that showed up as a visible jump right at the end.
  const applyOffset = useCallback(
    (offsetDeltaPx: number, dw: number) => {
      const element = scrollRef.current
      if (!element) return
      dragPx.current += offsetDeltaPx
      let shifted = 0
      while (dragPx.current <= -dw) {
        dragPx.current += dw
        shifted += 1
      }
      while (dragPx.current >= dw) {
        dragPx.current -= dw
        shifted -= 1
      }
      // The cursor update and transform rebase represent one visual operation.
      // Commit the new day columns before writing the rebased offset so the
      // browser cannot paint one frame with old events in their new positions.
      if (shifted) flushSync(() => onHorizontalNavigate(shifted))
      element.classList.add('is-swiping')
      element.style.setProperty(
        '--calendar-swipe-x',
        `${-BUFFER_DAYS * dw + dragPx.current}px`,
      )
    },
    [onHorizontalNavigate],
  )

  // Applies a live drag/scroll increment from real pointer/wheel input and
  // tracks its speed, so a released gesture can hand off to a coast that
  // continues at the same speed instead of an unrelated canned animation.
  const applyDrag = useCallback(
    (offsetDeltaPx: number) => {
      stopCoast()
      const now = performance.now()
      const dt = lastDragTime.current ? now - lastDragTime.current : 16
      lastDragTime.current = now
      dragVelocity.current = offsetDeltaPx / Math.max(1, dt)
      applyOffset(offsetDeltaPx, dayWidthPx())
    },
    [applyOffset, dayWidthPx, stopCoast],
  )

  // Ends a gesture with a single critically-damped spring, seeded with the
  // actual release velocity when it points toward the fixed destination.
  // Rounding can put the nearest boundary behind a slow release, so velocity
  // pointing away from that boundary is discarded and each step is clamped
  // to the target. The settle therefore approaches monotonically: no tiny
  // forward movement followed by a correction in the opposite direction.
  const settleDrag = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    stopCoast()
    const dw = dayWidthPx()
    const v0 = dragVelocity.current
    // Absolute (unrebased) position/target, so the spring can freely travel
    // through more than one day for a fast flick — applyOffset below still
    // does the actual (bounded) rebase-and-commit per day crossing.
    const projected = dragPx.current + v0 * FLING_PROJECTION_MS
    const target = Math.round(projected / dw) * dw
    let pos = dragPx.current
    const distance = target - pos
    let vel = distance * v0 > 0 ? v0 * 1000 : 0
    let lastTime = performance.now()
    const startTime = lastTime

    const finish = () => {
      const residual = target - pos
      if (Math.abs(residual) > 0.01) applyOffset(residual, dw)
      dragVelocity.current = 0
      lastDragTime.current = 0
      // Keep transitions disabled for the paint that applies the exact final
      // offset. Removing this class in the same frame could make the browser
      // animate a day-width rebase that is meant to be visually neutral.
      coastFrame.current = requestAnimationFrame(() => {
        coastFrame.current = null
        element.classList.remove('is-swiping')
      })
    }

    const step = (now: number) => {
      const dt = Math.min(0.032, (now - lastTime) / 1000)
      lastTime = now
      const accel = SPRING_STIFFNESS * (target - pos) - SPRING_DAMPING * vel
      vel += accel * dt
      let delta = vel * dt
      if ((target - pos) * (target - pos - delta) <= 0) {
        delta = target - pos
        vel = 0
      }
      pos += delta
      applyOffset(delta, dw)
      const settled = Math.abs(target - pos) < 0.5 && Math.abs(vel) < 5
      if (settled || now - startTime > SPRING_MAX_MS) {
        coastFrame.current = null
        finish()
        return
      }
      coastFrame.current = requestAnimationFrame(step)
    }

    if (Math.abs(target - pos) < 0.5 && Math.abs(vel) < 5) {
      finish()
    } else {
      coastFrame.current = requestAnimationFrame(step)
    }
  }, [applyOffset, dayWidthPx, stopCoast])

  // Discards an in-progress gesture (e.g. a second touch arriving) with no commit.
  const cancelDrag = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    stopCoast()
    const dw = dayWidthPx()
    dragPx.current = 0
    dragVelocity.current = 0
    lastDragTime.current = 0
    element.classList.remove('is-swiping')
    element.style.setProperty(
      '--calendar-swipe-duration',
      `${FINAL_SETTLE_MS}ms`,
    )
    element.style.setProperty('--calendar-swipe-x', `${-BUFFER_DAYS * dw}px`)
  }, [dayWidthPx, stopCoast])

  // Keeps the grid's rest position (hiding the leading buffer day(s)) aligned
  // with the actual measured day-column width — on mount, when the view
  // changes (day/week column count differs), and on window resize. Skipped
  // mid-gesture so it doesn't fight with an in-progress drag.
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.style.setProperty(
      '--calendar-swipe-x',
      `${-BUFFER_DAYS * measureDayWidth()}px`,
    )
  }, [days.length, measureDayWidth])

  useEffect(() => {
    const onResize = () => {
      if (dragPx.current !== 0) return
      const element = scrollRef.current
      if (!element) return
      element.style.setProperty(
        '--calendar-swipe-x',
        `${-BUFFER_DAYS * measureDayWidth()}px`,
      )
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measureDayWidth])

  const clearLongPress = (state: TouchState) => {
    if (state.phase === 'pending' && state.timer) clearTimeout(state.timer)
  }

  const cancelTouch = () => {
    clearLongPress(touchStateRef.current)
    touchStateRef.current = { phase: 'idle' }
    cancelDrag()
    setCurrentGesture(null)
    setResizingDay(null)
  }

  const startTouchEventGesture = (
    state: Extract<TouchState, { phase: 'pending' }>,
  ) => {
    if (!state.event || !state.mode || !state.column) return
    const key = occurrenceKey(state.event)
    const keys = selectedKeys.has(key) ? selectedKeys : new Set([key])
    setSelectedKeys(keys)
    setCurrentGesture({
      mode: state.mode,
      pointerId: state.pointerId,
      clientX: state.x,
      clientY: state.y,
      columnWidth: state.column.getBoundingClientRect().width,
      events:
        state.mode === 'resize'
          ? [state.event]
          : events.filter((candidate) => keys.has(occurrenceKey(candidate))),
      anchorMinute: minuteOfDay(
        state.mode === 'resize' ? state.event.end_at : state.event.start_at,
      ),
      deltaMinutes: 0,
      deltaDays: 0,
      rawX: 0,
      rawY: 0,
      moved: false,
      settling: false,
    })
    if (state.mode === 'resize') {
      const dayIndex = Number(state.column.dataset.dayIndex)
      setResizingDay(renderDays[dayIndex]?.toDateString() ?? null)
    }
    touchStateRef.current = {
      phase: 'event-drag',
      pointerId: state.pointerId,
      event: state.event,
      mode: state.mode,
    }
  }
  // ── Double-tap detection ──────────────────────────────────────
  const lastTapRef = useRef<{
    time: number
    x: number
    y: number
    target: 'grid' | 'event'
    event?: CalendarEvent
    timer: ReturnType<typeof setTimeout>
  } | null>(null)

  function onTouchPointerDown(
    e: React.PointerEvent<HTMLElement>,
    target: 'grid' | 'event',
    event?: CalendarEvent,
  ) {
    if (e.pointerType !== 'touch') return

    const state = touchStateRef.current
    if (state.phase === 'event-drag') return

    // Second finger arriving → enter pinch
    if (
      state.phase === 'pending' ||
      state.phase === 'swipe' ||
      state.phase === 'scroll'
    ) {
      clearLongPress(state)
      const col = e.currentTarget.closest('.day-column') as HTMLElement
      col?.setPointerCapture(e.pointerId)
      touchStateRef.current = {
        phase: 'pinch',
        ids: [state.pointerId, e.pointerId],
        pts: [
          { x: state.x, y: state.y },
          { x: e.clientX, y: e.clientY },
        ],
        baseHeight: rowHeight,
        baseDist: Math.hypot(e.clientX - state.x, e.clientY - state.y),
      }
      return
    }

    // First finger — capture on the day-column so both fingers route to
    // the same handler for pinch tracking, even if the touch started on an
    // event chip.
    const col = e.currentTarget.closest('.day-column') as HTMLElement | null
    if (col) col.setPointerCapture(e.pointerId)

    const pending: Extract<TouchState, { phase: 'pending' }> = {
      phase: 'pending',
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      target,
      event,
      column: col ?? undefined,
    }
    if (target === 'event' && event && col) {
      const rect = e.currentTarget.getBoundingClientRect()
      pending.mode =
        e.clientY >= rect.bottom - TOUCH_RESIZE_EDGE ? 'resize' : 'move'
      pending.timer = setTimeout(() => {
        const current = touchStateRef.current
        if (current === pending) startTouchEventGesture(current)
      }, LONG_PRESS_DELAY)
    }
    touchStateRef.current = pending
  }

  function onTouchPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType !== 'touch') return
    const state = touchStateRef.current

    if (state.phase === 'event-drag') {
      e.preventDefault()
      moveEventGesture(e)
      return
    }

    if (state.phase === 'pending') {
      const dx = Math.abs(e.clientX - state.x)
      const dy = Math.abs(e.clientY - state.y)
      const THRESHOLD = 8
      if (dx < THRESHOLD && dy < THRESHOLD) return
      clearLongPress(state)
      if (dx > dy) {
        applyDrag(e.clientX - state.x)
        touchStateRef.current = {
          phase: 'swipe',
          x: e.clientX,
          y: e.clientY,
          pointerId: e.pointerId,
        }
      } else {
        touchStateRef.current = {
          phase: 'scroll',
          x: e.clientX,
          y: e.clientY,
          pointerId: e.pointerId,
        }
      }
      return
    }

    if (state.phase === 'swipe' && e.pointerId === state.pointerId) {
      applyDrag(e.clientX - state.x)
      touchStateRef.current = {
        ...state,
        x: e.clientX,
        y: e.clientY,
      }
      return
    }

    if (state.phase === 'scroll' && e.pointerId === state.pointerId) {
      touchStateRef.current = { ...state, x: e.clientX, y: e.clientY }
      return
    }

    if (state.phase === 'pinch') {
      const idx = state.ids.indexOf(e.pointerId)
      if (idx === -1) return
      const pts = [...state.pts] as typeof state.pts
      pts[idx as 0 | 1] = { x: e.clientX, y: e.clientY }
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
      if (!state.baseDist) return
      const ratio = dist / state.baseDist
      const next = clampRowHeight(Math.round(state.baseHeight * ratio))
      onRowHeightChange(next)
      touchStateRef.current = { ...state, pts }
    }
  }

  function onTouchPointerUp(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType !== 'touch') return
    const state = touchStateRef.current

    if (state.phase === 'event-drag') {
      touchStateRef.current = { phase: 'idle' }
      setResizingDay(null)
      void finishEventGesture(e, state.event)
      return
    }

    if (state.phase === 'pending') {
      clearLongPress(state)
      setSelectedKeys(
        state.target === 'event' && state.event
          ? new Set([occurrenceKey(state.event)])
          : new Set(),
      )
      // Double-tap detection — use e.timeStamp from pointer events
      const DOUBLE_TAP_DELAY = 300
      const DOUBLE_TAP_DIST = 30
      const last = lastTapRef.current
      if (
        last &&
        e.timeStamp - last.time < DOUBLE_TAP_DELAY &&
        Math.abs(e.clientX - last.x) < DOUBLE_TAP_DIST &&
        Math.abs(e.clientY - last.y) < DOUBLE_TAP_DIST &&
        last.target === state.target
      ) {
        clearTimeout(last.timer)
        lastTapRef.current = null
        if (state.target === 'event' && state.event) {
          onEdit(state.event)
        } else {
          const rect = e.currentTarget.getBoundingClientRect()
          const minute = minuteAtPointer(state.y, rect.top, rowHeight)
          const col = e.currentTarget.closest(
            '.day-column',
          ) as HTMLElement | null
          if (col?.dataset.dayIndex !== undefined) {
            const dayIdx = Number(col.dataset.dayIndex)
            onCreate(dateAtMinute(renderDays[dayIdx], minute))
          }
        }
        touchStateRef.current = { phase: 'idle' }
        return
      }
      // First tap — remember it
      const timer = setTimeout(() => {
        lastTapRef.current = null
      }, DOUBLE_TAP_DELAY)
      lastTapRef.current = {
        time: e.timeStamp,
        x: state.x,
        y: state.y,
        target: state.target,
        event: state.event,
        timer,
      }
      touchStateRef.current = { phase: 'idle' }
      return
    }

    if (state.phase === 'swipe') {
      settleDrag()
      touchStateRef.current = { phase: 'idle' }
      return
    }

    if (state.phase === 'pinch') {
      const remaining = state.ids.filter((id) => id !== e.pointerId)
      if (remaining.length) {
        const index = state.ids.indexOf(remaining[0])
        touchStateRef.current = {
          phase: 'scroll',
          pointerId: remaining[0],
          ...state.pts[index],
        }
      } else {
        touchStateRef.current = { phase: 'idle' }
      }
      return
    }

    touchStateRef.current = { phase: 'idle' }
  }

  // Fetch the buffered range (renderDays), not just the visible days, so peek
  // columns already have real event data by the time a scroll reveals them.
  // Keyed on primitive timestamps, not the array reference, since renderDays is
  // recomputed fresh every render — an array-reference dependency would refire
  // this fetch on every unrelated re-render (e.g. every event-drag pointermove).
  const rangeKey = `${renderDays[0]?.getTime() ?? 0}:${
    renderDays[renderDays.length - 1]?.getTime() ?? 0
  }`
  // A fast multi-day settle fires onHorizontalNavigate — and so this fetch —
  // once per day crossed, in quick succession. Real network responses can
  // resolve out of order, so without a sequence guard an older response can
  // land after a newer one and overwrite the display with stale events right
  // as the scroll finishes — looking exactly like a random reload/jump.
  const eventsRequestId = useRef(0)
  const loadEvents = useCallback(() => {
    const requestId = ++eventsRequestId.current
    const [rangeFrom, rangeTo] = rangeKey.split(':').map(Number)
    const from = new Date(rangeFrom)
    from.setHours(0, 0, 0, 0)
    const to = new Date(rangeTo)
    to.setDate(to.getDate() + 1)
    to.setHours(0, 0, 0, 0)
    apiCall(
      `/api/events?from_date=${from.toISOString()}&to_date=${to.toISOString()}`,
    )
      .then(async (response) => {
        if (requestId !== eventsRequestId.current) return
        if (response.ok) setEvents(await response.json())
      })
      .catch(() => {
        if (requestId === eventsRequestId.current) {
          setInteractionError('Could not load calendar events.')
        }
      })
  }, [rangeKey])

  useEffect(loadEvents, [loadEvents, refresh])

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date()
      setNowMinute(now.getHours() * 60 + now.getMinutes())
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      const nearLeftEdge =
        event.clientX - element.getBoundingClientRect().left < TIME_COL
      if (
        event.ctrlKey ||
        (nearLeftEdge && Math.abs(event.deltaY) > Math.abs(event.deltaX))
      ) {
        event.preventDefault()
        const step = event.deltaY * (event.ctrlKey ? 0.5 : 0.15)
        onRowHeightChange(clampRowHeight(rowHeight - step))
        return
      }
      const horizontalMagnitude = Math.abs(event.deltaX)
      const verticalMagnitude = Math.abs(event.deltaY)
      if (
        horizontalMagnitude <= 4 ||
        horizontalMagnitude < verticalMagnitude * 0.45
      ) {
        return
      }
      event.preventDefault()
      applyDrag(-event.deltaX)
      if (wheelNavTimer.current) clearTimeout(wheelNavTimer.current)
      wheelNavTimer.current = setTimeout(() => {
        wheelNavTimer.current = null
        settleDrag()
      }, WHEEL_IDLE_MS)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', onWheel)
      if (wheelNavTimer.current) clearTimeout(wheelNavTimer.current)
      cancelDrag()
    }
  }, [applyDrag, cancelDrag, onRowHeightChange, rowHeight, settleDrag])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const preventScrollDuringEventDrag = (event: TouchEvent) => {
      if (touchStateRef.current.phase === 'event-drag') event.preventDefault()
    }
    element.addEventListener('touchmove', preventScrollDuringEventDrag, {
      passive: false,
    })
    return () => {
      element.removeEventListener('touchmove', preventScrollDuringEventDrag)
      const state = touchStateRef.current
      if (state.phase === 'pending' && state.timer) clearTimeout(state.timer)
    }
  }, [])

  const previousRowHeight = useRef(rowHeight)
  useLayoutEffect(() => {
    const element = scrollRef.current
    const previous = previousRowHeight.current
    previousRowHeight.current = rowHeight
    if (element && previous !== rowHeight) {
      element.scrollTop *= rowHeight / previous
    }
  }, [rowHeight])

  useEffect(() => {
    const element = scrollRef.current
    if (!element || didInitialScroll.current) return
    didInitialScroll.current = true
    element.scrollTop = Math.max(0, 7 * rowHeight - 12)
  }, [rowHeight])

  const pasteEvents = useCallback(async () => {
    if (!clipboardRef.current.length) return
    const copied = clipboardRef.current
    const firstStart = copied.length
      ? new Date(
          Math.min(
            ...copied.map((event) => new Date(event.start_at).getTime()),
          ),
        )
      : new Date()
    const target =
      pasteTargetRef.current ??
      new Date(firstStart.getTime() + 24 * 60 * 60 * 1000)
    setInteractionError('')
    const response = await apiCall('/api/events/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_ids: [...new Set(copied.map((event) => event.id))],
        target_start: target.toISOString(),
      }),
    })
    if (!response.ok) {
      setInteractionError('Could not paste the selected events.')
      return
    }
    const created: CalendarEvent[] = await response.json()
    setSelectedKeys(new Set(created.map(occurrenceKey)))
    pasteTargetRef.current = new Date(target.getTime() + 24 * 60 * 60 * 1000)
    loadEvents()
  }, [loadEvents])

  const deleteSelectedEvents = useCallback(async () => {
    const targets = events.filter((candidate) =>
      selectedKeys.has(occurrenceKey(candidate)),
    )
    if (!targets.length) return
    setInteractionError('')
    const results = await Promise.all(
      targets.map((target) => {
        const query = target.rrule
          ? `?scope=this&occurrence_start=${encodeURIComponent(target.start_at)}`
          : ''
        return apiCall(`/api/events/${target.id}${query}`, { method: 'DELETE' })
      }),
    )
    if (results.some((response) => !response.ok)) {
      setInteractionError('Could not delete some of the selected events.')
    }
    setSelectedKeys(new Set())
    loadEvents()
  }, [events, loadEvents, selectedKeys])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      if (event.key === 'Escape') setSelectedKeys(new Set())
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedKeys.size
      ) {
        event.preventDefault()
        void deleteSelectedEvents()
        return
      }
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() === 'c' && selectedKeys.size) {
        event.preventDefault()
        clipboardRef.current = events.filter((candidate) =>
          selectedKeys.has(occurrenceKey(candidate)),
        )
        pasteTargetRef.current = null
      }
      if (event.key.toLowerCase() === 'v' && clipboardRef.current.length) {
        event.preventDefault()
        void pasteEvents()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelectedEvents, events, pasteEvents, selectedKeys])

  const updateNewSelection = (next: NewSelection | null) => {
    selectionRef.current = next
    setNewSelection(next)
  }

  const startNewSelection = (event: React.PointerEvent, day: Date) => {
    if (event.button !== 0) return
    const column = event.currentTarget as HTMLElement
    const minute = minuteAtPointer(
      event.clientY,
      column.getBoundingClientRect().top,
      rowHeight,
    )
    pasteTargetRef.current = dateAtMinute(day, minute)
    setSelectedKeys(new Set())
    column.setPointerCapture(event.pointerId)
    updateNewSelection({ day, anchorMinute: minute, currentMinute: minute })
  }

  const moveNewSelection = (event: React.PointerEvent) => {
    const current = selectionRef.current
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId))
      return
    const column = event.currentTarget as HTMLElement
    updateNewSelection({
      ...current,
      currentMinute: minuteAtPointer(
        event.clientY,
        column.getBoundingClientRect().top,
        rowHeight,
      ),
    })
  }

  const finishNewSelection = (event: React.PointerEvent) => {
    const current = selectionRef.current
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId))
      return
    event.currentTarget.releasePointerCapture(event.pointerId)
    updateNewSelection(null)
    const startMinute = Math.min(current.anchorMinute, current.currentMinute)
    const endMinute =
      current.anchorMinute === current.currentMinute
        ? Math.min(startMinute + DEFAULT_DURATION, MINUTES_PER_DAY)
        : Math.max(current.anchorMinute, current.currentMinute)
    onCreate(
      dateAtMinute(current.day, startMinute),
      dateAtMinute(current.day, endMinute),
    )
  }

  const cancelNewSelection = () => {
    updateNewSelection(null)
  }

  const startEventGesture = (
    pointer: React.PointerEvent<HTMLElement>,
    event: CalendarEvent,
    mode: Gesture['mode'],
  ) => {
    if (pointer.button !== 0) return
    pointer.stopPropagation()
    if (pointer.shiftKey || pointer.metaKey || pointer.ctrlKey) {
      if (mode === 'move') {
        setSelectedKeys((current) => {
          const next = new Set(current)
          const key = occurrenceKey(event)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
      }
      return
    }
    const key = occurrenceKey(event)
    const keys = selectedKeys.has(key) ? selectedKeys : new Set([key])
    setSelectedKeys(keys)
    const selectedEvents =
      mode === 'resize'
        ? [event]
        : events.filter((candidate) => keys.has(occurrenceKey(candidate)))
    const column = pointer.currentTarget.closest('.day-column') as HTMLElement
    pointer.currentTarget.setPointerCapture(pointer.pointerId)
    setCurrentGesture({
      mode,
      pointerId: pointer.pointerId,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      columnWidth: column?.getBoundingClientRect().width ?? 0,
      events: selectedEvents,
      anchorMinute: minuteOfDay(
        mode === 'resize' ? event.end_at : event.start_at,
      ),
      deltaMinutes: 0,
      deltaDays: 0,
      rawX: 0,
      rawY: 0,
      moved: false,
      settling: false,
    })
  }

  const moveEventGesture = (pointer: React.PointerEvent<HTMLElement>) => {
    const current = gestureRef.current
    if (
      !current ||
      current.pointerId !== pointer.pointerId ||
      !pointer.currentTarget.hasPointerCapture(pointer.pointerId)
    )
      return
    const deltaX = pointer.clientX - current.clientX
    const deltaY = pointer.clientY - current.clientY
    const moved =
      current.moved ||
      Math.abs(deltaX) >= DRAG_THRESHOLD ||
      Math.abs(deltaY) >= DRAG_THRESHOLD
    // Snap the dragged edge to a 5-minute grid: land the result on a boundary
    // (:00, :05, …) rather than shifting by the event's arbitrary start offset.
    const rawMinutes = (deltaY / rowHeight) * 60
    const target =
      Math.round((current.anchorMinute + rawMinutes) / SNAP_MINUTES) *
      SNAP_MINUTES
    const deltaMinutes = moved ? target - current.anchorMinute : 0
    const deltaDays =
      moved && current.mode === 'move' && current.columnWidth
        ? Math.round(deltaX / current.columnWidth)
        : 0
    setCurrentGesture({
      ...current,
      moved,
      deltaMinutes,
      deltaDays,
      rawX: deltaDays * current.columnWidth,
      rawY: (deltaMinutes / 60) * rowHeight,
    })
  }

  const finishEventGesture = async (
    pointer: React.PointerEvent<HTMLElement>,
    clickedEvent: CalendarEvent,
  ) => {
    const current = gestureRef.current
    if (
      !current ||
      current.pointerId !== pointer.pointerId ||
      !pointer.currentTarget.hasPointerCapture(pointer.pointerId)
    )
      return
    pointer.currentTarget.releasePointerCapture(pointer.pointerId)
    if (!current.moved) {
      setCurrentGesture(null)
      if (current.mode === 'move') onEdit(clickedEvent)
      return
    }
    // Glide from where the pointer left off to the snapped grid position.
    // The snapped position equals where the reloaded data will render, so
    // swapping to real data after the glide produces no visible jump.
    setCurrentGesture({
      ...current,
      settling: true,
      rawX: current.deltaDays * current.columnWidth,
      rawY: (current.deltaMinutes / 60) * rowHeight,
    })
    const totalMinutes =
      current.deltaMinutes + current.deltaDays * MINUTES_PER_DAY
    const shiftedRange = (event: CalendarEvent) =>
      current.mode === 'move'
        ? shiftIsoRange(event.start_at, event.end_at, totalMinutes)
        : resizeIsoRange(event.start_at, event.end_at, current.deltaMinutes)
    // Recurring occurrences become single-occurrence overrides; plain events
    // move in bulk. Dragging one instance must not shift the whole series.
    const recurring = current.events.filter((event) => event.rrule)
    const plain = current.events.filter((event) => !event.rrule)
    const failed = () => {
      setCurrentGesture(null)
      setInteractionError(
        current.mode === 'move'
          ? 'Could not move the selected events.'
          : 'Could not resize the event.',
      )
    }
    setInteractionError('')
    if (plain.length) {
      const changes = plain.map((event) => ({
        id: event.id,
        original_start_at: event.start_at,
        ...shiftedRange(event),
      }))
      const response = await apiCall('/api/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: changes }),
      })
      if (!response.ok) return failed()
      // Apply new times locally before dropping the gesture so the event stays
      // put through the round-trip instead of snapping back.
      setEvents((prev) =>
        prev.map((ev) => {
          const change = changes.find(
            (c) => c.id === ev.id && c.original_start_at === ev.start_at,
          )
          return change
            ? { ...ev, start_at: change.start_at, end_at: change.end_at }
            : ev
        }),
      )
    }
    for (const event of recurring) {
      const range = shiftedRange(event)
      const response = await apiCall(`/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'this',
          occurrence_start: event.start_at,
          start_at: range.start_at,
          end_at: range.end_at,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      if (!response.ok) return failed()
    }
    setCurrentGesture(null)
    loadEvents()
  }

  // Drag an all-day chip down into the grid to convert it into a 30-minute
  // timed event at the drop location (loses the all-day property).
  const startAllDayDrag = (
    pointer: React.PointerEvent<HTMLElement>,
    event: CalendarEvent,
  ) => {
    if (pointer.button !== 0 || event.id === '__draft__') return
    pointer.currentTarget.setPointerCapture(pointer.pointerId)
    const next: AllDayDrag = {
      event,
      pointerId: pointer.pointerId,
      x: pointer.clientX,
      y: pointer.clientY,
      moved: false,
    }
    allDayDragRef.current = next
    setAllDayDrag(next)
  }

  const moveAllDayDrag = (pointer: React.PointerEvent<HTMLElement>) => {
    const current = allDayDragRef.current
    if (!current || current.pointerId !== pointer.pointerId) return
    const moved =
      current.moved ||
      Math.abs(pointer.clientX - current.x) > DRAG_THRESHOLD ||
      Math.abs(pointer.clientY - current.y) > DRAG_THRESHOLD
    const next = { ...current, x: pointer.clientX, y: pointer.clientY, moved }
    allDayDragRef.current = next
    setAllDayDrag(next)
  }

  const finishAllDayDrag = async (
    pointer: React.PointerEvent<HTMLElement>,
    event: CalendarEvent,
  ) => {
    const current = allDayDragRef.current
    if (!current || current.pointerId !== pointer.pointerId) return
    pointer.currentTarget.releasePointerCapture(pointer.pointerId)
    allDayDragRef.current = null
    setAllDayDrag(null)
    if (!current.moved) {
      onEdit(event)
      return
    }
    const column = document
      .elementFromPoint(pointer.clientX, pointer.clientY)
      ?.closest('.day-column') as HTMLElement | null
    if (!column || column.dataset.dayIndex === undefined) return
    const day = renderDays[Number(column.dataset.dayIndex)]
    if (!day) return
    const minute = minuteAtPointer(
      pointer.clientY,
      column.getBoundingClientRect().top,
      rowHeight,
    )
    const snapped = Math.min(
      Math.round(minute / 5) * 5,
      MINUTES_PER_DAY - DEFAULT_DURATION / 2,
    )
    const start = dateAtMinute(day, snapped)
    const end = new Date(start.getTime() + 30 * 60_000)
    setInteractionError('')
    const response = await apiCall(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(event.rrule
          ? { scope: 'this', occurrence_start: event.start_at }
          : {}),
        all_day: false,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    })
    if (!response.ok) {
      setInteractionError('Could not move the event into the day.')
      return
    }
    loadEvents()
  }

  const columns = `${TIME_COL}px repeat(${renderDays.length}, ${
    days.length === 1 ? '1fr' : 'minmax(96px, 1fr)'
  })`
  const minWidth =
    days.length === 1 ? 'auto' : TIME_COL + renderDays.length * 96
  // Grid renders wider than the viewport by exactly the buffer's share, so the
  // extra day columns sit off-screen (clipped by .week-scroll's overflow-x:
  // hidden) at the same per-day width as the visible ones.
  const gridWidth = `${(renderDays.length / days.length) * 100}%`
  const today = new Date()
  const colorFor = (event: CalendarEvent) => {
    const calendar = calendars.find((item) => item.id === event.calendar_id)
    return event.color_override || calendar?.color || '#5B8AFD'
  }
  const calendarColorFor = (event: CalendarEvent) => {
    const calendar = calendars.find((item) => item.id === event.calendar_id)
    return calendar?.color || '#5B8AFD'
  }
  const draft = draftEvent
  const draftStart = draft?.start_at ? new Date(draft.start_at) : null
  const previewDraft: CalendarEvent | null =
    draft && draftStart && !Number.isNaN(draftStart.getTime())
      ? {
          ...draft,
          id: draft.id ?? '__draft__',
          calendar_id: draft.calendar_id ?? '',
          title: draft.title || 'Untitled event',
          start_at: draft.start_at!,
          end_at: draft.end_at ?? draft.start_at!,
          all_day: draft.all_day ?? false,
          timezone:
            draft.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          color_override: draft.color_override,
        }
      : null
  const visibleEvents = previewDraft
    ? [
        // Hide only the single occurrence being previewed (matched by its
        // original key), so a recurring event's other occurrences stay visible.
        ...events.filter((event) =>
          draftReplaceKey ? occurrenceKey(event) !== draftReplaceKey : true,
        ),
        previewDraft,
      ]
    : events

  return (
    <div
      className="week-scroll"
      ref={scrollRef}
      style={{ '--row-h': `${rowHeight}px` } as React.CSSProperties}
    >
      {interactionError && (
        <p className="calendar-interaction-error" role="alert">
          {interactionError}
        </p>
      )}
      {allDayDrag?.moved &&
        createPortal(
          <div
            className="allday-drag-ghost"
            style={{
              left: allDayDrag.x,
              top: allDayDrag.y,
              borderColor: colorFor(allDayDrag.event),
              background: `${colorFor(allDayDrag.event)}22`,
              color: colorFor(allDayDrag.event),
            }}
          >
            {allDayDrag.event.icon && (
              <span className="event-icon-glyph">{allDayDrag.event.icon}</span>
            )}
            <span>{allDayDrag.event.title}</span>
          </div>,
          document.body,
        )}
      <div
        className="week-grid week-header"
        style={{ gridTemplateColumns: columns, minWidth, width: gridWidth }}
      >
        <div />
        {renderDays.map((day) => (
          <div
            key={day.toISOString()}
            className={[
              sameDay(day, today) ? 'today' : '',
              isWeekend(day) && !sameDay(day, today) ? 'weekend' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <button
              type="button"
              className="week-header-daylabel"
              aria-label={`Create all-day event ${day.toDateString()}`}
              onClick={() => onCreateAllDay(day)}
            >
              <span>{day.toLocaleDateString([], { weekday: 'short' })}</span>
              <strong>{day.getDate()}</strong>
            </button>
            <div className="allday-band">
              {visibleEvents
                .filter(
                  (event) =>
                    event.all_day && sameDay(new Date(event.start_at), day),
                )
                .map((event) => {
                  const color = colorFor(event)
                  return (
                    <button
                      key={`${event.id}-allday`}
                      type="button"
                      className={`allday-event ${event.id === '__draft__' ? 'draft' : ''}`}
                      style={{
                        borderColor: color,
                        background: `${color}22`,
                        color,
                      }}
                      onPointerDown={(pointer) =>
                        startAllDayDrag(pointer, event)
                      }
                      onPointerMove={moveAllDayDrag}
                      onPointerUp={(pointer) =>
                        void finishAllDayDrag(pointer, event)
                      }
                      onPointerCancel={() => {
                        allDayDragRef.current = null
                        setAllDayDrag(null)
                      }}
                      onClick={(pointer) =>
                        pointer.detail === 0 &&
                        event.id !== '__draft__' &&
                        onEdit(event)
                      }
                      title={event.title}
                    >
                      {event.icon && (
                        <span className="event-icon-glyph">{event.icon}</span>
                      )}
                      <span>{event.title}</span>
                    </button>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
      <div
        className="week-grid time-grid"
        style={{ gridTemplateColumns: columns, minWidth, width: gridWidth }}
      >
        <div>
          {HOURS.map((hour) => (
            <div className="time-label" key={hour}>
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {renderDays.map((day, dayIndex) => (
          <div
            className={`day-column ${sameDay(day, today) ? 'today-column' : ''} ${
              isWeekend(day) && !sameDay(day, today) ? 'weekend-column' : ''
            }`}
            key={day.toISOString()}
            data-day-index={dayIndex}
            onPointerDown={(event) => {
              if (event.pointerType === 'touch') {
                onTouchPointerDown(event, 'grid')
                return
              }
              startNewSelection(event, day)
            }}
            onPointerMove={(event) => {
              if (event.pointerType === 'touch') {
                onTouchPointerMove(event)
                return
              }
              moveNewSelection(event)
            }}
            onPointerUp={(event) => {
              if (event.pointerType === 'touch') {
                onTouchPointerUp(event)
                return
              }
              finishNewSelection(event)
            }}
            onPointerCancel={() => {
              if (touchStateRef.current.phase !== 'idle') {
                cancelTouch()
                return
              }
              cancelNewSelection()
            }}
          >
            {HOURS.map((hour) => (
              <button
                key={hour}
                type="button"
                className="hour-slot"
                aria-label={`Create event ${day.toDateString()} ${hour}:00`}
                onClick={(event) => {
                  if (event.detail === 0) onCreate(dateAtMinute(day, hour * 60))
                }}
              />
            ))}
            {sameDay(day, today) && (
              <div
                className="now-line"
                style={{ top: (nowMinute / 60) * rowHeight }}
              >
                <span />
              </div>
            )}
            {newSelection &&
              sameDay(newSelection.day, day) &&
              (() => {
                const start = Math.min(
                  newSelection.anchorMinute,
                  newSelection.currentMinute,
                )
                const end =
                  newSelection.anchorMinute === newSelection.currentMinute
                    ? Math.min(start + DEFAULT_DURATION, MINUTES_PER_DAY)
                    : Math.max(
                        newSelection.anchorMinute,
                        newSelection.currentMinute,
                      )
                return (
                  <div
                    className="calendar-selection"
                    style={{
                      top: (start / 60) * rowHeight,
                      height: Math.max(((end - start) / 60) * rowHeight, 2),
                    }}
                  >
                    <strong>
                      {String(Math.floor(start / 60)).padStart(2, '0')}:
                      {String(start % 60).padStart(2, '0')}
                    </strong>
                    <span>
                      – {String(Math.floor(end / 60) % 24).padStart(2, '0')}:
                      {String(end % 60).padStart(2, '0')}
                    </span>
                  </div>
                )
              })()}
            {(() => {
              const dayEvents = visibleEvents.flatMap((event) => {
                if (event.all_day) return []
                const segment = eventSegmentForDay(
                  event.start_at,
                  event.end_at,
                  day,
                )
                return segment ? [{ event, ...segment }] : []
              })
              const offsets = overlapOffsets(dayEvents)
              return dayEvents.map(({ event, start, end }) => {
                const eventStart = new Date(event.start_at)
                const eventEnd = new Date(event.end_at)
                const color = colorFor(event)
                const calColor = calendarColorFor(event)
                const key = occurrenceKey(event)
                const ol = offsets.get(key)
                const leftPct = ol
                  ? `${(ol.left * 100).toFixed(1)}%`
                  : undefined
                const widthPct = ol
                  ? `${(ol.width * 100).toFixed(1)}%`
                  : undefined
                const top =
                  (start.getHours() + start.getMinutes() / 60) * rowHeight
                const height = Math.max(
                  (5 / 60) * rowHeight, // floor at 5 minutes, not a fixed pixel min
                  ((end.getTime() - start.getTime()) / 3_600_000) * rowHeight,
                )
                const durationMinutes =
                  (end.getTime() - start.getTime()) / 60_000
                const showTime = height >= 34
                // Dim only events that already ended earlier today.
                const isPast =
                  sameDay(day, today) && end.getTime() <= Date.now()
                const isSelected = selectedKeys.has(key)
                const isMoving =
                  gesture?.mode === 'move' &&
                  gesture.events.some((item) => occurrenceKey(item) === key)
                const isResizing =
                  gesture?.mode === 'resize' &&
                  gesture.events[0] &&
                  occurrenceKey(gesture.events[0]) === key
                return (
                  <button
                    key={`${event.id}-${event.start_at}`}
                    type="button"
                    aria-label={event.title}
                    aria-pressed={isSelected}
                    className={`calendar-event ${event.id === '__draft__' ? 'draft' : ''} ${isSelected ? 'selected' : ''} ${
                      isPast ? 'past' : ''
                    } ${height < 40 ? 'compact' : ''} ${height < 20 && height >= 7 ? 'compact-short' : ''} ${!showTime && height >= 18 ? 'solo' : ''} ${height < 7 ? 'tiny' : ''} ${
                      (isMoving || isResizing) && !gesture?.settling
                        ? 'dragging'
                        : ''
                    } ${(isMoving || isResizing) && gesture?.settling ? 'settling' : ''}`}
                    style={
                      {
                        top,
                        height: isResizing
                          ? Math.max(
                              2,
                              height +
                                (resizingDay &&
                                sameDay(day, new Date(resizingDay))
                                  ? gesture.rawY
                                  : 0),
                            )
                          : height,
                        left: leftPct,
                        width: widthPct,
                        '--cal-color': calColor as string | undefined,
                        zIndex:
                          isMoving || isResizing
                            ? undefined
                            : 2 + (ol?.col ?? 0),
                        borderColor: color,
                        color,
                        background:
                          ol && ol.col > 0
                            ? `linear-gradient(${color}22, ${color}22), var(--bg-elevated)`
                            : `${color}22`,
                        transform: isMoving
                          ? `translate(${gesture.rawX}px, ${gesture.rawY}px)`
                          : undefined,
                      } as React.CSSProperties
                    }
                    onPointerDown={(pointer) => {
                      if (pointer.pointerType === 'touch') {
                        pointer.stopPropagation()
                        onTouchPointerDown(pointer, 'event', event)
                        return
                      }
                      startEventGesture(pointer, event, 'move')
                    }}
                    onPointerMove={moveEventGesture}
                    onPointerUp={(pointer) =>
                      void finishEventGesture(pointer, event)
                    }
                    onPointerCancel={(pointer) => {
                      if (pointer.pointerType === 'touch') cancelTouch()
                      else setCurrentGesture(null)
                    }}
                  >
                    <strong>
                      {event.icon && (
                        <span className="event-icon-glyph">{event.icon}</span>
                      )}
                      <span>{event.title}</span>
                    </strong>
                    {showTime && (
                      <span>
                        {eventStart.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                        –
                        {eventEnd.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                      </span>
                    )}
                    {durationMinutes >= 15 &&
                      end.getTime() === eventEnd.getTime() && (
                        <span
                          className="event-resize-handle"
                          aria-hidden="true"
                          onPointerDown={(pointer) => {
                            if (pointer.pointerType === 'touch') return
                            pointer.stopPropagation()
                            // FIX-1: record which day's segment is being resized
                            const col = pointer.currentTarget.closest(
                              '.day-column',
                            ) as HTMLElement | null
                            if (col?.dataset.dayIndex !== undefined) {
                              const dayIdx = Number(col.dataset.dayIndex)
                              setResizingDay(
                                renderDays[dayIdx]?.toDateString() ?? null,
                              )
                            }
                            startEventGesture(pointer, event, 'resize')
                          }}
                          onPointerMove={moveEventGesture}
                          onPointerUp={(pointer) => {
                            setResizingDay(null)
                            void finishEventGesture(pointer, event)
                          }}
                          onPointerCancel={(pointer) => {
                            if (pointer.pointerType === 'touch') cancelTouch()
                            else setCurrentGesture(null)
                          }}
                        />
                      )}
                  </button>
                )
              })
            })()}
          </div>
        ))}
      </div>
    </div>
  )
}
