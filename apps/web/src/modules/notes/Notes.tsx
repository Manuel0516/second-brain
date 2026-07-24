import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppRail } from '../../components/AppRail'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { notesApi } from './api'
import { CreatePageMenu } from './CreatePageMenu'
import { Sidebar } from './Sidebar'
import { PageView } from './PageView'
import { TrashView } from './TrashView'
import type { Page } from './types'
import './notes.css'

/** Skeleton loader that mirrors the SettingsSkeleton pattern:
 *  staggered cards of pulse-shimmer placeholders shown while pages load. */
function NotesSkeleton({ type }: { type: 'overview' | 'page' }) {
  if (type === 'page') {
    return (
      <div className="notes-skeleton-page">
        {/* Breadcrumbs placeholder */}
        <div className="skeleton" style={{ height: 14, width: 160 }} />
        {/* Icon + title head */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            className="skeleton"
            style={{ width: 40, height: 40, borderRadius: 'var(--r-md)' }}
          />
          <div className="skeleton" style={{ height: 34, width: 300 }} />
        </div>
        {/* Content lines */}
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: 'grid', gap: 8 }}>
            <div className="skeleton" style={{ height: 14, width: '100%' }} />
            <div className="skeleton" style={{ height: 14, width: '85%' }} />
            <div className="skeleton" style={{ height: 14, width: '60%' }} />
          </div>
        ))}
        <div className="skeleton" style={{ height: 14, width: '40%' }} />
      </div>
    )
  }
  return (
    <div className="notes-skeleton-overview">
      <div className="skeleton" style={{ height: 26, width: 120 }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 10px',
          }}
        >
          <div
            className="skeleton"
            style={{ width: 20, height: 20, borderRadius: 'var(--r-sm)' }}
          />
          <div className="skeleton" style={{ height: 14, width: 180 }} />
        </div>
      ))}
    </div>
  )
}

