/** Mathematics stays in TipTap's inlineMath/blockMath JSON nodes; custom node
 * views provide in-place LaTeX editing before KaTeX rendering. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  DragHandle,
  type DragHandleProps,
} from '@tiptap/extension-drag-handle-react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import 'katex/dist/katex.min.css'
import '../notes.css'
import '../listMarkers.css'
import { EMPTY_DOCUMENT, type SearchResult } from '../types'
import {
  EditableBlockMath,
  EditableInlineMath,
  insertEditableInlineMath,
} from './MathExtensions'
import { EditableTaskItem } from './TaskItemExtension'
import { LinkPopover, normalizeHref } from './LinkPopover'
import { LocationNode, insertLocation } from './LocationNode'
import { CalloutNode } from './CalloutNode'
import {
  CollapsibleHeading,
  selectCollapsedHeadingSection,
} from './CollapsibleHeading'
import { stripDetails } from './migrateContent'
import {
  BlockColor,
  COLOR_NAMES,
  NoteHighlight,
  NoteTextColor,
  onColor,
  setSelectedBlockColor,
} from './ColorExtensions'
import { NotesCodeBlock } from './CodeBlockView'
import { ImageBlock, uploadImageFile } from './ImageNode'
import { BookmarkNode, fetchBookmarkMeta } from './BookmarkNode'
import {
  ColumnList,
  Column,
  getColumnDropTarget,
  handleColumnDrop,
} from './ColumnNodes'
import { TableToolbar } from './TableToolbar'
import { TextAlign, TEXT_ALIGNMENTS } from './TextAlignExtension'
import { useSettings } from '../../../context/SettingsContext'
// left-start: the rail anchors to the block's TOP edge, so tall blocks (a
// list item with nested children, a wrapped paragraph) keep the handle beside
// their first line instead of floating at the subtree's vertical middle.
// CSS nudges it onto the first text line per node type (--rail-y).
const DRAG_POSITION_CONFIG = { placement: 'left-start' as const }
const DRAG_NESTED_CONFIG = {
  rules: [
    {
      id: 'top-level-or-list-item',
      evaluate: ({ node, depth }) => {
        // Column containers never drag as a whole — their blocks do.
        if (node.type.name === 'columnList' || node.type.name === 'column')
          return 1000
        if (
          depth === 1 ||
          node.type.name === 'listItem' ||
          node.type.name === 'taskItem'
        )
          return 0
        // Blocks directly inside a column sit at depth 3 (doc > columnList >
        // column > block); score above list items so those still win ties.
        if (depth === 3) return 10
        return 1000
      },
    },
  ],
} satisfies Exclude<DragHandleProps['nested'], boolean | undefined>

const NoteMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      type: { default: 'page' },
    }
  },
})

interface BlockEditorProps {
  content: JSONContent
  onChange: (content: JSONContent) => void | Promise<void>
  onSearch?: (query: string) => Promise<SearchResult[]>
  onMentionClick?: (mention: SearchResult) => void
  debounceMs?: number
  readOnly?: boolean
  ariaLabel?: string
  /** List marker schemes from settings — presentation only (CSS), never
   *  written into the document. Unknown values fall back to the defaults. */
  bulletStyle?: string
  numberedStyle?: string
}

/** Depth of the block the cursor is in. Inside a list this is the list
 *  LINE (listItem/taskItem) — acting on depth 1 there would hit the whole
 *  list and wipe every sibling item. Otherwise: top-level or a column's
 *  child. */
function blockDepth(editor: Editor): number | null {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const name = $from.node(depth).type.name
    if (name === 'listItem' || name === 'taskItem') return depth
  }
  for (let depth = 1; depth <= $from.depth; depth += 1) {
    const name = $from.node(depth).type.name
    if (name !== 'columnList' && name !== 'column') return depth
  }
  return null
}

/** Duplicate the block at the cursor (no-op at doc level). */
export function duplicateBlock(editor: Editor): void {
  const depth = blockDepth(editor)
  if (depth === null) return
  const { $from } = editor.state.selection
  editor
    .chain()
    .focus()
    .insertContentAt($from.after(depth), $from.node(depth).toJSON())
    .run()
}

/** Delete the block at the cursor (no-op at doc level). */
export function deleteBlock(editor: Editor): void {
  const depth = blockDepth(editor)
  if (depth === null) return
  const { $from } = editor.state.selection
  editor
    .chain()
    .focus()
    .deleteRange({ from: $from.before(depth), to: $from.after(depth) })
    .run()
}

