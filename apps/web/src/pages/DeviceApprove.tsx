import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiCall } from '../lib/api'

/**
 * OAuth-style device approval page.
 * The bot (or any machine client) shows the user a link like
 * /device?code=XXXX — after logging in, the user approves the device here.
 */
export function DeviceApprove() {
  const [searchParams] = useSearchParams()
  const code = (searchParams.get('code') ?? '').trim().toUpperCase()
  const { isAuthenticated, loading } = useAuth()

  const [state, setState] = useState<'idle' | 'approving' | 'done' | 'error'>(
    'idle',
  )
  const [error, setError] = useState('')

  async function approve() {
    if (state !== 'idle') return
    setState('approving')
    try {
      const response = await apiCall('/api/auth/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: code }),
      })
      if (response.ok) {
        setState('done')
      } else {
        const body = await response.json().catch(() => ({}))
        setState('error')
        setError(
          `${body.detail || 'Could not approve this code'} — ask the bot for a fresh link.`,
        )
      }
    } catch {
      setState('error')
      setError('Could not reach the server')
    }
  }

  const card =
    'mx-auto w-full max-w-md rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-8 shadow-[var(--shadow-md)]'

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] p-6">
      <div className={card}>
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-tint)] text-xl">
            🤖
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">
              Device authorization
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Second Brain agent (Hermes-Life)
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Checking your session…
          </p>
        ) : !code ? (
          <p className="text-sm text-[var(--text-secondary)]">
            This link needs a <code className="font-mono">?code=</code>{' '}
            parameter. Open the link your bot sent you.
          </p>
        ) : !isAuthenticated ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Log in to approve device{' '}
              <strong className="font-mono text-[var(--text-primary)]">
                {code}
              </strong>
              .
            </p>
            <Link
              to={`/login?next=${encodeURIComponent(`/device?code=${code}`)}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white no-underline"
            >
              Log in to approve
            </Link>
          </div>
        ) : state === 'done' ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-base)] p-4 text-center">
              <p className="text-2xl">✅</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                Device approved
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                The bot is now connected to your account. You can close this
                page.
              </p>
            </div>
            <Link
              to="/calendar"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] text-sm font-semibold text-[var(--text-secondary)] no-underline"
            >
              Go to Second Brain
            </Link>
          </div>
        ) : state === 'error' ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-base)] p-4 text-center">
              <p className="text-2xl">⚠️</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                Approval failed
              </p>
              <p className="text-xs text-[var(--text-secondary)]">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setState('idle')}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] text-sm font-semibold text-[var(--text-secondary)]"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-base)] p-4 text-center">
              <p className="font-mono text-xl font-bold tracking-widest text-[var(--text-primary)]">
                {code}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {isAuthenticated ? 'Signed in' : 'Not signed in'} · Approve this
                device?
              </p>
            </div>
            <button
              type="button"
              onClick={approve}
              disabled={state === 'approving'}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {state === 'approving' ? 'Approving…' : 'Approve device'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