export function Notes() {
  const navigate = useNavigate()
  const { pageId } = useParams<{ pageId: string }>()
  const [pages, setPages] = useState<Page[]>([])
  const [trash, setTrash] = useState<Page[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 640,
  )
  const [isRailMobile, setIsRailMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 800,
  )
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 800,
  )
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Page | null>(null)
  const [createMenu, setCreateMenu] = useState<'topbar' | null>(null)
  const newPageRef = useRef<HTMLButtonElement>(null)
  // Minimal toast: one message + timeout, used for safe/undoable feedback.
  const [toast, setToast] = useState('')
  const toastTimer = useRef(0)
  const showToast = (message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2500)
  }
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

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
    const drawer = window.matchMedia('(max-width: 800px)')
    const updateDrawer = () => {
      setIsRailMobile(drawer.matches)
      setSidebarOpen(!drawer.matches)
    }
    drawer.addEventListener('change', updateDrawer)
    return () => drawer.removeEventListener('change', updateDrawer)
  }, [])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(media.matches)
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

  const createPage = async (
    parentId: string | null,
    type: Page['type'] = 'page',
  ): Promise<Page | null> => {
    try {
      const page = await notesApi.create({
        parent_page_id: parentId,
        title: 'Untitled',
        type,
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

  const create = async (
    parentId: string | null,
    type: Page['type'] = 'page',
  ) => {
    const page = await createPage(parentId, type)
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
      // Keep the local content reference: the server echoes what we sent but
      // re-serialized, and swapping it would churn (or reset) the open editor
      // after every autosave — the checkbox jank on mobile.
      setPages((current) =>
        current.map((page) =>
          page.id === id ? { ...saved, content: page.content } : page,
        ),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save page')
      throw reason
    }
  }

  const applyRemotePatch = useCallback(
    (
      id: string,
      input: Partial<Pick<Page, 'title' | 'icon' | 'cover' | 'content'>>,
    ) => {
      setPages((current) =>
        current.map((page) => (page.id === id ? { ...page, ...input } : page)),
      )
    },
    [],
  )

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
      {(!isRailMobile || sidebarOpen) && (
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
          onCreate={(parentId, type) => void create(parentId, type)}
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
          <div
            className="notes-topbar"
            style={
              isMobile
                ? {
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 10,
                    padding: '12px 14px 10px',
                    position: 'relative',
                  }
                : { position: 'relative' }
            }
          >
            <div
              style={
                isMobile
                  ? {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      position: 'relative',
                    }
                  : { display: 'contents' }
              }
            >
              <button
                type="button"
                className="notes-nav-btn"
                aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
                aria-pressed={sidebarOpen}
                onClick={() => setSidebarOpen((open) => !open)}
                style={
                  isMobile
                    ? { position: 'absolute', left: 0, flexShrink: 0 }
                    : undefined
                }
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
              <h2
                className="notes-topbar-title"
                style={
                  isMobile ? { textAlign: 'center', flex: 'none' } : undefined
                }
              >
                {trash ? 'Trash' : selected?.title || 'Notes'}
              </h2>
            </div>
            <button
              ref={newPageRef}
              type="button"
              aria-label="New page"
              aria-expanded={createMenu === 'topbar'}
              onClick={() =>
                setCreateMenu(createMenu === 'topbar' ? null : 'topbar')
              }
              style={{
                position: 'absolute',
                top: isMobile ? 12 : 14,
                right: isMobile ? 14 : 20,
                width: 26,
                height: 26,
                background: 'var(--accent-tint)',
                border: '1px solid var(--accent-tint-border)',
                borderRadius: 8,
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background .15s',
                zIndex: 4,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M10 4v12M4 10h12" />
              </svg>
            </button>
            <CreatePageMenu
              anchorRef={newPageRef}
              open={createMenu === 'topbar'}
              onClose={() => setCreateMenu(null)}
              onCreate={(type) => void create(null, type)}
            />
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
                    showToast('Page restored')
                  })
                }
                onDeleteForever={(id) =>
                  void notesApi
                    .deletePermanent(id)
                    .then(() => {
                      setTrash(
                        (current) =>
                          current?.filter((item) => item.id !== id) ?? [],
                      )
                      showToast('Deleted forever')
                    })
                    .catch((reason) =>
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : 'Could not delete page',
                      ),
                    )
                }
              />
            ) : loading ? (
              <NotesSkeleton type={pageId ? 'page' : 'overview'} />
            ) : selected ? (
              <PageView
                page={selected}
                ancestors={ancestors}
                onPatch={(input) => patchPage(selected.id, input)}
                onOpenPage={(id) => navigate(`/notes/${id}`)}
                pages={pages}
                onPatchPage={patchPage}
                onCreatePage={(parentId) => void createPage(parentId)}
                onRemotePatch={(input) => applyRemotePatch(selected.id, input)}
              />
            ) : (
              <main className="notes-overview" aria-label="All notes">
                <h1>{loading ? 'Loading…' : 'Notes'}</h1>
                {!loading &&
                  (pages.length === 0 ? (
                    <p className="notes-overview-empty">
                      No pages yet — create one with “New page” above.
                    </p>
                  ) : (
                    <OverviewTree
                      pages={pages}
                      parentId={null}
                      depth={0}
                      onOpen={(id) => navigate(`/notes/${id}`)}
                    />
                  ))}
              </main>
            )}
          </section>
        </div>
      </div>
      {toast && (
        <div className="notes-toast" role="status">
          {toast}
        </div>
      )}
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

/** Front-page overview: the whole page tree as clickable rows. */
function OverviewTree({
  pages,
  parentId,
  depth,
  onOpen,
}: {
  pages: Page[]
  parentId: string | null
  depth: number
  onOpen: (id: string) => void
}) {
  const children = pages
    .filter((page) => page.parent_page_id === parentId)
    .sort((a, b) => a.position.localeCompare(b.position))
  if (!children.length) return null
  return (
    <ul className="notes-overview-list">
      {children.map((page) => (
        <li key={page.id}>
          <button
            type="button"
            className="notes-overview-row"
            style={{ paddingLeft: 10 + depth * 20 }}
            onClick={() => onOpen(page.id)}
          >
            {page.icon || page.type === 'folder' ? (
              <span className="notes-overview-icon" aria-hidden="true">
                {page.icon || (
                  <svg
                    className="notes-folder-icon"
                    width="13"
                    height="13"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 5.5a1 1 0 011-1h4l2 2h7a1 1 0 011 1v8a1 1 0 01-1 1h-13a1 1 0 01-1-1z" />
                  </svg>
                )}
              </span>
            ) : null}
            <span className="notes-overview-title">
              {page.title || 'Untitled'}
            </span>
          </button>
          <OverviewTree
            pages={pages}
            parentId={page.id}
            depth={depth + 1}
            onOpen={onOpen}
          />
        </li>
      ))}
    </ul>
  )
}
