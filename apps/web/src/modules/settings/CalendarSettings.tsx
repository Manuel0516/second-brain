import { useCallback, useEffect, useRef, useState } from 'react'
import { Segmented } from '../../components/Segmented'
import { SettingsCard } from '../../components/SettingsCard'
import { useSettings } from '../../context/SettingsContext'
import { apiCall } from '../../lib/api'
import type { CalendarData } from '../calendar/types'

const RemoveIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
)

function EmojiTile({
  emoji,
  onRemove,
}: {
  emoji: string
  onRemove: () => void
}) {
  return (
    <div
      className="fav-tile"
      style={{
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--r-sm)',
        background: 'var(--bg-raised)',
        border: '1px solid var(--border-strong)',
        fontSize: 18,
      }}
    >
      <span className="event-icon-glyph">{emoji}</span>
      <button
        type="button"
        className="fav-remove"
        onClick={onRemove}
        aria-label={`Remove ${emoji}`}
      >
        <RemoveIcon />
      </button>
    </div>
  )
}

function ColorSwatch({
  color,
  onRemove,
}: {
  color: string
  onRemove: () => void
}) {
  return (
    <div
      className="fav-tile"
      style={{
        width: 21,
        height: 21,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        boxShadow: '0 0 0 1px var(--border-strong)',
      }}
    >
      <button
        type="button"
        className="fav-remove"
        onClick={onRemove}
        aria-label={`Remove colour ${color}`}
      >
        <RemoveIcon />
      </button>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      className="toggle-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 38,
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
        {label}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ cursor: 'pointer' }}
      />
    </label>
  )
}

const SegmentControl = Segmented

export function CalendarSettings() {
  const { settings, patch } = useSettings()
  const [calendars, setCalendars] = useState<CalendarData[]>([])
  const [emojiInput, setEmojiInput] = useState('')
  const emojiInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    apiCall('/api/calendars')
      .then(async (response) => {
        if (response.ok) setCalendars(await response.json())
      })
      .catch(() => {})
  }, [])

  const addEmoji = useCallback(() => {
    const trimmed = emojiInput.trim()
    if (!trimmed || settings.favorite_emojis.length >= 32) return
    if (trimmed.length > 8) {
      // Still allow it but truncate display to 8 chars
    }
    const updated = [...settings.favorite_emojis, trimmed]
    patch({ favorite_emojis: updated })
    setEmojiInput('')
    emojiInputRef.current?.focus()
  }, [emojiInput, settings.favorite_emojis, patch])

  const removeEmoji = useCallback(
    (index: number) => {
      const updated = settings.favorite_emojis.filter((_, i) => i !== index)
      patch({ favorite_emojis: updated })
    },
    [settings.favorite_emojis, patch],
  )

  const addColor = useCallback(
    (color: string) => {
      if (settings.favorite_colors.length >= 24) return
      const updated = [...settings.favorite_colors, color]
      patch({ favorite_colors: updated })
    },
    [settings.favorite_colors, patch],
  )

  const removeColor = useCallback(
    (index: number) => {
      const updated = settings.favorite_colors.filter((_, i) => i !== index)
      patch({ favorite_colors: updated })
    },
    [settings.favorite_colors, patch],
  )

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
          Manage your favourite emojis, colours, and calendar defaults.
        </p>
      </div>

      {/* Favourite emojis */}
      <SettingsCard
        title="Favourite emojis"
        description="Shown first in the event icon picker."
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
          }}
        >
          {settings.favorite_emojis.map((emoji, i) => (
            <EmojiTile
              key={`${emoji}-${i}`}
              emoji={emoji}
              onRemove={() => removeEmoji(i)}
            />
          ))}
          <div
            className="editor-icon-custom"
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--r-sm)',
              border: '1px dashed var(--border-strong)',
              background: 'transparent',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <input
              ref={emojiInputRef}
              type="text"
              value={emojiInput}
              onChange={(e) => setEmojiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addEmoji()
                }
              }}
              aria-label="Add emoji"
              placeholder="➕"
              maxLength={8}
              className="event-icon-glyph"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: 'transparent',
                textAlign: 'center',
                fontSize: 16,
                color: 'var(--text-secondary)',
                outline: 'none',
                fontFamily:
                  '"Symbols Nerd Font", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
              }}
              onFocus={(e) => {
                e.currentTarget.parentElement!.style.borderColor =
                  'var(--accent)'
              }}
              onBlur={(e) => {
                e.currentTarget.parentElement!.style.borderColor =
                  'var(--border-strong)'
                if (e.currentTarget.value.trim()) addEmoji()
              }}
            />
          </div>
        </div>
      </SettingsCard>

      {/* Favourite colours */}
      <SettingsCard
        title="Favourite colours"
        description="Shown first in the event colour picker."
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {settings.favorite_colors.map((color, i) => (
            <ColorSwatch
              key={`${color}-${i}`}
              color={color}
              onRemove={() => removeColor(i)}
            />
          ))}
          <label
            className="color-custom"
            title="Add colour"
            style={{
              width: 21,
              height: 21,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              background: 'var(--bg-elevated)',
              border: '1px dashed var(--border-strong)',
              position: 'relative',
            }}
          >
            <input
              type="color"
              aria-label="Add colour"
              onChange={(e) => addColor(e.target.value)}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0,
                cursor: 'pointer',
                width: '100%',
                height: '100%',
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                lineHeight: 1,
              }}
            >
              +
            </span>
          </label>
        </div>
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
