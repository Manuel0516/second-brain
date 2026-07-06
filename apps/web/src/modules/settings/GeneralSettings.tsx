import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Segmented } from '../../components/Segmented'
import { SettingsCard } from '../../components/SettingsCard'
import { FavoriteEmojiEditor } from '../../components/FavoritesEditor'
import { ToggleRow } from '../../components/ToggleRow'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../context/SettingsContext'
import { apiCall } from '../../lib/api'

const COMMON_TZ = [
  'Europe/Stockholm',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Rome',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
]

const SegmentControl = Segmented

export function GeneralSettings() {
  const { user, logout } = useAuth()
  const { settings, patch } = useSettings()
  const navigate = useNavigate()

  const [username, setUsername] = useState(user?.username ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)

  const profileDirty = useMemo(
    () => username !== (user?.username ?? '') || email !== (user?.email ?? ''),
    [username, email, user],
  )

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)

  const saveProfile = useCallback(async () => {
    setProfileSaving(true)
    setProfileError('')
    setProfileSaved(false)
    const body: Record<string, string> = {}
    if (username !== user?.username) body.username = username
    if (email !== user?.email) body.email = email
    if (!Object.keys(body).length) {
      setProfileSaving(false)
      return
    }

    const response = await apiCall('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      const data = await response.json()
      setUsername(data.username ?? username)
      setEmail(data.email ?? email)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    } else {
      const data = await response.json().catch(() => ({}))
      setProfileError(
        typeof data.detail === 'string'
          ? data.detail
          : 'Failed to update profile',
      )
    }
    setProfileSaving(false)
  }, [username, email, user])

  const savePassword = useCallback(async () => {
    setPasswordError('')
    setPasswordSaved(false)

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    if (newPassword.length < 10) {
      setPasswordError('Password must be at least 10 characters')
      return
    }

    setPasswordSaving(true)
    const response = await apiCall('/api/auth/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    })

    if (response.ok) {
      setPasswordSaved(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordSaved(false), 2000)
    } else {
      const data = await response.json().catch(() => ({}))
      setPasswordError(
        typeof data.detail === 'string'
          ? data.detail
          : 'Failed to update password',
      )
    }
    setPasswordSaving(false)
  }, [currentPassword, newPassword, confirmPassword])

  const handleExport = useCallback(async () => {
    const response = await apiCall('/api/settings/export')
    if (response.ok) {
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const filename =
        response.headers
          .get('Content-Disposition')
          ?.match(/filename="?(.+?)"?$/)?.[1] ?? 'secondbrain-export.json'
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [])

  const handleLogout = useCallback(async () => {
    await logout()
    navigate('/login')
  }, [logout, navigate])

  const hasPasswordChanges =
    currentPassword.length > 0 && newPassword.length > 0

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
          General
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            margin: '4px 0 0',
          }}
        >
          Manage your profile, preferences, and account data.
        </p>
      </div>

      {/* Favourite emojis */}
      <SettingsCard
        title="Favourite emojis"
        description="Shown first in the icon picker, used by calendar events and notes pages."
      >
        <FavoriteEmojiEditor
          emojis={settings.favorite_emojis}
          onChange={(favorite_emojis) => patch({ favorite_emojis })}
        />
      </SettingsCard>

      {/* Profile */}
      <SettingsCard
        title="Profile"
        description="Your username and email address."
        onSave={saveProfile}
        hasChanges={profileDirty}
        saving={profileSaving}
      >
        <div className="settings-field-row" style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="settings-username"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Username
          </label>
          <input
            id="settings-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              minHeight: 38,
              border: '1px solid var(--border-strong)',
              borderRadius: 7,
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 13,
              padding: '8px 10px',
              outline: 'none',
              transition: 'border-color .15s, box-shadow .15s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-tint)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-strong)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>
        <div className="settings-field-row" style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="settings-email"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Email
          </label>
          <input
            id="settings-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              minHeight: 38,
              border: '1px solid var(--border-strong)',
              borderRadius: 7,
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 13,
              padding: '8px 10px',
              outline: 'none',
              transition: 'border-color .15s, box-shadow .15s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-tint)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-strong)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>
        {profileError && (
          <div style={{ fontSize: 12, color: '#D9573F' }}>{profileError}</div>
        )}
        {profileSaved && (
          <div style={{ fontSize: 12, color: '#2E9E6E' }}>Saved ✓</div>
        )}
      </SettingsCard>

      {user?.role !== 'testing' && !user?.is_test_account && (
        <>
          {/* Password */}
          <SettingsCard
            title="Password"
            description="Change your account password."
            onSave={savePassword}
            hasChanges={hasPasswordChanges}
            saving={passwordSaving}
          >
            <div
              className="settings-field-row"
              style={{ display: 'grid', gap: 6 }}
            >
              <label
                htmlFor="settings-current-pw"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Current password
              </label>
              <input
                id="settings-current-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={{
                  minHeight: 38,
                  border: '1px solid var(--border-strong)',
                  borderRadius: 7,
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  padding: '8px 10px',
                  outline: 'none',
                  transition: 'border-color .15s, box-shadow .15s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.boxShadow =
                    '0 0 0 3px var(--accent-tint)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-strong)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>
            <div
              className="settings-field-row"
              style={{ display: 'grid', gap: 6 }}
            >
              <label
                htmlFor="settings-new-pw"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                New password
              </label>
              <input
                id="settings-new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{
                  minHeight: 38,
                  border: '1px solid var(--border-strong)',
                  borderRadius: 7,
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  padding: '8px 10px',
                  outline: 'none',
                  transition: 'border-color .15s, box-shadow .15s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.boxShadow =
                    '0 0 0 3px var(--accent-tint)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-strong)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>
            <div
              className="settings-field-row"
              style={{ display: 'grid', gap: 6 }}
            >
              <label
                htmlFor="settings-confirm-pw"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Confirm new password
              </label>
              <input
                id="settings-confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  minHeight: 38,
                  border: '1px solid var(--border-strong)',
                  borderRadius: 7,
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  padding: '8px 10px',
                  outline: 'none',
                  transition: 'border-color .15s, box-shadow .15s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.boxShadow =
                    '0 0 0 3px var(--accent-tint)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-strong)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>
            {passwordError && (
              <div style={{ fontSize: 12, color: '#D9573F' }}>
                {passwordError}
              </div>
            )}
            {passwordSaved && (
              <div style={{ fontSize: 12, color: '#2E9E6E' }}>
                Password updated ✓
              </div>
            )}
          </SettingsCard>
        </>
      )}

      {/* Appearance */}
      <SettingsCard title="Appearance">
        <div className="settings-field-row" style={{ display: 'grid', gap: 6 }}>
          <span
            id="settings-theme-label"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Theme
          </span>
          <div role="group" aria-labelledby="settings-theme-label">
            <SegmentControl
              value={settings.theme}
              options={['system', 'light', 'dark']}
              labels={{ system: 'System', light: 'Light', dark: 'Dark' }}
              onChange={(v) => patch({ theme: v })}
            />
          </div>
        </div>
      </SettingsCard>

      {/* Preferences */}
      <SettingsCard title="Preferences">
        <div className="settings-field-row" style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="settings-tz"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Timezone
          </label>
          <select
            id="settings-tz"
            value={settings.timezone}
            onChange={(e) => patch({ timezone: e.target.value })}
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
            {COMMON_TZ.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <ToggleRow
          label="24-hour time format"
          checked={settings.time_format === '24h'}
          onChange={(v) => patch({ time_format: v ? '24h' : '12h' })}
        />
      </SettingsCard>

      {/* Data & account */}
      <SettingsCard title="Data & account">
        <button
          onClick={handleExport}
          style={{
            height: 38,
            padding: '0 14px',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            background: 'var(--bg-raised)',
            color: 'var(--text-primary)',
            fontSize: 13,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          Export all data
        </button>
        <button
          onClick={handleLogout}
          className="danger"
          style={{
            height: 38,
            padding: '0 14px',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            background: 'transparent',
            color: '#D9573F',
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 500,
            textAlign: 'left',
          }}
        >
          Log out
        </button>
      </SettingsCard>
    </div>
  )
}