const slashItems = [
  {
    label: 'Text',
    keywords: 'paragraph',
    run: (editor: Editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    label: 'Heading 1',
    keywords: 'title h1',
    run: (editor: Editor) =>
      editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    label: 'Heading 2',
    keywords: 'subtitle h2',
    run: (editor: Editor) =>
      editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Heading 3',
    keywords: 'subheading h3',
    run: (editor: Editor) =>
      editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'Bulleted list',
    keywords: 'unordered',
    run: (editor: Editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    label: 'Numbered list',
    keywords: 'ordered',
    run: (editor: Editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    label: 'To-do',
    keywords: 'task checkbox',
    run: (editor: Editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    label: 'Quote',
    keywords: 'blockquote',
    run: (editor: Editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    label: 'Code',
    keywords: 'code block',
    run: (editor: Editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    label: 'Divider',
    keywords: 'line horizontal',
    run: (editor: Editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    label: 'Table',
    keywords: 'grid',
    run: (editor: Editor) =>
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    label: 'Location',
    keywords: 'map place address',
    run: (editor: Editor) => void insertLocation(editor),
  },
  {
    label: 'Inline math',
    keywords: 'latex formula',
    run: insertEditableInlineMath,
  },
  {
    label: 'Equation',
    keywords: 'block math latex formula',
    run: (editor: Editor) =>
      editor
        .chain()
        .focus()
        .insertContent({ type: 'blockMath', attrs: { latex: '', label: '' } })
        .run(),
  },
  {
    label: 'Callout',
    keywords: 'info note aside highlight emoji',
    run: (editor: Editor) => editor.chain().focus().wrapIn('callout').run(),
  },
  {
    label: 'Image',
    keywords: 'picture photo upload file',
    run: (editor: Editor) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        const src = await uploadImageFile(file)
        if (src)
          editor.chain().focus().setImageBlock({ src, alt: file.name }).run()
      }
      input.click()
    },
  },
  {
    label: 'Bookmark',
    keywords: 'link embed card url website',
    run: (editor: Editor) => {
      const raw = window.prompt('Paste a URL')?.trim()
      if (!raw) return
      const url =
        raw.startsWith('http://') || raw.startsWith('https://')
          ? raw
          : `https://${raw}`
      void fetchBookmarkMeta(url).then((meta) =>
        editor.chain().focus().setBookmark(meta).run(),
      )
    },
  },
  {
    label: '2 columns',
    keywords: 'layout split two column',
    run: (editor: Editor) => editor.chain().focus().setColumnLayout(2).run(),
  },
  {
    label: '3 columns',
    keywords: 'layout split three column',
    run: (editor: Editor) => editor.chain().focus().setColumnLayout(3).run(),
  },
  // Formatting — the selection-toolbar actions, reachable from '/' too.
  // With a collapsed cursor the mark applies to what you type next.
  {
    label: 'Bold',
    keywords: 'format strong',
    run: (editor: Editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    label: 'Italic',
    keywords: 'format emphasis',
    run: (editor: Editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    label: 'Strikethrough',
    keywords: 'format strike',
    run: (editor: Editor) => editor.chain().focus().toggleStrike().run(),
  },
  {
    label: 'Inline code',
    keywords: 'format monospace',
    run: (editor: Editor) => editor.chain().focus().toggleCode().run(),
  },
  {
    label: 'Link',
    keywords: 'format url href',
    run: (editor: Editor) => {
      const href = normalizeHref(window.prompt('Link URL') ?? '')
      if (!href) return
      if (editor.state.selection.empty) {
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: 'text',
              text: href,
              marks: [{ type: 'link', attrs: { href } }],
            },
            { type: 'text', text: ' ' },
          ])
          .run()
      } else {
        editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
      }
    },
  },
  // Block actions on the current top-level block.
  {
    label: 'Duplicate block',
    keywords: 'copy dup clone',
    run: duplicateBlock,
  },
  {
    label: 'Delete block',
    keywords: 'remove',
    run: deleteBlock,
  },
] as const

const toolbarIcons = {
  bold: <path d="M6 3.5h5a3.5 3.5 0 010 7H6zm0 7h5.5a3 3 0 010 6H6z" />,
  italic: <path d="M10 3.5h5M5 16.5h5M12.5 3.5l-5 13" />,
  strike: (
    <path d="M4 10h12M14 6.5c-.5-2-2-3-4-3-2.2 0-3.8 1.1-3.8 2.8 0 1.3.8 2 2.1 2.5m.2 2.5c2.6.5 4.3 1 4.3 2.7 0 1.6-1.5 2.8-3.7 2.8-2.1 0-3.7-1-4.2-2.8" />
  ),
  code: <path d="M7 5.5L2.5 10 7 14.5M13 5.5l4.5 4.5-4.5 4.5" />,
  link: (
    <path d="M7.5 12.5l5-5M6.2 14.8l-1 .9a3 3 0 01-4.2-4.2l3-3a3 3 0 014.2 0M13.8 5.2l1-.9a3 3 0 014.2 4.2l-3 3a3 3 0 01-4.2 0" />
  ),
  math: <path d="M15.5 4H6l5 6-5 6h9.5" />,
  left: <path d="M3 4h14M3 8h8M3 12h14M3 16h8" />,
  center: <path d="M3 4h14M6 8h8M3 12h14M6 16h8" />,
  right: <path d="M3 4h14M9 8h8M3 12h14M9 16h8" />,
  justify: <path d="M3 4h14M3 8h14M3 12h14M3 16h14" />,
} as const

function ToolbarIcon({ type }: { type: keyof typeof toolbarIcons }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {toolbarIcons[type]}
    </svg>
  )
}

export function BlockEditor({
  content,
  onChange,
  onSearch,
  onMentionClick,
  // 1200ms: batches rapid edits (mobile todo checking) into one save; safe
  // because the pending save is flushed on unmount.
  debounceMs = 1200,
  readOnly = false,
  ariaLabel = 'Page content',
  bulletStyle = 'disc',
  numberedStyle = 'decimal',
}: BlockEditorProps) {
  const editorContent = useMemo(
    () => (content.type ? stripDetails(content) : EMPTY_DOCUMENT),
    [content],
  )
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Editor with a debounced save still waiting — flushed on unmount.
  const pendingSaveRef = useRef<Editor | null>(null)
  // The JSON object this editor last emitted through onChange. The autosave
  // round-trip hands it straight back as the content prop; recognising it by
  // reference skips the whole-document compare below, whose double
  // JSON.stringify caused a visible hitch on phones (janky todo checking).
  const lastEmittedRef = useRef<JSONContent | null>(null)
  const onChangeRef = useRef(onChange)
  const searchRef = useRef(onSearch)
  const clickRef = useRef(onMentionClick)
  const containerRef = useRef<HTMLDivElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const colorButtonRef = useRef<HTMLButtonElement>(null)
  const colorPanelRef = useRef<HTMLDivElement>(null)
  const alignBtnRef = useRef<HTMLButtonElement>(null)
  const alignPanelRef = useRef<HTMLDivElement>(null)
  const dragSourceRef = useRef<HTMLElement | null>(null)
  // Position (doc offset) of the block the drag-handle gutter is pointing at.
  const hoverPosRef = useRef<number | null>(null)
  // Refs for state used in editorProps.handleKeyDown (avoids stale closures).
  const slashRef = useRef<{ query: string; from: number } | null>(null)
  const filteredSlashRef = useRef<(typeof slashItems)[number][]>([])
  const slashIndexRef = useRef(0)
  const mentionRef = useRef<{ query: string; from: number } | null>(null)
  const mentionItemsRef = useRef<SearchResult[]>([])
  const mentionIndexRef = useRef(0)
  const chooseSlashRef = useRef<(index: number) => void>(() => {})
  const chooseMentionRef = useRef<(index: number) => void>(() => {})
  const [slash, setSlash] = useState<{ query: string; from: number } | null>(
    null,
  )
  const [slashIndex, setSlashIndex] = useState(0)
  const [mention, setMention] = useState<{
    query: string
    from: number
  } | null>(null)
  const [mentionItems, setMentionItems] = useState<SearchResult[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const { settings } = useSettings()
  const [linkOpen, setLinkOpen] = useState(false)
  const [colorsOpen, setColorsOpen] = useState(false)
  const [alignOpen, setAlignOpen] = useState(false)
  const [highlightCustomHex, setHighlightCustomHex] = useState('#22d3ee')
  const [blockCustomHex, setBlockCustomHex] = useState('#22d3ee')
  const [textCustomHex, setTextCustomHex] = useState('#f0ede5')
  const [linkHref, setLinkHref] = useState('')
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({
    left: 0,
    top: 36,
  })
  // Vertical accent bar shown while dragging a block over a column edge.
  const [columnDrop, setColumnDrop] = useState<{
    left: number
    top: number
    height: number
  } | null>(null)
  const columnDropKeyRef = useRef('')
  useEffect(() => {
    onChangeRef.current = onChange
    searchRef.current = onSearch
    clickRef.current = onMentionClick
  }, [onChange, onMentionClick, onSearch])
  useEffect(() => {
    if (!colorsOpen && !alignOpen) return
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        colorButtonRef.current?.contains(target) ||
        colorPanelRef.current?.contains(target) ||
        alignBtnRef.current?.contains(target) ||
        alignPanelRef.current?.contains(target)
      )
        return
      setColorsOpen(false)
      setAlignOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [colorsOpen, alignOpen])

  const editor = useEditor({
    // This app is client-rendered only (no SSR), so there's no hydration
    // mismatch to avoid — render synchronously so `editor.view` is available
    // as soon as `editor` is truthy (Tiptap v3 defaults this to false, which
    // otherwise crashes any effect that reads `editor.view` on mount).
    immediatelyRender: true,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: {
            rel: 'noopener noreferrer',
            target: '_blank',
          },
        },
        // Accent insertion line while dragging blocks.
        dropcursor: { color: 'var(--accent)', width: 2 },
        // Replaced by CollapsibleHeading (adds the collapsed attribute).
        heading: false,
        // Replaced by NotesCodeBlock (lowlight + language picker).
        codeBlock: false,
      }),
      NoteHighlight,
      NoteTextColor,
      BlockColor,
      NotesCodeBlock,
      TaskList,
      EditableTaskItem,
      // Stock table view (no NodeView) so prosemirror-tables' native column
      // resizing works; controls live in the floating TableToolbar overlay.
      Table.configure({ resizable: true }),
      TextAlign,
      TableRow,
      TableHeader,
      TableCell,
      ImageBlock,
      BookmarkNode,
      ColumnList,
      Column,
      Placeholder.configure({
        placeholder: "Type '/' for commands or '[[' to link…",
      }),
      EditableInlineMath,
      EditableBlockMath,
      LocationNode,
      CalloutNode,
      CollapsibleHeading.configure({ levels: [1, 2, 3] }),
      NoteMention.configure({
        HTMLAttributes: { class: 'notes-mention' },
        renderHTML: ({ node }) => [
          'button',
          {
            class: 'notes-mention',
            type: 'button',
            'data-id': node.attrs.id,
            'data-type': node.attrs.type ?? 'page',
          },
          node.attrs.label ?? 'Untitled',
        ],
      }),
    ],
    content: editorContent,
    editorProps: {
      attributes: { 'aria-label': ariaLabel },
      handleDrop: (view, event, slice, moved) => {
        // Image files dropped in — upload and insert at the drop position.
        const files = Array.from(event.dataTransfer?.files ?? []).filter(
          (file) => file.type.startsWith('image/'),
        )
        if (files.length) {
          event.preventDefault()
          const coords = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })
          const dropPos = coords?.pos ?? view.state.selection.from
          void (async () => {
            let at = dropPos
            for (const file of files) {
              const src = await uploadImageFile(file)
              if (!src || !editor) continue
              editor
                .chain()
                .insertContentAt(Math.min(at, editor.state.doc.content.size), {
                  type: 'imageBlock',
                  attrs: { src, alt: file.name },
                })
                .run()
              at = editor.state.selection.to
            }
          })()
          return true
        }
        // A block dragged onto the left/right edge of another block becomes
        // a column beside it.
        if (moved && slice) return handleColumnDrop(view, event, slice)
        return false
      },
      handlePaste: (view, event) => {
        // Image files or screenshots pasted — upload and insert in place.
        const files = Array.from(event.clipboardData?.files ?? []).filter(
          (file) => file.type.startsWith('image/'),
        )
        if (files.length) {
          event.preventDefault()
          void (async () => {
            for (const file of files) {
              const src = await uploadImageFile(file)
              if (src)
                editor
                  ?.chain()
                  .focus()
                  .setImageBlock({ src, alt: file.name })
                  .run()
            }
          })()
          return true
        }

        // A bare URL pasted on an empty paragraph → bookmark card.
        const text = event.clipboardData?.getData('text/plain')?.trim()
        const { $from } = view.state.selection
        if (
          text &&
          /^https?:\/\/\S+$/.test(text) &&
          view.state.selection.empty &&
          $from.parent.type.name === 'paragraph' &&
          $from.parent.content.size === 0
        ) {
          event.preventDefault()
          void fetchBookmarkMeta(text).then((meta) => {
            editor?.chain().focus().setBookmark(meta).run()
          })
          return true
        }

        return false
      },
      handleClick: (_view, _position, event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>(
          '.notes-mention',
        )
        if (!target?.dataset.id) return false
        clickRef.current?.({
          id: target.dataset.id,
          type: (target.dataset.type as SearchResult['type']) || 'page',
          title: target.textContent || 'Untitled',
        })
        return true
      },
      // Intercept key events before TipTap's internal handlers run, so
      // Enter on the slash/mention menu selects the item instead of inserting a
      // new paragraph. Uses refs to avoid stale closures.
      handleKeyDown: (_view, event) => {
        const currentMention = mentionRef.current
        const currentMentionItems = mentionItemsRef.current
        if (currentMention && currentMentionItems.length) {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const direction = event.key === 'ArrowDown' ? 1 : -1
            mentionIndexRef.current =
              (mentionIndexRef.current +
                direction +
                currentMentionItems.length) %
              currentMentionItems.length
            setMentionIndex(mentionIndexRef.current)
            return true
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            chooseMentionRef.current(mentionIndexRef.current)
            return true
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setMention(null)
            return true
          }
        }
        const currentSlash = slashRef.current
        const currentFiltered = filteredSlashRef.current
        if (!currentSlash || !currentFiltered.length) return false
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const direction = event.key === 'ArrowDown' ? 1 : -1
          slashIndexRef.current =
            (slashIndexRef.current + direction + currentFiltered.length) %
            currentFiltered.length
          setSlashIndex(slashIndexRef.current)
          return true
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          chooseSlashRef.current(slashIndexRef.current)
          return true
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setSlash(null)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: current }) => {
      clearTimeout(saveTimer.current)
      pendingSaveRef.current = current
      saveTimer.current = setTimeout(() => {
        pendingSaveRef.current = null
        const json = current.getJSON()
        lastEmittedRef.current = json
        onChangeRef.current(json)
      }, debounceMs)
      const { $from } = current.state.selection
      const match = $from.parent
        .textBetween(0, $from.parentOffset)
        .match(/(?:^|\s)\/(\w*)$/)
      setSlash(
        match
          ? {
              query: match[1].toLowerCase(),
              from: $from.pos - match[0].trim().length,
            }
          : null,
      )
      const mentionMatch = $from.parent
        .textBetween(0, $from.parentOffset)
        .match(/\[\[([^\]]*)$/)
      setMention(
        mentionMatch
          ? { query: mentionMatch[1], from: $from.pos - mentionMatch[0].length }
          : null,
      )
      setSlashIndex(0)
      setMentionIndex(0)
    },
  })

  // Sync refs so editorProps.handleKeyDown always reads the latest values.
  useEffect(() => {
    slashRef.current = slash
  }, [slash])
  useEffect(() => {
    slashIndexRef.current = slashIndex
  }, [slashIndex])
  useEffect(() => {
    mentionRef.current = mention
  }, [mention])
  useEffect(() => {
    mentionItemsRef.current = mentionItems
  }, [mentionItems])
  useEffect(() => {
    mentionIndexRef.current = mentionIndex
  }, [mentionIndex])
  // Keep the keyboard-highlighted menu row visible (the menu scrolls now
  // that the command list has grown).
  useEffect(() => {
    containerRef.current
      ?.querySelector('.notes-slash-menu [aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [slashIndex, mentionIndex])

  // Flush any pending debounced save on unmount so the last edits (e.g. a
  // quick todo check right before navigating away) are never dropped.
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current)
      const pending = pendingSaveRef.current
      pendingSaveRef.current = null
      if (pending && !pending.isDestroyed) {
        const json = pending.getJSON()
        lastEmittedRef.current = json
        void onChangeRef.current(json)
      }
    },
    [],
  )
  // Track block drags to preview the column edge zones (the dropcursor's
  // horizontal line is hidden while this vertical indicator shows).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const dom = editor.view.dom
    const clear = () => {
      if (!columnDropKeyRef.current) return
      columnDropKeyRef.current = ''
      setColumnDrop(null)
    }
    const onDragOver = (event: DragEvent) => {
      const view = editor.view
      if (!view.dragging) return clear()
      const target = getColumnDropTarget(view, event)
      const { selection } = view.state
      if (
        !target ||
        (selection.from <= target.pos && target.pos < selection.to)
      )
        return clear()
      const key = `${target.pos}:${target.side}`
      if (key === columnDropKeyRef.current) return
      const blockDom = view.nodeDOM(target.pos)
      const box = containerRef.current?.getBoundingClientRect()
      if (!(blockDom instanceof HTMLElement) || !box) return clear()
      const rect = blockDom.getBoundingClientRect()
      columnDropKeyRef.current = key
      setColumnDrop({
        left:
          (target.side === 'left' ? rect.left - 8 : rect.right + 8) - box.left,
        top: rect.top - box.top,
        height: rect.height,
      })
    }
    dom.addEventListener('dragover', onDragOver)
    dom.addEventListener('drop', clear)
    window.addEventListener('dragend', clear)
    return () => {
      dom.removeEventListener('dragover', onDragOver)
      dom.removeEventListener('drop', clear)
      window.removeEventListener('dragend', clear)
    }
  }, [editor])
  // Anchor the slash/mention popover at the caret. Position is set in rAF (not
  // synchronously) so it never reads refs during render.
  useEffect(() => {
    if (!editor || (!slash && !mention)) return
    const frame = requestAnimationFrame(() => {
      const box = containerRef.current?.getBoundingClientRect()
      if (!box) return
      const caret = editor.view.coordsAtPos(editor.state.selection.from)
      setMenuPos({
        left: caret.left - box.left,
        top: caret.bottom - box.top + 6,
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [editor, slash, mention])
  useEffect(() => {
    if (!editor || editor.isFocused) return
    // Our own autosave echoing back — the editor already holds this state.
    if (content === lastEmittedRef.current) return
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(editorContent)) {
      editor.commands.setContent(editorContent, { emitUpdate: false })
    }
  }, [editor, content, editorContent])
  useEffect(() => editor?.setEditable(!readOnly), [editor, readOnly])
  useEffect(() => {
    let active = true
    if (!mention || !searchRef.current) {
      setMentionItems([])
      return
    }
    searchRef
      .current(mention.query)
      .then((items) => active && setMentionItems(items))
      .catch(() => active && setMentionItems([]))
    return () => {
      active = false
    }
  }, [mention])
  useEffect(
    () => () => {
      editor?.destroy()
    },
    [editor],
  )

  const filteredSlash = useMemo(
    () =>
      slashItems.filter((item) =>
        `${item.label} ${item.keywords}`
          .toLowerCase()
          .includes(slash?.query ?? ''),
      ),
    [slash],
  )

  const chooseSlash = (index: number) => {
    if (!editor || !slash) return
    editor
      .chain()
      .focus()
      .deleteRange({ from: slash.from, to: editor.state.selection.from })
      .run()
    filteredSlash[index]?.run(editor)
    setSlash(null)
  }

  const chooseMention = (index: number) => {
    const item = mentionItems[index]
    if (!editor || !mention || !item) return
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: mention.from, to: editor.state.selection.from },
        [
          {
            type: 'mention',
            attrs: { id: item.id, label: item.title, type: item.type },
          },
          { type: 'text', text: ' ' },
        ],
      )
      .run()
    setMention(null)
  }

  // ponytail: ref syncs must follow declarations to avoid hoisting lint errors.
  useEffect(() => {
    filteredSlashRef.current = filteredSlash
  }, [filteredSlash])
  useEffect(() => {
    chooseSlashRef.current = chooseSlash
  }, [chooseSlash])
  useEffect(() => {
    chooseMentionRef.current = chooseMention
  }, [chooseMention])

  const selectedBlock = editor?.state.selection.$from.node(
    editor.state.selection.$from.depth,
  )
  const activeBlockColor = selectedBlock?.attrs.blockColor as
    | string
    | null
    | undefined

  const handleDragNodeChange = useCallback(
    ({
      node,
      pos,
    }: Parameters<NonNullable<DragHandleProps['onNodeChange']>>[0]) => {
      hoverPosRef.current = typeof pos === 'number' && pos >= 0 ? pos : null
      const type = node?.type.name
      // Collapsing briefly reports no node; retain the last valid rail layout.
      if (type && gutterRef.current) {
        gutterRef.current.dataset.nodeType = type
        // Heading level drives the rail's first-line vertical nudge in CSS.
        gutterRef.current.dataset.nodeLevel = String(node?.attrs.level ?? '')
      }
    },
    [],
  )

  const selectCollapsedDragSection = useCallback(() => {
    if (!editor) return
    const pos = hoverPosRef.current
    if (pos == null) return
    selectCollapsedHeadingSection(editor, pos)
  }, [editor])

  const prepareBlockDrag = useCallback(() => {
    if (!editor) return
    const pos = hoverPosRef.current
    if (pos == null) return
    const source = editor.view.nodeDOM(pos)
    if (source instanceof HTMLElement) {
      source.classList.add('notes-dragging-block')
      dragSourceRef.current = source
    }
  }, [editor])

  const finishBlockDrag = useCallback(() => {
    dragSourceRef.current?.classList.remove('notes-dragging-block')
    dragSourceRef.current = null
  }, [])

  useEffect(() => finishBlockDrag, [finishBlockDrag])

  // "+" gutter button: add an empty block after the hovered one and open slash.
  const openSlashAtCursor = () => {
    if (!editor) return
    const pos = hoverPosRef.current
    if (pos != null) {
      const node = editor.state.doc.nodeAt(pos)
      const end = pos + (node?.nodeSize ?? 1)
      // Hovering a list line (nested drag handles): stay in the list — the
      // sibling must be a list item, not a top-level paragraph.
      const insert =
        node?.type.name === 'listItem' || node?.type.name === 'taskItem'
          ? { type: node.type.name, content: [{ type: 'paragraph' }] }
          : { type: 'paragraph' }
      editor
        .chain()
        .focus()
        .insertContentAt(end, insert)
        .setTextSelection(end + (insert.type === 'paragraph' ? 1 : 2))
        .run()
    } else {
      editor.chain().focus().run()
    }
    setSlash({ query: '', from: editor.state.selection.from })
  }

  return (
    <div
      className={`notes-editor${columnDrop ? ' notes-col-dropping' : ''}`}
      role="group"
      aria-label="Block editor"
      data-bullet-style={bulletStyle}
      data-numbered-style={numberedStyle}
      ref={containerRef}
    >
      {editor && (
        <>
          {/* Notion-style block gutter: add + drag on hover. */}
          <DragHandle
            editor={editor}
            // Floating UI pins the gutter to each block's top-left corner.
            computePositionConfig={DRAG_POSITION_CONFIG}
            // Every root block is draggable; list items remain independently
            // movable without targeting paragraphs inside other components.
            nested={DRAG_NESTED_CONFIG}
            onNodeChange={handleDragNodeChange}
            onElementDragStart={prepareBlockDrag}
            onElementDragEnd={finishBlockDrag}
          >
            <div className="notes-block-gutter" ref={gutterRef}>
              <button
                type="button"
                className="notes-block-add"
                aria-label="Add block"
                title="Add block"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={openSlashAtCursor}
              >
                +
              </button>
              <span
                className="notes-block-grip"
                aria-hidden="true"
                title="Drag to move"
                onPointerDown={selectCollapsedDragSection}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
                  <circle cx="3.5" cy="2" r="1.1" />
                  <circle cx="8.5" cy="2" r="1.1" />
                  <circle cx="3.5" cy="6" r="1.1" />
                  <circle cx="8.5" cy="6" r="1.1" />
                  <circle cx="3.5" cy="10" r="1.1" />
                  <circle cx="8.5" cy="10" r="1.1" />
                </svg>
              </span>
            </div>
          </DragHandle>

          {/* Floating inline-format toolbar at the selection. */}
          <BubbleMenu
            editor={editor}
            updateDelay={0}
            className="notes-selection-toolbar"
            options={{ placement: 'top' }}
          >
            {(
              [
                [
                  'Bold',
                  () => editor.chain().focus().toggleBold().run(),
                  'bold',
                ],
                [
                  'Italic',
                  () => editor.chain().focus().toggleItalic().run(),
                  'italic',
                ],
                [
                  'Strikethrough',
                  () => editor.chain().focus().toggleStrike().run(),
                  'strike',
                ],
                [
                  'Inline code',
                  () => editor.chain().focus().toggleCode().run(),
                  'code',
                ],
              ] as const
            ).map(([label, action, mark]) => (
              <button
                key={mark}
                type="button"
                aria-label={label}
                title={label}
                aria-pressed={editor.isActive(mark)}
                onClick={action}
              >
                <ToolbarIcon type={mark} />
              </button>
            ))}
            <button
              ref={colorButtonRef}
              type="button"
              aria-label="Add or edit link"
              title="Add or edit link"
              aria-pressed={editor.isActive('link')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setLinkHref(editor.getAttributes('link').href ?? '')
                setLinkOpen(true)
              }}
            >
              <ToolbarIcon type="link" />
            </button>
            <button
              type="button"
              aria-label="Inline equation"
              title="Inline equation"
              onClick={() => insertEditableInlineMath(editor)}
            >
              <ToolbarIcon type="math" />
            </button>
            <button
              ref={alignBtnRef}
              type="button"
              aria-label="Text alignment"
              title="Text alignment"
              aria-expanded={alignOpen}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setAlignOpen(!alignOpen)}
            >
              <ToolbarIcon
                type={
                  TEXT_ALIGNMENTS.find(
                    (a) => a !== 'left' && editor.isActive({ textAlign: a }),
                  ) ?? 'left'
                }
              />
            </button>
            {alignOpen && (
              <div
                ref={alignPanelRef}
                className="notes-align-popover"
                role="listbox"
                aria-label="Text alignment"
              >
                {TEXT_ALIGNMENTS.map((alignment) => (
                  <button
                    key={alignment}
                    type="button"
                    role="option"
                    aria-selected={
                      alignment === 'left'
                        ? !TEXT_ALIGNMENTS.some(
                            (other) =>
                              other !== 'left' &&
                              editor.isActive({ textAlign: other }),
                          )
                        : editor.isActive({ textAlign: alignment })
                    }
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      editor.chain().focus().setTextAlign(alignment).run()
                      setAlignOpen(false)
                    }}
                  >
                    <ToolbarIcon type={alignment} />
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className="notes-toolbar-pencil"
              aria-label="Colors"
              title="Text color, highlight and block color"
              aria-expanded={colorsOpen}
              aria-pressed={
                editor.isActive('highlight') ||
                Boolean(activeBlockColor) ||
                editor.isActive('textColor')
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setColorsOpen(!colorsOpen)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M13.5 3.5l3 3L7 16H4v-3z" />
                <path d="M3 19h14" />
              </svg>
            </button>
            {colorsOpen && (
              <div
                ref={colorPanelRef}
                className="notes-swatch-rows"
                role="dialog"
                aria-label="Text, highlight and block colors"
              >
                <div
                  className="notes-swatch-section"
                  role="group"
                  aria-label="Text color"
                >
                  <span className="notes-swatch-label">Text</span>
                  <div className="notes-swatch-options">
                    {/* Favourites replace the built-in palette; the named
                        defaults only show while no favourites are saved. */}
                    {settings.favorite_text_colors.length === 0 &&
                      COLOR_NAMES.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={`notes-swatch text-${name}`}
                          aria-label={`Text color ${name}`}
                          aria-pressed={editor.isActive('textColor', {
                            color: name,
                          })}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            editor.chain().focus().toggleTextColor(name).run()
                            setColorsOpen(false)
                          }}
                        />
                      ))}
                    {settings.favorite_text_colors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="notes-swatch"
                        style={
                          {
                            background: color,
                            '--sw-on': onColor(color),
                          } as React.CSSProperties
                        }
                        aria-label={`Text color ${color}`}
                        aria-pressed={editor.isActive('textColor', { color })}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          editor.chain().focus().toggleTextColor(color).run()
                          setColorsOpen(false)
                        }}
                      />
                    ))}
                    <label
                      className={`notes-swatch notes-swatch-custom ${
                        editor.isActive('textColor') &&
                        !COLOR_NAMES.some((n) =>
                          editor.isActive('textColor', { color: n }),
                        ) &&
                        !settings.favorite_text_colors.some((c) =>
                          editor.isActive('textColor', { color: c }),
                        )
                          ? 'notes-swatch-active'
                          : ''
                      }`}
                      title="Custom text color"
                      style={
                        {
                          background: textCustomHex,
                          '--sw-on': onColor(textCustomHex),
                        } as React.CSSProperties
                      }
                    >
                      <input
                        type="color"
                        aria-label="Custom text color"
                        value={textCustomHex}
                        onChange={(e) => {
                          const hex = e.target.value
                          setTextCustomHex(hex)
                          editor.chain().focus().toggleTextColor(hex).run()
                          setColorsOpen(false)
                        }}
                      />
                      <svg
                        className="notes-swatch-custom-icon"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M14.5 3.5a2.1 2.1 0 0 1 3 3l-7.8 7.8-3.9.9.9-3.9z" />
                        <path d="M12.5 5.5l2 2" />
                      </svg>
                    </label>
                    <button
                      type="button"
                      className="notes-swatch clear"
                      aria-label="Remove text color"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        editor.chain().focus().unsetTextColor().run()
                        setColorsOpen(false)
                      }}
                    />
                  </div>
                </div>
                <div
                  className="notes-swatch-section"
                  role="group"
                  aria-label="Text highlight"
                >
                  <span className="notes-swatch-label">Highlight</span>
                  <div className="notes-swatch-options">
                    {settings.favorite_highlight_colors.length === 0 &&
                      COLOR_NAMES.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={`notes-swatch mark-${name}`}
                          aria-label={`Highlight ${name}`}
                          aria-pressed={editor.isActive('highlight', {
                            color: name,
                          })}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            editor
                              .chain()
                              .focus()
                              .toggleHighlight({ color: name })
                              .run()
                            setColorsOpen(false)
                          }}
                        />
                      ))}
                    {settings.favorite_highlight_colors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="notes-swatch"
                        style={
                          {
                            background: color,
                            '--sw-on': onColor(color),
                          } as React.CSSProperties
                        }
                        aria-label={`Highlight ${color}`}
                        aria-pressed={editor.isActive('highlight', { color })}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          editor
                            .chain()
                            .focus()
                            .toggleHighlight({ color })
                            .run()
                          setColorsOpen(false)
                        }}
                      />
                    ))}
                    <label
                      className={`notes-swatch notes-swatch-custom ${
                        editor.isActive('highlight') &&
                        !COLOR_NAMES.some((n) =>
                          editor.isActive('highlight', { color: n }),
                        ) &&
                        !settings.favorite_highlight_colors.some((c) =>
                          editor.isActive('highlight', { color: c }),
                        )
                          ? 'notes-swatch-active'
                          : ''
                      }`}
                      title="Custom highlight color"
                      style={
                        {
                          background: highlightCustomHex,
                          '--sw-on': onColor(highlightCustomHex),
                        } as React.CSSProperties
                      }
                    >
                      <input
                        type="color"
                        aria-label="Custom highlight color"
                        value={highlightCustomHex}
                        onChange={(e) => {
                          const hex = e.target.value
                          setHighlightCustomHex(hex)
                          editor
                            .chain()
                            .focus()
                            .toggleHighlight({ color: hex })
                            .run()
                          setColorsOpen(false)
                        }}
                      />
                      <svg
                        className="notes-swatch-custom-icon"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M14.5 3.5a2.1 2.1 0 0 1 3 3l-7.8 7.8-3.9.9.9-3.9z" />
                        <path d="M12.5 5.5l2 2" />
                      </svg>
                    </label>
                    <button
                      type="button"
                      className="notes-swatch clear"
                      aria-label="Remove highlight"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        editor.chain().focus().unsetHighlight().run()
                        setColorsOpen(false)
                      }}
                    />
                  </div>
                </div>
                <div
                  className="notes-swatch-section"
                  role="group"
                  aria-label="Block background"
                >
                  <span className="notes-swatch-label">Block</span>
                  <div className="notes-swatch-options">
                    {settings.favorite_block_colors.length === 0 &&
                      COLOR_NAMES.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={`notes-swatch block-${name}`}
                          aria-label={`Block color ${name}`}
                          aria-pressed={activeBlockColor === name}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setSelectedBlockColor(editor, name)
                            setColorsOpen(false)
                          }}
                        />
                      ))}
                    {settings.favorite_block_colors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="notes-swatch"
                        style={
                          {
                            background: color,
                            '--sw-on': onColor(color),
                          } as React.CSSProperties
                        }
                        aria-label={`Block color ${color}`}
                        aria-pressed={activeBlockColor === color}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setSelectedBlockColor(editor, color)
                          setColorsOpen(false)
                        }}
                      />
                    ))}
                    <label
                      className={`notes-swatch notes-swatch-custom ${
                        activeBlockColor &&
                        !COLOR_NAMES.some((n) => activeBlockColor === n) &&
                        !settings.favorite_block_colors.includes(
                          activeBlockColor,
                        )
                          ? 'notes-swatch-active'
                          : ''
                      }`}
                      title="Custom block color"
                      style={
                        {
                          background: blockCustomHex,
                          '--sw-on': onColor(blockCustomHex),
                        } as React.CSSProperties
                      }
                    >
                      <input
                        type="color"
                        aria-label="Custom block color"
                        value={blockCustomHex}
                        onChange={(e) => {
                          const hex = e.target.value
                          setBlockCustomHex(hex)
                          setSelectedBlockColor(editor, hex)
                          setColorsOpen(false)
                        }}
                      />
                      <svg
                        className="notes-swatch-custom-icon"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M14.5 3.5a2.1 2.1 0 0 1 3 3l-7.8 7.8-3.9.9.9-3.9z" />
                        <path d="M12.5 5.5l2 2" />
                      </svg>
                    </label>
                    <button
                      type="button"
                      className="notes-swatch clear"
                      aria-label="Remove block color"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSelectedBlockColor(editor, null)
                        setColorsOpen(false)
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
            {linkOpen && (
              <LinkPopover
                initialHref={linkHref}
                onApply={(href) => {
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange('link')
                    .setLink({ href })
                    .run()
                  setLinkOpen(false)
                }}
                onRemove={
                  editor.isActive('link')
                    ? () => {
                        editor
                          .chain()
                          .focus()
                          .extendMarkRange('link')
                          .unsetLink()
                          .run()
                        setLinkOpen(false)
                      }
                    : undefined
                }
                onCancel={() => setLinkOpen(false)}
              />
            )}
          </BubbleMenu>

          {/* Row/column controls above the table the caret is in. */}
          <TableToolbar editor={editor} containerRef={containerRef} />
        </>
      )}

      <EditorContent editor={editor} />

      {columnDrop && (
        <div
          className="notes-column-drop-indicator"
          style={columnDrop}
          aria-hidden="true"
        />
      )}

      {slash && filteredSlash.length > 0 && (
        <div
          className="notes-slash-menu"
          role="listbox"
          aria-label="Block types"
          style={menuPos}
        >
          {filteredSlash.map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="option"
              aria-selected={index === slashIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseSlash(index)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {mention && mentionItems.length > 0 && (
        <div
          className="notes-slash-menu"
          role="listbox"
          aria-label="Link a page or event"
          style={menuPos}
        >
          {mentionItems.map((item, index) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              role="option"
              aria-selected={index === mentionIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseMention(index)}
            >
              <span>{item.title}</span>
              <small>{item.type}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
