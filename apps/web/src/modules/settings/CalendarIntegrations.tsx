import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Segmented } from '../../components/Segmented'
import { SettingsCard } from '../../components/SettingsCard'
import { useSettings } from '../../context/SettingsContext'
import { apiCall, apiErrorMessage } from '../../lib/api'
import { onColor } from '../calendar/colors'
import type { CalendarData } from '../calendar/types'

interface GoogleStatus {
  configured: boolean
  connected: boolean
  pending: boolean
  calendar_count: number
}

interface RemoteCalendar {
  id: string
  name: string
  color: string
  primary: boolean
  already_synced: boolean
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const inputStyle: React.CSSProperties = {
  minHeight: 38,
  border: '1px solid var(--border-strong)',
  borderRadius: 7,
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: 13,
  padding: '8px 10px',
  outline: 'none',
}

const buttonStyle: React.CSSProperties = {
  height: 34,
  padding: '0 14px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--r-md)',
  background: 'var(--bg-raised)',
  color: 'var(--text-primary)',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
}

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  border: '1px solid var(--accent-tint-border)',
  background: 'var(--accent-tint)',
  color: 'var(--accent)',
}

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'transparent',
  color: '#D9573F',
}

const OAUTH_ERRORS: Record<string, string> = {
  invalid_state: 'The sign-in link expired. Try connecting again.',
  missing_code: 'Google did not return an authorization code.',
  token_exchange_failed: 'Could not complete the Google sign-in.',
  access_denied: 'Google access was denied.',
}

