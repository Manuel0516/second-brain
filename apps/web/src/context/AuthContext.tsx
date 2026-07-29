import { ReactNode, useEffect, useState } from 'react'
import { apiCall, refreshAccessToken } from '../lib/api'
import { AuthContext, type User } from './auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        let response = await apiCall('/api/auth/me')
        if (response.status === 401 && (await refreshAccessToken())) {
          response = await apiCall('/api/auth/me')
        }

        if (response.ok) {
          const data = await response.json()
          setUser({
            id: data.id,
            username: data.username,
            email: data.email,
            role: data.is_admin ? 'admin' : 'user',
            is_test_account: data.is_test_account ?? false,
          })
          setIsAuthenticated(true)
          setTotpEnabled(data.totp_enabled ?? false)
        } else {
          setIsAuthenticated(false)
          setUser(null)
        }
      } catch {
        setIsAuthenticated(false)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = async (
    email: string,
    password: string,
    totp?: string,
  ): Promise<string> => {
    const payload: Record<string, string> = { email, password }
    if (totp) payload.totp_code = totp

    const response = await apiCall('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.json()
      if (error.detail === 'TOTP code required') {
        return 'totp_required'
      }
      throw new Error(error.detail || 'Login failed')
    }

    const data = await response.json()
    setUser({
      id: data.id,
      username: data.username,
      email: data.email,
      role: data.is_admin ? 'admin' : 'user',
      is_test_account: data.is_test_account ?? false,
    })
    setIsAuthenticated(true)
    setTotpEnabled(data.totp_enabled ?? false)
    return 'success'
  }

  const logout = async () => {
    try {
      const response = await apiCall('/api/auth/logout', { method: 'POST' })
      if (response.status === 401 && (await refreshAccessToken())) {
        await apiCall('/api/auth/logout', { method: 'POST' })
      }
    } catch {
      // Logout best-effort
    }
    setIsAuthenticated(false)
    setUser(null)
  }

  const refreshToken = refreshAccessToken

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        totpEnabled,
        loading,
        login,
        logout,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
