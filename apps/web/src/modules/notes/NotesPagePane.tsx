import { useEffect, useMemo, useState } from 'react'
import { notesApi } from './api'
import { PageView } from './PageView'
import type { Page } from './types'

export interface NotesPagePaneProps {
  pageId: string
  onClose?: () => void
  onOpenEvent?: (id: string) => void
}

export function NotesPagePane({
  pageId,
  onClose,
  onOpenEvent,
}: NotesPagePaneProps) {
  const [activeId, setActiveId] = useState(pageId)
  const [pages, setPages] = useState<Page[]>([])
  const [error, setError] = useState('')
  const [inputPageId, setInputPageId] = useState(pageId)

  if (inputPageId !== pageId) {
    setInputPageId(pageId)
    setActiveId(pageId)
  }
  useEffect(() => {
    let active = true
    Promise.all([notesApi.list(), notesApi.get(activeId)])
      .then(([all, page]) => {
        if (!active) return
        setPages(all.some((item) => item.id === page.id) ? all : [...all, page])
        setError('')
      })
      .catch(
        (reason) =>
          active &&
          setError(
            reason instanceof Error ? reason.message : 'Could not load note',
          ),
      )
    return () => {
      active = false
    }
  }, [activeId])

  const page = pages.find((item) => item.id === activeId)
  const ancestors = useMemo(() => {
    const result: Page[] = []
    let current = page
    while (current?.parent_page_id) {
      const parent = pages.find((item) => item.id === current?.parent_page_id)
      if (!parent) break
      result.unshift(parent)
      current = parent
    }
    return result
  }, [page, pages])

  const patchById = async (
    id: string,
    input: Parameters<typeof notesApi.patch>[1],
  ) => {
    setPages((current) =>
      current.map((item) => (item.id === id ? { ...item, ...input } : item)),
    )
    const saved = await notesApi.patch(id, input)
    setPages((current) =>
      current.map((item) => (item.id === id ? saved : item)),
    )
  }

  const patch = async (input: Parameters<typeof notesApi.patch>[1]) => {
    if (page) await patchById(page.id, input)
  }

  return (
    <section className="notes-pane" aria-label="Event note">
      {onClose && (
        <button
          type="button"
          className="notes-pane-close"
          aria-label="Close note"
          onClick={onClose}
        >
          ×
        </button>
      )}
      {error ? (
        <p className="notes-error" role="alert">
          {error}
        </p>
      ) : page ? (
        <PageView
          page={page}
          ancestors={ancestors}
          onPatch={patch}
          onOpenPage={setActiveId}
          onOpenEvent={onOpenEvent}
          pages={pages}
          onPatchPage={patchById}
        />
      ) : (
        <p className="notes-pane-loading">Loading note…</p>
      )}
    </section>
  )
}