function lastSyncedLabel(value: string | null | undefined) {
  if (!value) return 'never synced'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'never synced'
  return `synced ${date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

interface Props {
  calendars: CalendarData[]
  onChanged: () => void
}

export function CalendarIntegrations({ calendars, onChanged }: Props) {
  const { settings } = useSettings()
  const colorPresets =
    settings.favorite_colors.length > 0
      ? settings.favorite_colors
      : ['#3B6FE0', '#2E9E6E', '#D6932B', '#8B5CF6', '#D9573F']
  const [, setSearchParams] = useSearchParams()
  // Read the OAuth redirect result (?google=connected|error) exactly once.
  const [oauth] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return {
      result: params.get('google'),
      reason: params.get('reason') ?? '',
    }
  })
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [error, setError] = useState(
    oauth.result && oauth.result !== 'connected'
      ? (OAUTH_ERRORS[oauth.reason] ?? 'Google sign-in failed. Try again.')
      : '',
  )
  const [notice, setNotice] = useState(
    oauth.result === 'connected'
      ? 'Google account connected. Choose which calendars to sync.'
      : '',
  )
  const [busy, setBusy] = useState(false)

  // Google calendar picker
  const [picker, setPicker] = useState<RemoteCalendar[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [direction, setDirection] = useState<'pull' | 'push'>('pull')

  // ICS form
  const [icsUrl, setIcsUrl] = useState('')
  const [icsName, setIcsName] = useState('')
  const [icsColor, setIcsColor] = useState('#2E9E6E')

  const [confirmRemove, setConfirmRemove] = useState<CalendarData | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const synced = calendars.filter((calendar) => calendar.source !== 'local')

  const loadStatus = useCallback(() => {
    apiCall('/api/integrations/google/status')
      .then(async (response) => {
        if (response.ok) setStatus(await response.json())
      })
      .catch(() => {})
  }, [])

  useEffect(loadStatus, [loadStatus])

  const openPicker = useCallback(async () => {
    setError('')
    setBusy(true)
    try {
      const response = await apiCall('/api/integrations/google/calendars')
      if (!response.ok) {
        setError(
          await apiErrorMessage(response, 'Could not list Google calendars.'),
        )
        return
      }
      setPicker(await response.json())
      setPicked(new Set())
    } finally {
      setBusy(false)
    }
  }, [])

  // After the OAuth redirect: clean the URL and open the calendar picker.
  useEffect(() => {
    if (!oauth.result) return
    if (oauth.result === 'connected') {
      // Defer so state updates happen outside the effect's synchronous body.
      const timer = setTimeout(() => void openPicker(), 0)
      const next = new URLSearchParams(window.location.search)
      next.delete('google')
      next.delete('reason')
      setSearchParams(next, { replace: true })
      return () => clearTimeout(timer)
    }
    const next = new URLSearchParams(window.location.search)
    next.delete('google')
    next.delete('reason')
    setSearchParams(next, { replace: true })
  }, [oauth, setSearchParams, openPicker])

  const connect = async () => {
    setError('')
    const response = await apiCall('/api/integrations/google/connect', {
      method: 'POST',
    })
    if (!response.ok) {
      setError(
        await apiErrorMessage(response, 'Could not start the Google sign-in.'),
      )
      return
    }
    const data = await response.json()
    window.location.assign(data.auth_url)
  }

  const addPicked = async () => {
    if (!picker) return
    const chosen = picker.filter((remote) => picked.has(remote.id))
    if (chosen.length === 0) return
    setError('')
    setBusy(true)
    try {
      const response = await apiCall('/api/integrations/google/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendars: chosen.map(({ id, name, color }) => ({
            id,
            name,
            color,
          })),
          sync_direction: direction,
        }),
      })
      if (!response.ok) {
        setError(
          await apiErrorMessage(response, 'Could not add the calendars.'),
        )
        return
      }
      setPicker(null)
      setNotice('Calendars added and synced.')
      loadStatus()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setConfirmDisconnect(false)
    setError('')
    const response = await apiCall('/api/integrations/google/disconnect', {
      method: 'POST',
    })
    if (!response.ok) {
      setError(await apiErrorMessage(response, 'Could not disconnect Google.'))
      return
    }
    setPicker(null)
    setNotice('Google account disconnected.')
    loadStatus()
    onChanged()
  }

  const addIcs = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const response = await apiCall('/api/integrations/ics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: icsUrl, name: icsName, color: icsColor }),
      })
      if (!response.ok) {
        setError(
          await apiErrorMessage(response, 'Could not subscribe to the feed.'),
        )
        return
      }
      setIcsUrl('')
      setIcsName('')
      setNotice('ICS feed subscribed.')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const syncNow = async (calendar: CalendarData) => {
    setError('')
    const response = await apiCall(
      `/api/integrations/calendars/${calendar.id}/sync`,
      { method: 'POST' },
    )
    if (!response.ok) {
      setError(await apiErrorMessage(response, 'Sync failed.'))
      return
    }
    const result = await response.json()
    setNotice(
      `"${calendar.name}" synced — ${result.created} new, ` +
        `${result.updated} updated, ${result.deleted} removed.`,
    )
    onChanged()
  }

  const toggleDirection = async (calendar: CalendarData) => {
    setError('')
    const next = calendar.sync_direction === 'push' ? 'pull' : 'push'
    const response = await apiCall(
      `/api/integrations/calendars/${calendar.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_direction: next }),
      },
    )
    if (!response.ok) {
      setError(
        await apiErrorMessage(response, 'Could not change the sync mode.'),
      )
      return
    }
    onChanged()
  }

  const remove = async (calendar: CalendarData) => {
    setConfirmRemove(null)
    setError('')
    const response = await apiCall(
      `/api/integrations/calendars/${calendar.id}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      setError(
        await apiErrorMessage(response, 'Could not remove the calendar.'),
      )
      return
    }
    setNotice(`"${calendar.name}" removed.`)
    loadStatus()
    onChanged()
  }

  return (
    <>
      {(error || notice) && (
        <p
          role={error ? 'alert' : 'status'}
          style={{
            margin: 0,
            fontSize: 12,
            color: error ? '#D9573F' : '#2E9E6E',
          }}
        >
          {error || notice}
        </p>
      )}

      {/* Google Calendar */}
      <SettingsCard
        title="Google Calendar"
        description="Two-way sync with your Google calendars."
      >
        {status && !status.configured ? (
          <p
            style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}
          >
            Google sync is not configured on this server. Set{' '}
            <code style={{ font: '12px var(--font-mono)' }}>
              GOOGLE_CLIENT_ID
            </code>
            ,{' '}
            <code style={{ font: '12px var(--font-mono)' }}>
              GOOGLE_CLIENT_SECRET
            </code>{' '}
            and{' '}
            <code style={{ font: '12px var(--font-mono)' }}>
              GOOGLE_TOKEN_ENCRYPTION_KEY
            </code>{' '}
            to enable it.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!status?.connected && (
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={() => void connect()}
              >
                Connect Google account
              </button>
            )}
            {status?.connected && (
              <>
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={busy}
                  onClick={() => void openPicker()}
                >
                  {picker ? 'Refresh calendar list' : 'Add Google calendars'}
                </button>
                <button
                  type="button"
                  style={dangerButtonStyle}
                  onClick={() => setConfirmDisconnect(true)}
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        )}

        {picker && (
          <div style={{ display: 'grid', gap: 10 }}>
            <span style={labelStyle}>Choose calendars to sync</span>
            <div style={{ display: 'grid', gap: 4 }}>
              {picker.map((remote) => (
                <label
                  key={remote.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 44,
                    padding: '0 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--bg-elevated)',
                    fontSize: 13,
                    color: remote.already_synced
                      ? 'var(--text-tertiary)'
                      : 'var(--text-primary)',
                    cursor: remote.already_synced ? 'default' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={remote.already_synced}
                    checked={remote.already_synced || picked.has(remote.id)}
                    onChange={(e) =>
                      setPicked((current) => {
                        const next = new Set(current)
                        if (e.target.checked) next.add(remote.id)
                        else next.delete(remote.id)
                        return next
                      })
                    }
                  />
                  <span
                    aria-hidden="true"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 4,
                      background: remote.color,
                      flex: '0 0 auto',
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {remote.name}
                  </span>
                  {remote.primary && (
                    <span style={{ ...labelStyle, flex: '0 0 auto' }}>
                      Primary
                    </span>
                  )}
                  {remote.already_synced && (
                    <span style={{ ...labelStyle, flex: '0 0 auto' }}>
                      Synced
                    </span>
                  )}
                </label>
              ))}
            </div>
            <div style={{ display: 'grid', gap: 6, maxWidth: 320 }}>
              <span id="google-sync-direction-label" style={labelStyle}>
                Sync direction
              </span>
              <div role="group" aria-labelledby="google-sync-direction-label">
                <Segmented
                  value={direction}
                  options={['pull', 'push']}
                  labels={{
                    pull: 'Google → here',
                    push: 'Two-way',
                  }}
                  onChange={setDirection}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => setPicker(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={primaryButtonStyle}
                disabled={busy || picked.size === 0}
                onClick={() => void addPicked()}
              >
                Add {picked.size > 0 ? picked.size : ''} selected
              </button>
            </div>
          </div>
        )}
      </SettingsCard>

      {/* ICS subscriptions */}
      <SettingsCard
        title="Calendar subscriptions (ICS)"
        description="Subscribe to a read-only calendar feed by URL — university timetables, team schedules, holidays."
      >
        <form onSubmit={addIcs} style={{ display: 'grid', gap: 12 }}>
          <div
            className="settings-field-row"
            style={{ display: 'grid', gap: 6 }}
          >
            <label htmlFor="ics-feed-url" style={labelStyle}>
              Feed URL
            </label>
            <input
              id="ics-feed-url"
              type="url"
              required
              placeholder="https://example.com/calendar.ics"
              value={icsUrl}
              onChange={(e) => setIcsUrl(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: '1fr auto',
              alignItems: 'start',
            }}
          >
            <div
              className="settings-field-row"
              style={{ display: 'grid', gap: 6 }}
            >
              <label htmlFor="ics-feed-name" style={labelStyle}>
                Name
              </label>
              <input
                id="ics-feed-name"
                required
                placeholder="University timetable"
                value={icsName}
                onChange={(e) => setIcsName(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div
              className="settings-field-row"
              style={{ display: 'grid', gap: 6 }}
            >
              <span style={labelStyle}>Color</span>
              <div className="color-swatches" style={{ minHeight: 38 }}>
                {colorPresets.map((preset) => {
                  const active = icsColor.toLowerCase() === preset.toLowerCase()
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
                      onClick={() => setIcsColor(preset)}
                    />
                  )
                })}
                <label
                  className={`color-custom ${
                    colorPresets.some(
                      (preset) =>
                        preset.toLowerCase() === icsColor.toLowerCase(),
                    )
                      ? ''
                      : 'active'
                  }`}
                  title="Custom color"
                  style={
                    {
                      background: icsColor,
                      '--cc-on': onColor(icsColor),
                    } as React.CSSProperties
                  }
                >
                  <input
                    id="ics-feed-color"
                    type="color"
                    aria-label="Custom calendar color"
                    value={icsColor}
                    onChange={(e) => setIcsColor(e.target.value)}
                  />
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
                </label>
              </div>
            </div>
          </div>
          <div>
            <button type="submit" style={primaryButtonStyle} disabled={busy}>
              Subscribe
            </button>
          </div>
        </form>
      </SettingsCard>

      {/* Synced calendars */}
      {synced.length > 0 && (
        <SettingsCard
          title="Synced calendars"
          description="Calendars mirrored from Google or ICS feeds."
        >
          <div style={{ display: 'grid', gap: 4 }}>
            {synced.map((calendar) => (
              <div
                key={calendar.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 44,
                  padding: '4px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--bg-elevated)',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 4,
                    background: calendar.color,
                    flex: '0 0 auto',
                  }}
                />
                <div style={{ flex: 1, minWidth: 120, display: 'grid' }}>
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {calendar.name}
                  </span>
                  <span
                    style={{
                      font: '10px var(--font-mono)',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    {calendar.source === 'google' ? 'Google' : 'ICS'} ·{' '}
                    {calendar.source === 'google'
                      ? calendar.sync_direction === 'push'
                        ? 'two-way'
                        : 'pull only'
                      : 'read-only'}{' '}
                    · {lastSyncedLabel(calendar.last_synced_at)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
                  <button
                    type="button"
                    style={{ ...buttonStyle, height: 30, padding: '0 10px' }}
                    onClick={() => void syncNow(calendar)}
                  >
                    Sync now
                  </button>
                  {calendar.source === 'google' && (
                    <button
                      type="button"
                      style={{ ...buttonStyle, height: 30, padding: '0 10px' }}
                      onClick={() => void toggleDirection(calendar)}
                    >
                      {calendar.sync_direction === 'push'
                        ? 'Make pull only'
                        : 'Make two-way'}
                    </button>
                  )}
                  <button
                    type="button"
                    style={{
                      ...dangerButtonStyle,
                      height: 30,
                      padding: '0 10px',
                    }}
                    onClick={() => setConfirmRemove(calendar)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SettingsCard>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        message={`Remove "${confirmRemove?.name}"?`}
        detail="The calendar and its synced events are removed from this app. Nothing is deleted on the remote side."
        confirmLabel="Remove"
        onConfirm={() => confirmRemove && void remove(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
        danger
      />
      <ConfirmDialog
        open={confirmDisconnect}
        message="Disconnect Google?"
        detail="All Google calendars and their synced events are removed from this app. Your Google account itself is untouched."
        confirmLabel="Disconnect"
        onConfirm={() => void disconnect()}
        onCancel={() => setConfirmDisconnect(false)}
        danger
      />
    </>
  )
}
