import { useEffect, useMemo, useState } from 'react'
import { apiCall } from '../../lib/api'
import type { CalendarData, CalendarEvent } from './types'
import { occurrenceKey } from './types'

interface Props {
  monthDate: Date
  calendars: CalendarData[]
  refresh: number
  onCreate: (start: Date) => void
  onEdit: (event: CalendarEvent) => void
  draftEvent?: Partial<CalendarEvent> | null
  draftReplaceKey?: string | null
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Six Monday-first weeks covering the month the date falls in.
function monthGrid(monthDate: Date): Date[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7 // Monday = 0
  const start = new Date(first)
  start.setDate(first.getDate() - offset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export function MonthView({
  monthDate,
  calendars,
  refresh,
  onCreate,
  onEdit,
  draftEvent,
  draftReplaceKey,
}: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const cells = useMemo(() => monthGrid(monthDate), [monthDate])
  const month = monthDate.getMonth()
  const today = new Date()

  useEffect(() => {
    const from = cells[0]
    const to = new Date(cells[cells.length - 1])
    to.setDate(to.getDate() + 1)
    apiCall(
      `/api/events?from_date=${from.toISOString()}&to_date=${to.toISOString()}`,
    )
      .then(async (response) => response.ok && setEvents(await response.json()))
      .catch(() => setEvents([]))
  }, [cells, refresh])

  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7)),
    [cells],
  )

  const previewEvents = draftEvent?.start_at
    ? [
        // Hide only the previewed occurrence, not a recurring event's siblings.
        ...events.filter((event) =>
          draftReplaceKey ? occurrenceKey(event) !== draftReplaceKey : true,
        ),
        {
          ...draftEvent,
          id: draftEvent.id ?? '__draft__',
          calendar_id: draftEvent.calendar_id ?? '',
          title: draftEvent.title || 'Untitled event',
          start_at: draftEvent.start_at,
          end_at: draftEvent.end_at ?? draftEvent.start_at,
          all_day: draftEvent.all_day ?? false,
          timezone:
            draftEvent.timezone ??
            Intl.DateTimeFormat().resolvedOptions().timeZone,
          color_override: draftEvent.color_override,
        } satisfies CalendarEvent,
      ]
    : events

  const eventsFor = (day: Date) =>
    previewEvents
      .filter((event) => sameDay(new Date(event.start_at), day))
      .sort((a, b) => a.start_at.localeCompare(b.start_at))

  return (
    <div className="month-view">
      <div className="month-weekdays">
        {WEEKDAYS.map((label, i) => (
          <div key={label} className={i >= 5 ? 'weekend' : ''}>
            {label}
          </div>
        ))}
      </div>
      <div className="month-grid">
        {weeks.map((week, wi) => (
          <div className="month-week" key={wi}>
            {week.map((day) => {
              const outside = day.getMonth() !== month
              const isToday = sameDay(day, today)
              const dayEvents = eventsFor(day)
              return (
                <div
                  key={day.toISOString()}
                  className={`month-cell ${outside ? 'outside' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Create event on ${day.toDateString()}`}
                  onClick={() => onCreate(day)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onCreate(day)
                    }
                  }}
                >
                  <div
                    className={`month-daynum ${isToday ? 'today' : ''} ${
                      isWeekend(day) && !isToday ? 'weekend' : ''
                    }`}
                  >
                    {day.getDate()}
                  </div>
                  {dayEvents.slice(0, 3).map((event) => {
                    const calendar = calendars.find(
                      (item) => item.id === event.calendar_id,
                    )
                    const color =
                      event.color_override || calendar?.color || '#5B8AFD'
                    return (
                      <button
                        key={`${event.id}-${event.start_at}`}
                        className={`month-event ${event.id === '__draft__' ? 'draft' : ''}`}
                        style={{ background: `${color}22`, color }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEdit(event)
                        }}
                      >
                        {event.icon && (
                          <span className="event-icon-glyph">{event.icon}</span>
                        )}
                        <span>{event.title}</span>
                      </button>
                    )
                  })}
                  {dayEvents.length > 3 && (
                    <div className="month-more">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
