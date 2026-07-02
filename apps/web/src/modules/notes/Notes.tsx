import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppRail } from '../../components/AppRail'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { notesApi } from './api'
import { Sidebar } from './Sidebar'
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
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 640,
  )
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
    const mobile = window.matchMedia('(max-width: 640px)')
    const drawer = window.matchMedia('(max-width: 800px)')
    const updateMobile = () => setIsMobile(mobile.matches)
    const updateDrawer = () => setSidebarOpen(!drawer.matches)
    mobile.addEventListener('change', updateMobile)
    drawer.addEventListener('change', updateDrawer)
    return () => {
      mobile.removeEventListener('change', updateMobile)
      drawer.removeEventListener('change', updateDrawer)
    }
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

  const createPage = async (parentId: string | null): Promise<Page | null> => {
    try {
      const page = await notesApi.create({
        parent_page_id: parentId,
        title: 'Untitled',
      })
      setPages((current) => [...current, page])
      return page
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not create page',
      )
      return null
    }
  }

  const create = async (parentId: string | null) => {
    const page = await createPage(parentId)
    if (page) {
      setTrash(null)
      navigate(`/notes/${page.id}`)
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

  const applyTemplate = async (id: string) => {
    try {
      const copy = await notesApi.duplicate(id)
      // The copy brings a whole subtree — refetch to pick it all up.
      setPages(await notesApi.list())
      setTrash(null)
      navigate(`/notes/${copy.id}`)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not use template',
      )
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
      {(!isMobile || sidebarOpen) && (
        <AppRail active="notes" onNavigate={navigate} />
      )}
      <div className="notes-workspace">
        <Sidebar
          pages={pages}
          selectedId={pageId}
          onSelect={(id) => {
            navigate(`/notes/${id}`)
            setTrash(null)
          }}
          onCreate={(parentId) => void create(parentId)}
          onRename={(id, title) => void patchPage(id, { title })}
          onSetType={(id, type) => void patchPage(id, { type })}
          onSetTemplate={(id, is_template) =>
            void patchPage(id, { is_template })
          }
          onUseTemplate={(id) => void applyTemplate(id)}
          onMove={(id, parent_page_id, position) =>
            void patchPage(id, { parent_page_id, position })
          }
          onDelete={setPendingDelete}
          onOpenTrash={() => void openTrash()}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        {sidebarOpen && (
          <div
            className="sidebar-backdrop"
            role="presentation"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div className="notes-main">
          <div className="notes-topbar">
            <button
              type="button"
              className="notes-nav-btn"
              aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
              aria-pressed={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                <path d="M7.5 3.5v13" />
              </svg>
            </button>
            <h2 className="notes-topbar-title">
              {trash ? 'Trash' : selected?.title || 'Notes'}
            </h2>
            <button
              type="button"
              className="cal-new-event notes-new-page"
              aria-label="New page"
              onClick={() => void create(null)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M10 4v12M4 10h12" />
              </svg>
              <span className="cal-new-event-label">New page</span>
            </button>
          </div>
          <section className="notes-canvas">
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
                pages={pages}
                onPatchPage={patchPage}
                onCreatePage={(parentId) => void createPage(parentId)}
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
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        message={`Move “${pendingDelete?.title}” to trash?`}
        detail="Nested pages will also be moved to trash."
        confirmLabel="Move to trash"
        onConfirm={() => void remove()}
        onCancel={() => setPendingDelete(null)}
        danger={false}
      />
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
