import type { Page } from './types'

interface TrashViewProps {
  pages: Page[]
  loading?: boolean
  onRestore: (id: string) => void
  onBack: () => void
}

export function TrashView({
  pages,
  loading,
  onRestore,
  onBack,
}: TrashViewProps) {
  return (
    <main className="notes-page notes-trash">
      <button type="button" className="notes-back" onClick={onBack}>
        ← Pages
      </button>
      <h1>Trash</h1>
      {loading ? (
        <p>Loading…</p>
      ) : !pages.length ? (
        <p>Trash is empty.</p>
      ) : (
        <ul>
          {pages.map((page) => (
            <li key={page.id}>
              <span>
                {page.icon || '▧'} {page.title}
              </span>
              <button type="button" onClick={() => onRestore(page.id)}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
