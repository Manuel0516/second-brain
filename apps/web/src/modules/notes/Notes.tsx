import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppRail } from '../../components/AppRail'
import { notesApi } from './api'
import { PageTree } from './PageTree'
import { PageView } from './PageView'
import { TrashView } from './TrashView'
import type { Page } from './types'
import './notes.css'

export function Notes() {
  const navigate = useNavigate()
  const { pageId } = useParams<{ pageId: string }>()
  const [pages, setPages] = useState<Page[]>([])
  const [trash, setTrash] = useState<Page[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 800,
  )
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Page | null>(null)

  useEffect(() => {
    let active = true
    notesApi
      .list()
      .then((result) => {
        if (active) setPages(result)
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : 'Could not load pages',
          )
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)')
    const update = () => setSidebarOpen(!media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const selected = pages.find((page) => page.id === pageId)
  const ancestors = useMemo(() => {
    const result: Page[] = []
    let current = selected
    while (current?.parent_page_id) {
      const parent = pages.find((page) => page.id === current?.parent_page_id)
      if (!parent) break
      result.unshift(parent)
      current = parent
    }
    return result
  }, [pages, selected])

  const create = async (parentId: string | null) => {
    try {
      const page = await notesApi.create({
        parent_page_id: parentId,
        title: 'Untitled',
      })
      setPages((current) => [...current, page])
      navigate(`/notes/${page.id}`)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not create page',
      )
    }
  }

  const patchPage = async (
    id: string,
    input: Parameters<typeof notesApi.patch>[1],
  ) => {
    setPages((current) =>
      current.map((page) => (page.id === id ? { ...page, ...input } : page)),
    )
    try {
      const saved = await notesApi.patch(id, input)
      setPages((current) =>
        current.map((page) => (page.id === id ? saved : page)),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save page')
      throw reason
    }
  }

  const openTrash = async () => {
    setTrash([])
    try {
      setTrash(await notesApi.trash())
      navigate('/notes')
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not load trash',
      )
    }
  }

  const remove = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    try {
      await notesApi.remove(id)
      setPages((current) =>
        current.filter(
          (page) => page.id !== id && !isChildOf(page, id, current),
        ),
      )
      setPendingDelete(null)
      if (pageId === id) navigate('/notes')
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not delete page',
      )
    }
  }

  return (
    <div className="notes-shell">
      <AppRail active="notes" onNavigate={navigate} />
      <div className="notes-workspace">
        <PageTree
          pages={pages}
          selectedId={pageId}
          onSelect={(id) => {
            navigate(`/notes/${id}`)
            setTrash(null)
          }}
          onCreate={(parentId) => void create(parentId)}
          onRename={(id, title) => void patchPage(id, { title })}
          onMove={(id, parent_page_id, position) =>
            void patchPage(id, { parent_page_id, position })
          }
          onDelete={setPendingDelete}
          onOpenTrash={() => void openTrash()}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <section className="notes-canvas">
          <button
            type="button"
            className="notes-sidebar-open"
            aria-label="Open page navigation"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          {error && (
            <div className="notes-error" role="alert">
              {error}
            </div>
          )}
          {trash ? (
            <TrashView
              pages={trash}
              onBack={() => setTrash(null)}
              onRestore={(id) =>
                void notesApi.restore(id).then((page) => {
                  setTrash(
                    (current) =>
                      current?.filter((item) => item.id !== id) ?? [],
                  )
                  setPages((current) => [...current, page])
                })
              }
            />
          ) : selected ? (
            <PageView
              page={selected}
              ancestors={ancestors}
              onPatch={(input) => patchPage(selected.id, input)}
              onOpenPage={(id) => navigate(`/notes/${id}`)}
            />
          ) : (
            <main className="notes-empty-page">
              <h1>{loading ? 'Loading…' : 'Notes'}</h1>
              {!loading && (
                <>
                  <p>Select a page or start a new one.</p>
                  <button type="button" onClick={() => void create(null)}>
                    New page
                  </button>
                </>
              )}
            </main>
          )}
        </section>
      </div>
      {pendingDelete && (
        <div
          className="scope-prompt"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-note-title"
        >
          <div className="scope-card">
            <h3 id="delete-note-title">
              Move “{pendingDelete.title}” to trash?
            </h3>
            <p>Nested pages will also be moved to trash.</p>
            <div className="scope-options">
              <button
                type="button"
                className="scope-option"
                onClick={() => void remove()}
              >
                Move to trash
              </button>
              <button
                type="button"
                className="scope-cancel"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function isChildOf(page: Page, ancestorId: string, pages: Page[]): boolean {
  let parentId = page.parent_page_id
  while (parentId) {
    if (parentId === ancestorId) return true
    parentId =
      pages.find((candidate) => candidate.id === parentId)?.parent_page_id ??
      null
  }
  return false
}
