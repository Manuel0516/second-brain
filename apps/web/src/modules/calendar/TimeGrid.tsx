import { useCallback, useEffect, useRef, useState } from 'react'
import { apiCall } from '../../lib/api'
import {
  clampRowHeight,
  minuteAtPointer,
  resizeIsoRange,
  shiftIsoRange,
} from './time'
import type { CalendarData, CalendarEvent } from './types'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES_PER_DAY = 24 * 60
const DEFAULT_DURATION = 60
const TIME_COL = 52
const DRAG_THRESHOLD = 3

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
  deltaMinutes: number
  deltaDays: number
  moved: boolean
}

interface Props {
  days: Date[]
  rowHeight: number
  calendars: CalendarData[]
  refresh: number
  onCreate: (start: Date, end?: Date) => void
  onEdit: (event: CalendarEvent) => void
  onRowHeightChange: (value: number) => void
  onHorizontalNavigate: (days: number) => void
  draftEvent?: Partial<CalendarEvent> | null
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement

function dateAtMinute(day: Date, minute: number) {
  const date = new Date(day)
  date.setHours(0, minute, 0, 0)
  return date
}

export function TimeGrid({
  days,
  rowHeight,
  calendars,
  refresh,
  onCreate,
  onEdit,
  onRowHeightChange,
  onHorizontalNavigate,
  draftEvent,
}: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [newSelection, setNewSelection] = useState<NewSelection | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [interactionError, setInteractionError] = useState('')
  const [nowMinute, setNowMinute] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })
  const selectionRef = useRef<NewSelection | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const clipboardRef = useRef<string[]>([])
  const pasteTargetRef = useRef<Date | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const didInitialScroll = useRef(false)
  const horizontalWheel = useRef(0)

  const loadEvents = useCallback(() => {
    const from = new Date(days[0])
    from.setHours(0, 0, 0, 0)
    const to = new Date(days[days.length - 1])
    to.setDate(to.getDate() + 1)
    to.setHours(0, 0, 0, 0)
    apiCall(
      `/api/events?from_date=${from.toISOString()}&to_date=${to.toISOString()}`,
    )
      .then(async (response) => {
        if (response.ok) setEvents(await response.json())
      })
      .catch(() => setInteractionError('Could not load calendar events.'))
  }, [days])

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
      horizontalWheel.current += event.deltaX
      const days = Math.trunc(horizontalWheel.current / 80)
      if (!days) return
      horizontalWheel.current -= days * 80
      onHorizontalNavigate(days)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [rowHeight, onRowHeightChange, onHorizontalNavigate])

  useEffect(() => {
    const element = scrollRef.current
    if (!element || didInitialScroll.current) return
    didInitialScroll.current = true
    element.scrollTop = Math.max(0, 7 * rowHeight - 12)
  }, [rowHeight])

  const pasteEvents = useCallback(async () => {
    if (!clipboardRef.current.length) return
    const copied = events.filter((event) =>
      clipboardRef.current.includes(event.id),
    )
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
        event_ids: clipboardRef.current,
        target_start: target.toISOString(),
      }),
    })
    if (!response.ok) {
      setInteractionError('Could not paste the selected events.')
      return
    }
    const created: CalendarEvent[] = await response.json()
    setSelectedIds(new Set(created.map((event) => event.id)))
    pasteTargetRef.current = new Date(target.getTime() + 24 * 60 * 60 * 1000)
    loadEvents()
  }, [events, loadEvents])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      if (event.key === 'Escape') setSelectedIds(new Set())
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() === 'c' && selectedIds.size) {
        event.preventDefault()
        clipboardRef.current = [...selectedIds]
        pasteTargetRef.current = null
      }
      if (event.key.toLowerCase() === 'v' && clipboardRef.current.length) {
        event.preventDefault()
        void pasteEvents()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pasteEvents, selectedIds])

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
    setSelectedIds(new Set())
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

  const setCurrentGesture = (next: Gesture | null) => {
    gestureRef.current = next
    setGesture(next)
  }

  const startEventGesture = (
    pointer: React.PointerEvent<HTMLElement>,
    event: CalendarEvent,
    mode: Gesture['mode'],
  ) => {
    if (pointer.button !== 0) return
    pointer.stopPropagation()
    if (pointer.metaKey || pointer.ctrlKey) {
      if (mode === 'move') {
        setSelectedIds((current) => {
          const next = new Set(current)
          if (next.has(event.id)) next.delete(event.id)
          else next.add(event.id)
          return next
        })
      }
      return
    }
    const ids = selectedIds.has(event.id) ? selectedIds : new Set([event.id])
    setSelectedIds(ids)
    const selectedEvents =
      mode === 'resize'
        ? [event]
        : [
            ...new Map(
              events
                .filter((candidate) => ids.has(candidate.id))
                .map((candidate) => [candidate.id, candidate]),
            ).values(),
          ]
    const column = pointer.currentTarget.closest('.day-column') as HTMLElement
    pointer.currentTarget.setPointerCapture(pointer.pointerId)
    setCurrentGesture({
      mode,
      pointerId: pointer.pointerId,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      columnWidth: column?.getBoundingClientRect().width ?? 0,
      events: selectedEvents,
      deltaMinutes: 0,
      deltaDays: 0,
      moved: false,
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
    setCurrentGesture({
      ...current,
      moved,
      deltaMinutes: moved ? Math.round((deltaY / rowHeight) * 60) : 0,
      deltaDays:
        moved && current.mode === 'move' && current.columnWidth
          ? Math.round(deltaX / current.columnWidth)
          : 0,
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
    setCurrentGesture(null)
    if (!current.moved) {
      if (current.mode === 'move') onEdit(clickedEvent)
      return
    }
    const totalMinutes =
      current.deltaMinutes + current.deltaDays * MINUTES_PER_DAY
    const changes = current.events.map((event) => ({
      id: event.id,
      original_start_at: event.start_at,
      ...(current.mode === 'move'
        ? shiftIsoRange(event.start_at, event.end_at, totalMinutes)
        : resizeIsoRange(event.start_at, event.end_at, current.deltaMinutes)),
    }))
    setInteractionError('')
    const response = await apiCall('/api/events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: changes }),
    })
    if (!response.ok) {
      setInteractionError(
        current.mode === 'move'
          ? 'Could not move the selected events.'
          : 'Could not resize the event.',
      )
      return
    }
    loadEvents()
  }

  const columns = `${TIME_COL}px repeat(${days.length}, ${
    days.length === 1 ? '1fr' : 'minmax(96px, 1fr)'
  })`
  const minWidth = days.length === 1 ? 'auto' : TIME_COL + days.length * 96
  const today = new Date()
  const draft = draftEvent
  const draftId = draft?.id
  const draftStart = draft?.start_at ? new Date(draft.start_at) : null
  const previewDraft: CalendarEvent | null =
    draft && draftStart && !Number.isNaN(draftStart.getTime())
      ? {
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
        ...events.filter((event) => !draftId || event.id !== draftId),
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
      <div
        className="week-grid week-header"
        style={{ gridTemplateColumns: columns, minWidth }}
      >
        <div />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={[
              sameDay(day, today) ? 'today' : '',
              isWeekend(day) && !sameDay(day, today) ? 'weekend' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span>{day.toLocaleDateString([], { weekday: 'short' })}</span>
            <strong>{day.getDate()}</strong>
          </div>
        ))}
      </div>
      <div
        className="week-grid time-grid"
        style={{ gridTemplateColumns: columns, minWidth }}
      >
        <div>
          {HOURS.map((hour) => (
            <div className="time-label" key={hour}>
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {days.map((day) => (
          <div
            className={`day-column ${sameDay(day, today) ? 'today-column' : ''} ${
              isWeekend(day) && !sameDay(day, today) ? 'weekend-column' : ''
            }`}
            key={day.toISOString()}
            onPointerDown={(event) => startNewSelection(event, day)}
            onPointerMove={moveNewSelection}
            onPointerUp={finishNewSelection}
            onPointerCancel={() => updateNewSelection(null)}
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
            {visibleEvents
              .filter(
                (event) =>
                  sameDay(new Date(event.start_at), day) && !event.all_day,
              )
              .map((event) => {
                const start = new Date(event.start_at)
                const end = new Date(event.end_at)
                const calendar = calendars.find(
                  (item) => item.id === event.calendar_id,
                )
                const color =
                  event.color_override || calendar?.color || '#5B8AFD'
                const top =
                  (start.getHours() + start.getMinutes() / 60) * rowHeight
                const height = Math.max(
                  22,
                  ((end.getTime() - start.getTime()) / 3_600_000) * rowHeight,
                )
                const isSelected = selectedIds.has(event.id)
                const isMoving =
                  gesture?.mode === 'move' &&
                  gesture.events.some((item) => item.id === event.id)
                const isResizing =
                  gesture?.mode === 'resize' &&
                  gesture.events[0]?.id === event.id
                return (
                  <button
                    key={`${event.id}-${event.start_at}`}
                    type="button"
                    aria-pressed={isSelected}
                    className={`calendar-event ${event.id === '__draft__' ? 'draft' : ''} ${isSelected ? 'selected' : ''} ${
                      isMoving || isResizing ? 'dragging' : ''
                    }`}
                    style={{
                      top,
                      height: isResizing
                        ? Math.max(
                            2,
                            height + (gesture.deltaMinutes / 60) * rowHeight,
                          )
                        : height,
                      borderColor: color,
                      color,
                      background: `${color}22`,
                      transform: isMoving
                        ? `translate(${gesture.deltaDays * gesture.columnWidth}px, ${(gesture.deltaMinutes / 60) * rowHeight}px)`
                        : undefined,
                    }}
                    onPointerDown={(pointer) =>
                      startEventGesture(pointer, event, 'move')
                    }
                    onPointerMove={moveEventGesture}
                    onPointerUp={(pointer) =>
                      void finishEventGesture(pointer, event)
                    }
                    onPointerCancel={() => setCurrentGesture(null)}
                  >
                    <strong>{event.title}</strong>
                    {height >= 34 && (
                      <span>
                        {start.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                        –
                        {end.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                      </span>
                    )}
                    <span
                      className="event-resize-handle"
                      aria-hidden="true"
                      onPointerDown={(pointer) => {
                        pointer.stopPropagation()
                        startEventGesture(pointer, event, 'resize')
                      }}
                      onPointerMove={moveEventGesture}
                      onPointerUp={(pointer) =>
                        void finishEventGesture(pointer, event)
                      }
                      onPointerCancel={() => setCurrentGesture(null)}
                    />
                  </button>
                )
              })}
          </div>
        ))}
      </div>
    </div>
  )
}
