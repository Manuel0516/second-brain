import { useEffect, useState } from 'react'
import { Segmented } from '../../components/Segmented'
import { SettingsCard } from '../../components/SettingsCard'
import { FavoriteColorEditor } from '../../components/FavoritesEditor'
import { ToggleRow } from '../../components/ToggleRow'
import { useSettings } from '../../context/SettingsContext'
import { apiCall } from '../../lib/api'
import type { CalendarData } from '../calendar/types'

const SegmentControl = Segmented

export function CalendarSettings() {
  const { settings, patch } = useSettings()
  const [calendars, setCalendars] = useState<CalendarData[]>([])

  useEffect(() => {
    apiCall('/api/calendars')
      .then(async (response) => {
        if (response.ok) setCalendars(await response.json())
      })
      .catch(() => {})
  }, [])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="settings-header">
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Calendar
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            margin: '4px 0 0',
          }}
        >
          Manage your favourite colours and calendar defaults.
        </p>
      </div>

      {/* Favourite colours */}
      <SettingsCard
        title="Favourite colours"
        description="Shown first in the event colour picker."
      >
        <FavoriteColorEditor
          colors={settings.favorite_colors}
          onChange={(favorite_colors) => patch({ favorite_colors })}
        />
      </SettingsCard>

      {/* Calendar defaults */}
      <SettingsCard title="Calendar defaults">
        <div className="settings-field-row" style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="settings-default-duration"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Default event duration
          </label>
          <select
            id="settings-default-duration"
            value={settings.default_event_minutes}
            onChange={(e) =>
              patch({ default_event_minutes: Number(e.target.value) })
            }
            style={{
              minHeight: 38,
              border: '1px solid var(--border-strong)',
              borderRadius: 7,
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 13,
              padding: '8px 10px',
              outline: 'none',
              cursor: 'pointer',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-tint)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-strong)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
            <option value={120}>2 hours</option>
          </select>
        </div>

        <div className="settings-field-row" style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="settings-default-cal"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Default calendar
          </label>
          <select
            id="settings-default-cal"
            value={settings.default_calendar_id ?? ''}
            onChange={(e) =>
              patch({ default_calendar_id: e.target.value || null })
            }
            style={{
              minHeight: 38,
              border: '1px solid var(--border-strong)',
              borderRadius: 7,
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 13,
              padding: '8px 10px',
              outline: 'none',
              cursor: 'pointer',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-tint)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-strong)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <option value="">None</option>
            {calendars.map((cal) => (
              <option key={cal.id} value={cal.id}>
                {cal.name}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-field-row" style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="settings-default-reminder"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Default reminder
          </label>
          <select
            id="settings-default-reminder"
            value={settings.default_reminder_minutes?.toString() ?? ''}
            onChange={(e) =>
              patch({
                default_reminder_minutes: e.target.value
                  ? Number(e.target.value)
                  : null,
              })
            }
            style={{
              minHeight: 38,
              border: '1px solid var(--border-strong)',
              borderRadius: 7,
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 13,
              padding: '8px 10px',
              outline: 'none',
              cursor: 'pointer',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-tint)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-strong)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <option value="">None</option>
            <option value={5}>5 minutes before</option>
            <option value={15}>15 minutes before</option>
            <option value={30}>30 minutes before</option>
            <option value={60}>1 hour before</option>
            <option value={1440}>1 day before</option>
          </select>
        </div>

        <ToggleRow
          label="Show weekends"
          checked={settings.show_weekends}
          onChange={(v) => patch({ show_weekends: v })}
        />
        <ToggleRow
          label="Dim past events"
          checked={settings.dim_past_events}
          onChange={(v) => patch({ dim_past_events: v })}
        />
      </SettingsCard>

      {/* Calendar preferences (moved from General) */}
      <SettingsCard title="Calendar preferences">
        <div className="settings-field-row" style={{ display: 'grid', gap: 6 }}>
          <span
            id="settings-cweekstart-label"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Week starts on
          </span>
          <div role="group" aria-labelledby="settings-cweekstart-label">
            <SegmentControl
              value={settings.week_start}
              options={['monday', 'sunday']}
              labels={{ monday: 'Monday', sunday: 'Sunday' }}
              onChange={(v) => patch({ week_start: v })}
            />
          </div>
        </div>
        <div className="settings-field-row" style={{ display: 'grid', gap: 6 }}>
          <span
            id="settings-cdefaultview-label"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Default view
          </span>
          <div role="group" aria-labelledby="settings-cdefaultview-label">
            <SegmentControl
              value={settings.default_view}
              options={['day', 'week', 'month']}
              labels={{ day: 'Day', week: 'Week', month: 'Month' }}
              onChange={(v) => patch({ default_view: v })}
            />
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
