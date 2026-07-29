import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/react'
import { BlockEditor } from './editor/BlockEditor'
import { DatabasePage } from './database/DatabasePage'
import { Backlinks } from './Backlinks'
import { notesApi } from './api'
import { useSettings } from '../../context/settings'
import { EmojiPicker } from '../../components/EmojiPicker'
import { CoverPicker } from './CoverPicker'
import { coverClass } from './covers'
import type { Backlink, Page, SearchResult } from './types'
import { ShareManager } from '../../components/ShareManager'
import { useNoteCollaboration } from './NoteCollaboration'

interface PageViewProps {
  page: Page
  ancestors: Page[]
  onPatch: (
    input: Partial<Pick<Page, 'title' | 'icon' | 'content' | 'cover'>>,
  ) => Promise<void>
  onOpenPage: (id: string) => void
  onOpenEvent?: (id: string) => void
  /** All loaded pages — needed to render database records. */
  pages?: Page[]
  onPatchPage?: (
    id: string,
    input: Partial<Pick<Page, 'properties'>>,
  ) => Promise<void> | void
  onCreatePage?: (parentId: string) => void
  onRemotePatch?: (
    input: Partial<Pick<Page, 'title' | 'icon' | 'cover' | 'content'>>,
  ) => void
}

export function PageView({
  page,
  ancestors,
  onPatch,
  onOpenPage,
  onOpenEvent,
  pages,
  onPatchPage,
  onCreatePage,
  onRemotePatch,
}: PageViewProps) {
  const role = page.effective_role ?? 'owner'
  const canEdit = role !== 'viewer'
  const collaboration = useNoteCollaboration(page.id, onRemotePatch)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>(
    'saved',
  )
  const [title, setTitle] = useState(page.title)
  const [icon, setIcon] = useState(page.icon || '')
  const [inputPageId, setInputPageId] = useState(page.id)
  const metadataTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const coverAnchorRef = useRef<HTMLButtonElement>(null)

  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  // Last pointerdown target in the page head. Title blur uses it because on
  // iOS buttons never take focus, so blur's relatedTarget is null there.
  const headPointerRef = useRef<EventTarget | null>(null)
  const { settings } = useSettings()
  const iconPresets =
    settings.favorite_emojis.length > 0
      ? settings.favorite_emojis
      : ['📅', '💼', '☕', '🏃', '🍽️', '📝', '🎧', '🎯']

  if (inputPageId !== page.id) {
    setInputPageId(page.id)
    setTitle(page.title)
    setIcon(page.icon || '')
  }
  useEffect(() => {
    // Resyncs local edit state with the upstream page — needed when a save
    // round-trip or a remote collaborator's patch changes title/icon while
    // this page stays open (not just on page-id change, handled above).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(page.title)
    setIcon(page.icon || '')
  }, [page.icon, page.title])
  useEffect(() => () => clearTimeout(metadataTimer.current), [])

  const saveMetadata = (input: Pick<Page, 'title'> | Pick<Page, 'icon'>) => {
    clearTimeout(metadataTimer.current)
    setSaveState('saving')
    metadataTimer.current = setTimeout(() => {
      onPatch(input)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 500)
  }

  const saveContent = async (content: JSONContent) => {
    setSaveState('saving')
    try {
      await onPatch({ content })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  const openNode = (node: SearchResult | Backlink) => {
    const type = 'type' in node ? node.type : node.source_type
    const id = 'type' in node ? node.id : node.source_id
    if (type === 'page') onOpenPage(id)
    else onOpenEvent?.(id)
  }

  const setCover = (cover: string | null) => {
    setSaveState('saving')
    onPatch({ cover })
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'))
  }

  const exportPdf = () => {
    const printable = document
      .querySelector('.notes-page')
      ?.cloneNode(true) as HTMLElement | null
    if (!printable) return
    printable
      .querySelectorAll('[contenteditable]')
      .forEach((element) => element.removeAttribute('contenteditable'))
    printable
      .querySelectorAll(
        '.notes-breadcrumbs, .notes-save-state, .notes-page-actions, .notes-add-cover-anchor, .notes-cover-change, .editor-icon-popover, .notes-block-gutter, .notes-selection-toolbar, .notes-slash-menu, .notes-mention-menu, .notes-table-toolbar, .notes-col-drop-indicator',
      )
      .forEach((element) => element.remove())
    const iconSlot = printable.querySelector('.editor-icon-picker')
    if (iconSlot) {
      const icon = document.createElement('span')
      icon.className = 'notes-print-icon'
      icon.textContent = page.icon || ''
      iconSlot.replaceWith(icon)
    }
    const titleInput = printable.querySelector('.notes-title-input')
    if (titleInput) {
      const heading = document.createElement('h1')
      heading.className = 'notes-title-input'
      heading.textContent = title || 'Untitled'
      titleInput.replaceWith(heading)
    }
    const styles = Array.from(
      document.head.querySelectorAll('link[rel="stylesheet"], style'),
    )
      .map((style) => style.outerHTML)
      .join('')
    const popup = window.open('', '_blank')
    if (!popup) {
      setSaveState('error')
      return
    }
    popup.addEventListener(
      'load',
      () => {
        popup.focus()
        popup.print()
      },
      { once: true },
    )
    popup.document.write(
      `<!doctype html><html><head><title>Note export</title>${styles}<style>@page{margin:12mm}html,body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.notes-page{width:100%;margin:0;padding:0}.notes-page-head{margin:0 0 20px}.notes-print-icon{font-size:34px;line-height:1}.notes-title-input{margin:0!important}</style></head><body>${printable.outerHTML}</body></html>`,
    )
    popup.document.close()
    popup.document.title = title || 'Untitled'
    popup.opener = null
  }

  return (
    <main className="notes-page">
      <div className={`notes-page-actions${page.cover ? '' : ' no-cover'}`}>
        <ShareManager
          resource="pages"
          resourceId={page.id}
          collaborators={page.collaborators ?? []}
          owner={role === 'owner'}
          effectiveRole={role === 'owner' ? undefined : role}
          ownerEmail={page.owner_email}
          ownerName={page.owner_name}
          onChanged={() => window.location.reload()}
        />
        <button type="button" className="notes-print" onClick={exportPdf}>
          Export PDF
        </button>
        {!page.cover && canEdit && (
          <button
            ref={coverAnchorRef}
            type="button"
            className="notes-add-cover"
            aria-expanded={coverPickerOpen}
            onClick={() => setCoverPickerOpen(!coverPickerOpen)}
          >
            + Cover
          </button>
        )}
        {!page.cover && coverPickerOpen && (
          <CoverPicker
            anchorRef={coverAnchorRef}
            value={page.cover}
            onChange={setCover}
            onClose={() => setCoverPickerOpen(false)}
            favorites={settings.favorite_covers}
          />
        )}
      </div>
      {page.cover && (
        <div
          className={`notes-cover ${coverClass(page.cover)}`}
          style={
            page.cover.startsWith('gradient:')
              ? undefined
              : { backgroundImage: `url("${page.cover}")` }
          }
        >
          {canEdit && (
            <button
              ref={coverAnchorRef}
              type="button"
              className="notes-cover-change"
              aria-expanded={coverPickerOpen}
              onClick={() => setCoverPickerOpen(!coverPickerOpen)}
            >
              Change cover
            </button>
          )}
          {coverPickerOpen && (
            <CoverPicker
              anchorRef={coverAnchorRef}
              value={page.cover}
              onChange={setCover}
              onClose={() => setCoverPickerOpen(false)}
              favorites={settings.favorite_covers}
            />
          )}
        </div>
      )}
      <nav className="notes-breadcrumbs" aria-label="Breadcrumb">
        {ancestors.map((ancestor) => (
          <button
            key={ancestor.id}
            type="button"
            onClick={() => onOpenPage(ancestor.id)}
          >
            {ancestor.title || 'Untitled'}
          </button>
        ))}
      </nav>
      <div
        className={`notes-page-head${icon ? '' : ' no-icon'}${iconPickerOpen ? ' icon-picker-open' : ''}`}
        onPointerDownCapture={(event) => {
          headPointerRef.current = event.target
        }}
      >
        <EmojiPicker
          icon={icon}
          onChange={(value) => {
            setIcon(value)
            saveMetadata({ icon: value || null })
          }}
          presets={iconPresets}
          label="page icon"
          onOpenChange={setIconPickerOpen}
        />
        <input
          className="notes-title-input"
          aria-label="Page title"
          value={title}
          placeholder="Untitled"
          readOnly={!canEdit}
          onClick={() => {
            // On touch devices without an icon, tapping the title opens
            // the emoji picker so users can add one.
            if (!icon && !iconPickerOpen) setIconPickerOpen(true)
          }}
          onBlur={(e) => {
            // Close the picker when leaving the title, unless the blur was
            // caused by tapping into the emoji picker (choosing an icon or
            // typing a custom one). relatedTarget covers desktop; the tracked
            // pointerdown target covers iOS, where buttons never take focus.
            const target = e.relatedTarget as HTMLElement | null
            const pointed = headPointerRef.current
            headPointerRef.current = null
            if (target?.closest('.editor-icon-picker')) return
            if (
              pointed instanceof Element &&
              pointed.closest('.editor-icon-picker')
            )
              return
            setIconPickerOpen(false)
          }}
          onChange={(event) => {
            setTitle(event.target.value)
            saveMetadata({ title: event.target.value })
          }}
        />
        <span className={`notes-save-state ${saveState}`} role="status">
          {collaboration.status === 'online'
            ? `Live · ${collaboration.presence}`
            : collaboration.status === 'connecting'
              ? 'Connecting…'
              : saveState === 'saving'
                ? 'Saving…'
                : saveState === 'error'
                  ? 'Could not save'
                  : 'Saved'}
        </span>
      </div>
      {page.type === 'folder' && pages ? (
        <div className="notes-list-view">
          {pages
            .filter((item) => item.parent_page_id === page.id)
            .map((child) => (
              <button
                key={child.id}
                type="button"
                className="notes-record-title notes-list-row"
                onClick={() => onOpenPage(child.id)}
              >
                {child.icon && <span aria-hidden="true">{child.icon}</span>}
                {child.title || 'Untitled'}
              </button>
            ))}
          {!pages.some((item) => item.parent_page_id === page.id) && (
            <p className="notes-empty">This folder is empty.</p>
          )}
          {onCreatePage && (
            <button
              type="button"
              className="notes-new-record"
              onClick={() => onCreatePage(page.id)}
            >
              + New page
            </button>
          )}
        </div>
      ) : page.type === 'database' && pages && onPatchPage ? (
        <DatabasePage
          key={page.id}
          page={page}
          records={pages.filter((item) => item.parent_page_id === page.id)}
          onOpenPage={onOpenPage}
          onPatchRecord={onPatchPage}
          onCreateRecord={
            onCreatePage ? () => onCreatePage(page.id) : undefined
          }
        />
      ) : (
        <BlockEditor
          key={page.id}
          content={page.content}
          onChange={saveContent}
          onSearch={notesApi.search}
          onMentionClick={openNode}
          bulletStyle={settings.notes_bullet_style}
          numberedStyle={settings.notes_numbered_style}
          readOnly={!canEdit}
        />
      )}
      <Backlinks nodeType="page" nodeId={page.id} onOpen={openNode} />
    </main>
  )
}
