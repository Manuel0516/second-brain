import { useEffect, useState } from 'react'
import { apiCall } from '../../lib/api'

interface Calendar {
  id: string
  name: string
  color: string
  is_visible: boolean
}

interface SidebarProps {
  onVisibilityChange?: (calendarId: string, visible: boolean) => void
}

export function Sidebar({ onVisibilityChange }: SidebarProps) {
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [loading, setLoading] = useState(true)
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(
    new Set(),
  )

  useEffect(() => {
    const fetchCalendars = async () => {
      setLoading(true)
      try {
        const response = await apiCall('/api/calendars')
        if (response.ok) {
          const data = await response.json()
          setCalendars(data.calendars || [])
          // Initialize visibility from server
          const visible = new Set(
            data.calendars
              .filter((cal: Calendar) => cal.is_visible)
              .map((cal: Calendar) => cal.id),
          )
          setVisibleCalendars(visible)
        }
      } catch {
        // Handle error silently for MVP
      } finally {
        setLoading(false)
      }
    }

    fetchCalendars()
  }, [])

  const handleToggleVisibility = (calendarId: string, checked: boolean) => {
    const newVisible = new Set(visibleCalendars)
    if (checked) {
      newVisible.add(calendarId)
    } else {
      newVisible.delete(calendarId)
    }
    setVisibleCalendars(newVisible)
    onVisibilityChange?.(calendarId, checked)
  }

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-elevated)] p-6 sm:block">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        Calendars
      </h2>

      {loading ? (
        <div className="mt-6 flex justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
        </div>
      ) : calendars.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-tertiary)]">
          No calendars yet
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {calendars.map((calendar) => (
            <label
              key={calendar.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--bg-base)]"
            >
              <input
                type="checkbox"
                checked={visibleCalendars.has(calendar.id)}
                onChange={(e) =>
                  handleToggleVisibility(calendar.id, e.target.checked)
                }
                className="h-4 w-4 cursor-pointer rounded border-[var(--border)] accent-[var(--accent)]"
              />
              <div className="flex flex-1 items-center gap-2">
                <div
                  className="h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: calendar.color }}
                />
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {calendar.name}
                </span>
              </div>
            </label>
          ))}
        </div>
      )}
    </aside>
  )
}
