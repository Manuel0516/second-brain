import { useEffect, useState } from 'react'

type ApiState = 'checking' | 'ready' | 'unavailable'

export function App() {
  const [apiState, setApiState] = useState<ApiState>('checking')

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('API health check failed')
        setApiState('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setApiState('unavailable')
      })

    return () => controller.abort()
  }, [])

  return (
    <main className="min-h-screen bg-[var(--bg-base)] px-6 py-16 text-[var(--text-primary)]">
      <section className="mx-auto max-w-xl rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
          Foundation milestone
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Second Brain
        </h1>
        <p className="mt-3 leading-7 text-[var(--text-secondary)]">
          The private life OS is wired up. Calendar is the first product module
          after authentication.
        </p>
        <div
          className="mt-8 flex items-center gap-3 text-sm"
          role="status"
          aria-live="polite"
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${apiState === 'ready' ? 'bg-emerald-500' : apiState === 'unavailable' ? 'bg-red-500' : 'animate-pulse bg-amber-500'}`}
            aria-hidden="true"
          />
          API {apiState}
        </div>
      </section>
    </main>
  )
}
