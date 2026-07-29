import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth'
import { logoAssetFor, readCachedVisualStyle } from '../lib/appearance'

export function Login() {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuth()
  const [logoSrc] = useState(() => logoAssetFor(readCachedVisualStyle()))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [totpRequired, setTotpRequired] = useState(false)
  const totpInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isAuthenticated && !success) navigate('/calendar', { replace: true })
  }, [isAuthenticated, success, navigate])

  // Credentials live only in this component's state; clear them on unmount so
  // nothing lingers if the user navigates away mid-flow.
  useEffect(() => {
    return () => {
      setPassword('')
      setTotp('')
    }
  }, [])

  useEffect(() => {
    if (totpRequired) {
      totpInputRef.current?.focus()
      totpInputRef.current?.select()
    }
  }, [totpRequired])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || success) return
    setError('')
    setLoading(true)
    try {
      const result = await login(email, password, totp)
      if (result === 'totp_required') {
        setTotpRequired(true)
      } else if (result === 'success') {
        setSuccess(true)
        setPassword('')
        setTotp('')
        setTimeout(() => navigate('/calendar', { replace: true }), 450)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setTotp('')
      totpInputRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '10px 13px',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 13.5,
    outline: 'none',
    transition: 'border-color .2s',
    marginBottom: 9,
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        animation: 'fadeUp .35s ease both',
      }}
    >
      <div
        style={{
          width: 352,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: 14,
          padding: '42px 32px',
          textAlign: 'center',
          animation: 'springIn .5s cubic-bezier(.16,1,.3,1) both',
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 62,
            height: 62,
            margin: '0 auto 20px',
            animation: 'glow 3.5s ease-in-out infinite',
          }}
        >
          <img
            src={logoSrc}
            className="brand-logo"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            alt=""
          />
        </div>

        <h1
          style={{
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: '-0.015em',
            marginBottom: 5,
            color: 'var(--text-primary)',
          }}
        >
          Second Brain
        </h1>
        <p
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10.5,
            color: 'var(--text-tertiary)',
            letterSpacing: '.07em',
            textTransform: 'uppercase',
            marginBottom: 30,
          }}
        >
          Private · Sign in to continue
        </p>

        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 14,
              padding: '9px 13px',
              background: 'rgba(244,63,94,0.1)',
              border: '1px solid rgba(244,63,94,0.3)',
              borderRadius: 8,
              fontSize: 12.5,
              color: '#f87171',
              textAlign: 'left',
            }}
          >
            {error}
          </div>
        )}
        <span
          role="status"
          aria-live="polite"
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
        >
          {loading ? 'Signing in…' : success ? 'Signed in, redirecting…' : ''}
        </span>

        <form onSubmit={handleSubmit}>
          {!totpRequired && (
            <>
              <label
                htmlFor="email"
                style={{
                  position: 'absolute',
                  opacity: 0,
                  pointerEvents: 'none',
                }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--accent)')
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--border-strong)')
                }
              />
              <label
                htmlFor="password"
                style={{
                  position: 'absolute',
                  opacity: 0,
                  pointerEvents: 'none',
                }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...inputStyle, marginBottom: 16 }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--accent)')
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--border-strong)')
                }
              />
            </>
          )}

          {totpRequired && (
            <>
              <p
                style={{
                  fontSize: 12.5,
                  color: 'var(--text-secondary)',
                  marginBottom: 12,
                  textAlign: 'left',
                }}
              >
                Enter the 6-digit code from your authenticator app
              </p>
              <label
                htmlFor="totp"
                style={{
                  position: 'absolute',
                  opacity: 0,
                  pointerEvents: 'none',
                }}
              >
                Authenticator code
              </label>
              <input
                id="totp"
                ref={totpInputRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                placeholder="000000"
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                style={{
                  ...inputStyle,
                  textAlign: 'center',
                  fontSize: 20,
                  letterSpacing: '0.25em',
                  fontFamily: 'JetBrains Mono, monospace',
                  marginBottom: 16,
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--accent)')
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--border-strong)')
                }
              />
            </>
          )}

          <button
            type="submit"
            disabled={loading || success || (totpRequired && totp.length !== 6)}
            style={{
              width: '100%',
              height: 40,
              background: success
                ? '#43C58A'
                : loading
                  ? 'color-mix(in srgb, var(--text-primary) 50%, transparent)'
                  : 'var(--text-primary)',
              color: success ? '#fff' : 'var(--bg-base)',
              border: 'none',
              borderRadius: 8,
              fontSize: 13.5,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: loading || success ? 'default' : 'pointer',
              transition: 'background .25s, transform .1s',
            }}
            onMouseDown={(e) =>
              !loading &&
              !success &&
              (e.currentTarget.style.transform = 'scale(.97)')
            }
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {loading && (
              <div
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 14,
                  border: '2px solid rgba(0,0,0,.2)',
                  borderTopColor: 'var(--bg-base)',
                  borderRadius: '50%',
                  animation: 'spin .5s linear infinite',
                }}
              />
            )}
            {success && (
              <svg
                aria-hidden="true"
                width="15"
                height="15"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M3 8.5L6.5 12L13 4"
                  stroke="white"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="20"
                  strokeDashoffset="20"
                  style={{ animation: 'dash .25s ease forwards' }}
                />
              </svg>
            )}
            {!loading && !success && (totpRequired ? 'Verify' : 'Sign in')}
          </button>
        </form>

        {!totpRequired && (
          <p
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              marginTop: 14,
            }}
          >
            Authenticator code requested after password
          </p>
        )}
      </div>
    </div>
  )
}
