import { useState } from 'react'
import { apiCall } from '../../lib/api'
import { useSettings } from '../../context/SettingsContext'
import { onColor } from './colors'
import type { CalendarData } from './types'

function ColorField({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  const { settings } = useSettings()
  const colorPresets =
    settings.favorite_colors.length > 0
      ? settings.favorite_colors
      : ['#3B6FE0', '#2E9E6E', '#D6932B', '#8B5CF6', '#D9573F']
  const custom = !colorPresets.some(
    (preset) => preset.toLowerCase() === value.toLowerCase(),
  )
  return (
    <div className="cal-field">
      <span>Color</span>
      <div className="color-swatches">
        {colorPresets.map((preset) => {
          const active = value.toLowerCase() === preset.toLowerCase()
          return (
            <button
              key={preset}
              type="button"
              className={`color-swatch ${active ? 'active' : ''}`}
              aria-label={`Use color ${preset}`}
              aria-pressed={active}
              style={
                {
                  background: preset,
                  '--cc-on': onColor(preset),
                } as React.CSSProperties
              }
              onClick={() => onChange(preset)}
            />
          )
        })}
        <label
          className={`color-custom ${custom ? 'active' : ''}`}
          title="Custom color"
          style={
            {
              background: value,
              '--cc-on': onColor(value),
            } as React.CSSProperties
          }
        >
          <input
            type="color"
            aria-label="Custom color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <PencilIcon />
        </label>
      </div>
    </div>
  )
}

const PencilIcon = () => (
  <svg
    className="color-custom-icon"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14.5 3.5a2.1 2.1 0 0 1 3 3l-7.8 7.8-3.9.9.9-3.9z" />
    <path d="M12.5 5.5l2 2" />
  </svg>
)

interface Props {
  calendars: CalendarData[]
  onChanged: () => void
  open?: boolean
  onClose?: () => void
}

async function errorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null)
  if (typeof data?.detail === 'string') return data.detail
  if (Array.isArray(data?.detail) && typeof data.detail[0]?.msg === 'string')
    return data.detail[0].msg
  return fallback
}

export function Sidebar({ calendars, onChanged, open = true, onClose }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#8B5CF6')
  const [error, setError] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)

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
    <aside className={`calendar-sidebar ${open ? '' : 'closed'}`}>
      <div className="sidebar-title">
        <span>Calendars</span>
        <div className="sidebar-title-actions">
          <button onClick={() => setAdding(!adding)} aria-label="Add calendar">
            +
          </button>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close navigation"
            onClick={() => onClose?.()}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      </div>
      {adding && (
        <form className="cal-card" onSubmit={create}>
          <div className="cal-card-head">
            <h3>New calendar</h3>
            <button
              type="button"
              className="cal-card-close"
              aria-label="Close"
              onClick={() => {
                setAdding(false)
                setName('')
                setError('')
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
          <label className="cal-field">
            Name
            <input
              required
              placeholder="Calendar name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <ColorField value={color} onChange={setColor} />
          <div className="cal-card-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setAdding(false)
                setName('')
                setError('')
              }}
            >
              Cancel
            </button>
            <button type="submit" className="primary">
              Save
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {menuFor && (
        <div
          className="calendar-menu-overlay"
          role="presentation"
          onClick={() => setMenuFor(null)}
        />
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
            <span className="calendar-name">{calendar.name}</span>
            <button
              type="button"
              className="calendar-menu-btn"
              aria-label={`${calendar.name} options`}
              aria-haspopup="menu"
              aria-expanded={menuFor === calendar.id}
              onClick={() =>
                setMenuFor((current) =>
                  current === calendar.id ? null : calendar.id,
                )
              }
            >
              ⋯
            </button>
            {menuFor === calendar.id && (
              <div className="cal-card calendar-menu" role="menu">
                <div className="cal-card-head">
                  <h3>Edit calendar</h3>
                  <button
                    type="button"
                    className="cal-card-close"
                    aria-label="Close"
                    onClick={() => setMenuFor(null)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    >
                      <path d="M5 5l10 10M15 5L5 15" />
                    </svg>
                  </button>
                </div>
                <label className="cal-field">
                  Name
                  <input
                    aria-label={`${calendar.name} name`}
                    defaultValue={calendar.name}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setMenuFor(null)
                    }}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value !== calendar.name &&
                      patch(calendar, { name: e.target.value })
                    }
                  />
                </label>
                <ColorField
                  value={calendar.color}
                  onChange={(c) => patch(calendar, { color: c })}
                />
                <div className="cal-card-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setMenuFor(null)}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="integration">
        <span className="integration-title">Integrations</span>
        <button
          type="button"
          className="integration-button"
          disabled
          title="Google OAuth will be added in the sync phase"
        >
          <span className="integration-icon" aria-hidden="true">
            G
          </span>
          <span className="integration-label">Import from Google Calendar</span>
          <span className="integration-status">Soon</span>
        </button>
      </div>
    </aside>
  )
}
