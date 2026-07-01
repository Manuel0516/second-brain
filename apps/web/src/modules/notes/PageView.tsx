import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/react'
import { BlockEditor } from './editor/BlockEditor'
import { Backlinks } from './Backlinks'
import { notesApi } from './api'
import { useSettings } from '../../context/SettingsContext'
import { EmojiPicker } from '../../components/EmojiPicker'
import type { Backlink, Page, SearchResult } from './types'

interface PageViewProps {
  page: Page
  ancestors: Page[]
  onPatch: (
    input: Partial<Pick<Page, 'title' | 'icon' | 'content'>>,
  ) => Promise<void>
  onOpenPage: (id: string) => void
  onOpenEvent?: (id: string) => void
}

export function PageView({
  page,
  ancestors,
  onPatch,
  onOpenPage,
  onOpenEvent,
}: PageViewProps) {
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>(
    'saved',
  )
  const [title, setTitle] = useState(page.title)
  const [icon, setIcon] = useState(page.icon || '')
  const [inputPageId, setInputPageId] = useState(page.id)
  const metadataTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const [iconPickerOpen, setIconPickerOpen] = useState(false)
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

  return (
    <main className="notes-page">
      <nav className="notes-breadcrumbs" aria-label="Breadcrumb">
        {ancestors.map((ancestor) => (
          <button
            key={ancestor.id}
            type="button"
            onClick={() => onOpenPage(ancestor.id)}
          >
            {ancestor.title}
          </button>
        ))}
      </nav>
      <div
        className={`notes-page-head${icon ? '' : ' no-icon'}${iconPickerOpen ? ' icon-picker-open' : ''}`}
      >
        {icon ? (
          <input
            className="notes-icon-input"
            aria-label="Page icon"
            value={icon}
            placeholder="＋"
            maxLength={16}
            onChange={(event) => {
              setIcon(event.target.value)
              saveMetadata({ icon: event.target.value || null })
            }}
          />
        ) : (
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
        )}
        <input
          className="notes-title-input"
          aria-label="Page title"
          value={title}
          placeholder="Untitled"
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
      </div>
      <BlockEditor
        key={page.id}
        content={page.content}
        onChange={saveContent}
        onSearch={notesApi.search}
        onMentionClick={openNode}
      />
      <Backlinks nodeType="page" nodeId={page.id} onOpen={openNode} />
    </main>
  )
}
