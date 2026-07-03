import { useEffect, useMemo, useState } from 'react'
import { notesApi } from './api'
import { PageView } from './PageView'
import type { Backlink, Page } from './types'

export interface NotesPagePaneProps {
  pageId: string
  onClose?: () => void
  onOpenEvent?: (id: string) => void
  /** Navigate to the full Notes page (owned by the host page). */
  onOpenFull?: (id: string) => void
}

export function NotesPagePane({
  pageId,
  onClose,
  onOpenEvent,
  onOpenFull,
}: NotesPagePaneProps) {
  const [activeId, setActiveId] = useState(pageId)
  const [pages, setPages] = useState<Page[]>([])
  const [error, setError] = useState('')
  const [inputPageId, setInputPageId] = useState(pageId)
  const [linkedEvent, setLinkedEvent] = useState<Backlink | null>(null)

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

  // Which event this note is attached to (if any), for the header chip.
  useEffect(() => {
    let active = true
    notesApi
      .backlinks('page', activeId)
      .then((links) => {
        if (!active) return
        setLinkedEvent(
          links.find(
            (link) => link.source_type === 'event' && link.relation === 'note',
          ) ?? null,
        )
      })
      .catch(() => active && setLinkedEvent(null))
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
      <header className="notes-pane-header">
        <div className="notes-pane-heading">
          {ancestors.length > 0 && (
            <span className="notes-pane-crumbs">
              {ancestors
                .map((ancestor) => ancestor.title || 'Untitled')
                .join(' / ')}
            </span>
          )}
          <button
            type="button"
            className="notes-pane-title"
            title="Open in full page"
            onClick={() => onOpenFull?.(activeId)}
          >
            {page?.title || 'Untitled'}
          </button>
        </div>
        {linkedEvent && (
          <button
            type="button"
            className="notes-pane-event-chip"
            title="Open linked event"
            onClick={() => onOpenEvent?.(linkedEvent.source_id)}
          >
            <span aria-hidden="true">◷</span>
            {linkedEvent.title || 'Event'}
          </button>
        )}
        {onOpenFull && (
          <button
            type="button"
            className="notes-pane-action"
            aria-label="Open in full page"
            title="Open in full page"
            onClick={() => onOpenFull(activeId)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 4H4.5a.5.5 0 00-.5.5V15.5a.5.5 0 00.5.5H15.5a.5.5 0 00.5-.5V12" />
              <path d="M12 3.5h4.5V8M16 4l-6.5 6.5" />
            </svg>
          </button>
        )}
        {onClose && (
          <button
            type="button"
            className="notes-pane-action"
            aria-label="Close note"
            onClick={onClose}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        )}
      </header>
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
