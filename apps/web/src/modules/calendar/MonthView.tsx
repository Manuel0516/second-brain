import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  addMonths,
  subMonths,
} from 'date-fns'
import { useEffect, useState } from 'react'
import { apiCall } from '../../lib/api'
import { EventDetail } from './EventDetail'

interface CalendarEvent {
  id: string
  title: string
  description?: string
  start_at: string
  end_at: string
  all_day: boolean
  color_override?: string
  calendar: {
    id: string
    name: string
    color: string
  }
}

interface MonthViewProps {
  onNavigate?: (date: Date) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function MonthView({ onNavigate }: MonthViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(monthEnd)

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  // Fetch events for the month
  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true)
      try {
        const from = calendarStart.toISOString().split('T')[0]
        const to = calendarEnd.toISOString().split('T')[0]
        const response = await apiCall(`/api/events?from=${from}&to=${to}`)
        if (response.ok) {
          const data = await response.json()
          setEvents(data.events || [])
        }
      } catch {
        // Handle error silently for MVP
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()
  }, [currentDate])

  const handlePrevMonth = () => {
    const newDate = subMonths(currentDate, 1)
    setCurrentDate(newDate)
    onNavigate?.(newDate)
  }

  const handleNextMonth = () => {
    const newDate = addMonths(currentDate, 1)
    setCurrentDate(newDate)
    onNavigate?.(newDate)
  }

  const getEventsForDay = (day: Date): CalendarEvent[] => {
    const dayStr = format(day, 'yyyy-MM-dd')
    return events.filter((event) => {
      const eventStart = event.start_at.split('T')[0]
      const eventEnd = event.end_at.split('T')[0]
      return eventStart <= dayStr && dayStr <= eventEnd
    })
  }

  return (
    <div className="flex-1 space-y-4">
      {/* Header with navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
          {format(currentDate, 'MMMM yyyy')}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handlePrevMonth}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
          >
            Today
          </button>
          <button
            onClick={handleNextMonth}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
          >
            Next
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-0 border-b border-[var(--border)]">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="border-r border-[var(--border)] px-4 py-3 text-center text-sm font-medium text-[var(--text-secondary)] last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-0">
          {days.map((day) => {
            const dayEvents = getEventsForDay(day)
            const isCurrentMonth = isSameMonth(day, currentDate)
            const isToday =
              format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

            return (
              <div
                key={format(day, 'yyyy-MM-dd')}
                className={`min-h-24 border-r border-b border-[var(--border)] p-2 last:border-r-0 ${
                  isCurrentMonth
                    ? 'bg-[var(--bg-base)]'
                    : 'bg-[var(--bg-raised)]'
                } ${isToday ? 'ring-1 ring-inset ring-[var(--accent)]' : ''}`}
              >
                <div
                  className={`mb-2 text-sm font-medium ${
                    isCurrentMonth
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-tertiary)]'
                  }`}
                >
                  {format(day, 'd')}
                </div>

                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map((event) => (
                    <button
                      key={event.id}
                      onClick={() => setSelectedEvent(event)}
                      className="block w-full truncate rounded text-xs px-2 py-1 text-left font-medium text-white transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor:
                          event.color_override || event.calendar.color,
                      }}
                      title={event.title}
                    >
                      {event.title}
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-[var(--text-tertiary)] px-2">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
        </div>
      )}

      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}
