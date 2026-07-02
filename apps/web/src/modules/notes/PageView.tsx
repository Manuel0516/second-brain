import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/react'
import { BlockEditor } from './editor/BlockEditor'
import { DatabasePage } from './database/DatabasePage'
import { Backlinks } from './Backlinks'
import { notesApi } from './api'
import { useSettings } from '../../context/SettingsContext'
import { EmojiPicker } from '../../components/EmojiPicker'
import { CoverPicker, coverClass } from './CoverPicker'
import type { Backlink, Page, SearchResult } from './types'

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
}: PageViewProps) {
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>(
    'saved',
  )
  const [title, setTitle] = useState(page.title)
  const [icon, setIcon] = useState(page.icon || '')
  const [inputPageId, setInputPageId] = useState(page.id)
  const metadataTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
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

  return (
    <main className="notes-page">
      {page.cover && (
        <div
          className={`notes-cover ${coverClass(page.cover)}`}
          style={
            page.cover.startsWith('gradient:')
              ? undefined
              : { backgroundImage: `url(${page.cover})` }
          }
        >
          <button
            type="button"
            className="notes-cover-change"
            aria-expanded={coverPickerOpen}
            onClick={() => setCoverPickerOpen(!coverPickerOpen)}
          >
            Change cover
          </button>
          {coverPickerOpen && (
            <CoverPicker
              value={page.cover}
              onChange={setCover}
              onClose={() => setCoverPickerOpen(false)}
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
          onClick={() => {
            // On touch devices without an icon, tapping the title opens
            // the emoji picker so users can add one.
            if (!icon && !iconPickerOpen) setIconPickerOpen(true)
          }}
          onChange={(event) => {
            setTitle(event.target.value)
            saveMetadata({ title: event.target.value })
          }}
        />
        <span className={`notes-save-state ${saveState}`} role="status">
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'error'
              ? 'Could not save'
              : 'Saved'}
        </span>
        {!page.cover && (
          <div className="notes-add-cover-anchor">
            <button
              type="button"
              className="notes-add-cover"
              aria-expanded={coverPickerOpen}
              onClick={() => setCoverPickerOpen(!coverPickerOpen)}
            >
              + Cover
            </button>
            {coverPickerOpen && (
              <CoverPicker
                value={null}
                onChange={setCover}
                onClose={() => setCoverPickerOpen(false)}
              />
            )}
          </div>
        )}
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
        />
      )}
      <Backlinks nodeType="page" nodeId={page.id} onOpen={openNode} />
    </main>
  )
}
