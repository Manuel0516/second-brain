import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [totpRequired, setTotpRequired] = useState(false)

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/calendar', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login(email, password, totp)
      if (result === 'totp_required') {
        setTotpRequired(true)
        setPassword('')
      } else if (result === 'success') {
        navigate('/calendar', { replace: true })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setError(message)
      setTotp('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-base)] px-6 py-16 text-[var(--text-primary)]">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Access your Second Brain
          </p>

          {error && (
            <div className="mt-6 rounded-lg border border-red-500 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {!totpRequired && (
              <>
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-[var(--text-primary)]"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-4 py-2 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    placeholder="your@email.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-[var(--text-primary)]"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-4 py-2 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    placeholder="••••••••"
                  />
                </div>
              </>
            )}

            {totpRequired && (
              <div>
                <label
                  htmlFor="totp"
                  className="block text-sm font-medium text-[var(--text-primary)]"
                >
                  Authentication Code
                </label>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Enter the 6-digit code from your authenticator app
                </p>
                <input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                  className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-4 py-2 text-center font-mono text-lg tracking-widest text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  placeholder="000000"
                  autoFocus
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-[#111114] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : totpRequired ? 'Verify' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
