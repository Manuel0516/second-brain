import { useEffect, useState } from 'react'
import type { Page } from './types'

interface TrashViewProps {
  pages: Page[]
  loading?: boolean
  onRestore: (id: string) => void
  onDeleteForever?: (id: string) => void
  onBack: () => void
}

export function TrashView({
  pages,
  loading,
  onRestore,
  onDeleteForever,
  onBack,
}: TrashViewProps) {
  // Two-step permanent delete: first click arms, second executes.
  const [armed, setArmed] = useState<string | null>(null)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(null), 3000)
    return () => clearTimeout(timer)
  }, [armed])

  return (
    <main className="notes-page notes-trash">
      <button type="button" className="notes-back" onClick={onBack}>
        ← Pages
      </button>
      <h1>Trash</h1>
      <p className="notes-trash-hint">
        Pages restore with their nested pages. Anything left here is removed for
        good after 30 days.
      </p>
      {loading ? (
        <p>Loading…</p>
      ) : !pages.length ? (
        <p>Trash is empty.</p>
      ) : (
        <ul>
          {pages.map((page) => (
            <li key={page.id}>
              <span className="notes-trash-title">
                {page.icon && <span aria-hidden="true">{page.icon}</span>}
                <span>{page.title}</span>
              </span>
              <span className="notes-trash-actions">
                <button
                  type="button"
                  className="notes-trash-restore"
                  onClick={() => onRestore(page.id)}
                >
                  Restore
                </button>
                {onDeleteForever && (
                  <button
                    type="button"
                    className={`notes-delete-forever${armed === page.id ? ' armed' : ''}`}
                    onBlur={() => setArmed(null)}
                    onClick={() => {
                      if (armed === page.id) {
                        setArmed(null)
                        onDeleteForever(page.id)
                      } else {
                        setArmed(page.id)
                      }
                    }}
                  >
                    {armed === page.id ? 'Really delete?' : 'Delete forever'}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
