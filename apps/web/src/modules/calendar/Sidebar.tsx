import { useState } from 'react'
import { apiCall } from '../../lib/api'
import type { CalendarData } from './types'

interface Props {
  calendars: CalendarData[]
  onChanged: () => void
}

async function errorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null)
  if (typeof data?.detail === 'string') return data.detail
  if (Array.isArray(data?.detail) && typeof data.detail[0]?.msg === 'string')
    return data.detail[0].msg
  return fallback
}

export function Sidebar({ calendars, onChanged }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#8B5CF6')
  const [error, setError] = useState('')

  const patch = async (calendar: CalendarData, values: object) => {
    setError('')
    const response = await apiCall(`/api/calendars/${calendar.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (response.ok) onChanged()
    else
      setError(await errorMessage(response, 'Could not update the calendar.'))
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const response = await apiCall('/api/calendars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })
    if (response.ok) {
      setName('')
      setAdding(false)
      onChanged()
    } else
      setError(await errorMessage(response, 'Could not create the calendar.'))
  }

  return (
    <aside className="calendar-sidebar">
      <div className="sidebar-title">
        <span>Calendars</span>
        <button onClick={() => setAdding(!adding)} aria-label="Add calendar">
          +
        </button>
      </div>
      {adding && (
        <form className="add-calendar" onSubmit={create}>
          <input
            required
            placeholder="Calendar name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <button type="submit">Save</button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="calendar-list">
        {calendars.map((calendar) => (
          <div key={calendar.id} className="calendar-row">
            <button
              className="visibility"
              aria-label={`${calendar.is_visible ? 'Hide' : 'Show'} ${calendar.name}`}
              style={{
                background: calendar.is_visible
                  ? calendar.color
                  : 'transparent',
                borderColor: calendar.color,
              }}
              onClick={() =>
                patch(calendar, { is_visible: !calendar.is_visible })
              }
            />
            <input
              aria-label={`${calendar.name} name`}
              defaultValue={calendar.name}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== calendar.name &&
                patch(calendar, { name: e.target.value })
              }
            />
            <input
              aria-label={`${calendar.name} color`}
              type="color"
              value={calendar.color}
              onChange={(e) => patch(calendar, { color: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="integration">
        <span>Google Calendar</span>
        <button disabled title="Google OAuth will be added in the sync phase">
          Connect later
        </button>
      </div>
    </aside>
  )
}
