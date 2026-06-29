import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiCall } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

interface AdminUser {
  id: string
  username: string
  email: string
  is_active: boolean
  role: string
  is_test_account: boolean
  totp_enabled: boolean
  created_at: string
}

function SettingsCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className="settings-card"
      style={{
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        background: 'var(--bg-base)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div className="settings-card-head">
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </div>
      </div>
      {children}
    </div>
  )
}

const INPUT_STYLE: React.CSSProperties = {
  minHeight: 30,
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: 12,
  padding: '4px 8px',
  outline: 'none',
  width: '100%',
}

export function AdminSettings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const redirectRef = useRef(false)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newTestAccount, setNewTestAccount] = useState(false)

  const [passwordChangeFor, setPasswordChangeFor] = useState<string | null>(
    null,
  )
  const [newPwValue, setNewPwValue] = useState('')

  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRole, setEditRole] = useState('')

  // Redirect non-admins away — the nav item is hidden but a direct URL access
  // should also bounce back.
  useEffect(() => {
    if (!redirectRef.current && user && user.role !== 'admin') {
      redirectRef.current = true
      navigate('/settings/general', { replace: true })
    }
  }, [user, navigate])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    const response = await apiCall('/api/admin/users')
    if (response.ok) {
      setUsers(await response.json())
    } else {
      const data = await response.json().catch(() => ({}))
      setError(
        typeof data.detail === 'string' ? data.detail : 'Could not load users',
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers()
  }, [loadUsers])

  const createUser = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError('')
      const response = await apiCall('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          email: newEmail,
          password: newPassword,
          role: newTestAccount ? 'testing' : 'user',
          is_test_account: newTestAccount,
        }),
      })
      if (response.ok) {
        setShowCreate(false)
        setNewUsername('')
        setNewEmail('')
        setNewPassword('')
        setNewTestAccount(false)
        loadUsers()
      } else {
        const data = await response.json().catch(() => ({}))
        setError(
          typeof data.detail === 'string'
            ? data.detail
            : 'Could not create user',
        )
      }
    },
    [newUsername, newEmail, newPassword, newTestAccount, loadUsers],
  )

  const changeUserPassword = useCallback(
    async (userId: string) => {
      if (!newPwValue || newPwValue.length < 10) {
        setError('Password must be at least 10 characters')
        return
      }
      setError('')
      const response = await apiCall(`/api/admin/users/${userId}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPwValue }),
      })
      if (response.ok) {
        setPasswordChangeFor(null)
        setNewPwValue('')
      } else {
        const data = await response.json().catch(() => ({}))
        setError(
          typeof data.detail === 'string'
            ? data.detail
            : 'Could not change password',
        )
      }
    },
    [newPwValue],
  )

  const deleteUser = useCallback(
    async (userId: string, username: string) => {
      if (!window.confirm(`Delete user "${username}"? This cannot be undone.`))
        return
      setError('')
      const response = await apiCall(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        loadUsers()
      } else {
        const data = await response.json().catch(() => ({}))
        setError(
          typeof data.detail === 'string'
            ? data.detail
            : 'Could not delete user',
        )
      }
    },
    [loadUsers],
  )

  const startEditing = useCallback((u: AdminUser) => {
    setEditingUser(u.id)
    setEditUsername(u.username)
    setEditEmail(u.email)
    setEditRole(u.role)
    setPasswordChangeFor(null)
  }, [])

  const saveEditing = useCallback(
    async (userId: string) => {
      setError('')
      const body: Record<string, string> = {}
      if (editUsername) body.username = editUsername
      if (editEmail) body.email = editEmail
      if (editRole) body.role = editRole
      const response = await apiCall(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (response.ok) {
        setEditingUser(null)
        loadUsers()
      } else {
        const data = await response.json().catch(() => ({}))
        setError(
          typeof data.detail === 'string'
            ? data.detail
            : 'Could not update user',
        )
      }
    },
    [editUsername, editEmail, editRole, loadUsers],
  )

  if (user?.role !== 'admin') return null

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
          Admin
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            margin: '4px 0 0',
          }}
        >
          Manage users and accounts.
        </p>
      </div>

      <SettingsCard title={`Users (${users.length})`}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowCreate(!showCreate)}
            style={{
              height: 34,
              padding: '0 14px',
              border: '1px solid var(--accent-tint-border)',
              borderRadius: 8,
              background: 'var(--accent-tint)',
              color: 'var(--accent)',
              fontWeight: 600,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            {showCreate ? 'Cancel' : '+ New user'}
          </button>
        </div>

        {showCreate && (
          <form
            onSubmit={createUser}
            style={{
              display: 'grid',
              gap: 10,
              padding: '12px 0',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div
              className="settings-field-row"
              style={{ display: 'grid', gap: 4 }}
            >
              <label
                htmlFor="admin-new-username"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                }}
              >
                Username
              </label>
              <input
                id="admin-new-username"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                style={{
                  minHeight: 38,
                  border: '1px solid var(--border-strong)',
                  borderRadius: 7,
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  padding: '8px 10px',
                  outline: 'none',
                }}
              />
            </div>
            <div
              className="settings-field-row"
              style={{ display: 'grid', gap: 4 }}
            >
              <label
                htmlFor="admin-new-email"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                }}
              >
                Email
              </label>
              <input
                id="admin-new-email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                style={{
                  minHeight: 38,
                  border: '1px solid var(--border-strong)',
                  borderRadius: 7,
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  padding: '8px 10px',
                  outline: 'none',
                }}
              />
            </div>
            <div
              className="settings-field-row"
              style={{ display: 'grid', gap: 4 }}
            >
              <label
                htmlFor="admin-new-pw"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                }}
              >
                Password
              </label>
              <input
                id="admin-new-pw"
                type="password"
                required
                minLength={10}
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
                }}
              />
            </div>
            <div
              className="settings-field-row"
              style={{ display: 'grid', gap: 4 }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Role
              </span>
              <select
                value={newTestAccount ? 'testing' : 'user'}
                onChange={(e) => {
                  const val = e.target.value
                  setNewTestAccount(val === 'testing')
                }}
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
              >
                <option value="user">User</option>
                <option value="testing">Testing</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                style={{
                  height: 34,
                  padding: '0 14px',
                  border: '1px solid var(--accent-tint-border)',
                  borderRadius: 8,
                  background: 'var(--accent-tint)',
                  color: 'var(--accent)',
                  fontWeight: 600,
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
              >
                Create
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
            Loading...
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 4 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  display: 'grid',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background:
                    u.id === user?.id
                      ? 'color-mix(in srgb, var(--accent) 6%, transparent)'
                      : 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                }}
              >
                {editingUser === u.id ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'grid', gap: 3 }}>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            color: 'var(--text-tertiary)',
                            fontFamily: 'var(--font-mono)',
                            textTransform: 'uppercase',
                          }}
                        >
                          Username
                        </span>
                        <input
                          value={editUsername}
                          onChange={(e) => setEditUsername(e.target.value)}
                          style={INPUT_STYLE}
                        />
                      </div>
                      <div style={{ display: 'grid', gap: 3 }}>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            color: 'var(--text-tertiary)',
                            fontFamily: 'var(--font-mono)',
                            textTransform: 'uppercase',
                          }}
                        >
                          Email
                        </span>
                        <input
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          style={INPUT_STYLE}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: 'var(--text-tertiary)',
                          fontFamily: 'var(--font-mono)',
                          textTransform: 'uppercase',
                        }}
                      >
                        Role
                      </span>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        style={{
                          minHeight: 30,
                          border: '1px solid var(--border-strong)',
                          borderRadius: 6,
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-primary)',
                          fontSize: 12,
                          padding: '4px 8px',
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="user">User</option>
                        <option value="testing">Testing</option>
                        <option value="admin">Admin</option>
                      </select>
                      <div style={{ flex: 1 }} />
                      <button
                        onClick={() => saveEditing(u.id)}
                        style={{
                          height: 30,
                          padding: '0 12px',
                          border: '1px solid var(--accent-tint-border)',
                          borderRadius: 6,
                          background: 'var(--accent-tint)',
                          color: 'var(--accent)',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingUser(null)}
                        style={{
                          height: 30,
                          padding: '0 12px',
                          border: '1px solid var(--border-strong)',
                          borderRadius: 6,
                          background: 'transparent',
                          color: 'var(--text-tertiary)',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {u.username}{' '}
                        {u.id === user?.id && (
                          <span
                            style={{
                              fontSize: 10,
                              color: 'var(--accent)',
                            }}
                          >
                            (you)
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        {u.email} ·{' '}
                        <span style={{ textTransform: 'capitalize' }}>
                          {u.role}
                        </span>
                        {u.is_test_account ? ' · test' : ''}
                        {!u.is_active ? ' · inactive' : ''}
                        {u.totp_enabled ? ' · 2FA' : ''}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        alignItems: 'center',
                      }}
                    >
                      {passwordChangeFor === u.id ? (
                        <div
                          style={{
                            display: 'flex',
                            gap: 4,
                            alignItems: 'center',
                          }}
                        >
                          <input
                            type="password"
                            placeholder="New password"
                            minLength={10}
                            value={newPwValue}
                            onChange={(e) => setNewPwValue(e.target.value)}
                            style={{ width: 130, ...INPUT_STYLE }}
                          />
                          <button
                            onClick={() => changeUserPassword(u.id)}
                            style={{
                              height: 30,
                              padding: '0 10px',
                              border: '1px solid var(--accent-tint-border)',
                              borderRadius: 6,
                              background: 'var(--accent-tint)',
                              color: 'var(--accent)',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setPasswordChangeFor(null)
                              setNewPwValue('')
                            }}
                            style={{
                              height: 30,
                              padding: '0 10px',
                              border: '1px solid var(--border-strong)',
                              borderRadius: 6,
                              background: 'transparent',
                              color: 'var(--text-tertiary)',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => startEditing(u)}
                            style={{
                              height: 30,
                              padding: '0 10px',
                              border: '1px solid var(--border-strong)',
                              borderRadius: 6,
                              background: 'var(--bg-raised)',
                              color: 'var(--text-secondary)',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setPasswordChangeFor(u.id)}
                            style={{
                              height: 30,
                              padding: '0 10px',
                              border: '1px solid var(--border-strong)',
                              borderRadius: 6,
                              background: 'var(--bg-raised)',
                              color: 'var(--text-secondary)',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            Password
                          </button>
                          {u.id !== user?.id && (
                            <button
                              onClick={() => deleteUser(u.id, u.username)}
                              style={{
                                height: 30,
                                padding: '0 10px',
                                border: '1px solid var(--border-strong)',
                                borderRadius: 6,
                                background: 'transparent',
                                color: '#D9573F',
                                fontSize: 11,
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p style={{ fontSize: 12, color: '#D9573F' }}>{error}</p>}
      </SettingsCard>
    </div>
  )
}
