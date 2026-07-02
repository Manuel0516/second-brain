/** Mathematics stays in TipTap's inlineMath/blockMath JSON nodes; custom node
 * views provide in-place LaTeX editing before KaTeX rendering. */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
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
import { EMPTY_DOCUMENT, type SearchResult } from '../types'
import {
  EditableBlockMath,
  EditableInlineMath,
  insertEditableInlineMath,
} from './MathExtensions'
import { EditableTaskItem } from './TaskItemExtension'
import { LinkPopover } from './LinkPopover'
import { LocationNode, insertLocation } from './LocationNode'

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
  debounceMs = 600,
  readOnly = false,
  ariaLabel = 'Page content',
}: BlockEditorProps) {
  const editorContent = content.type ? content : EMPTY_DOCUMENT
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onChangeRef = useRef(onChange)
  const searchRef = useRef(onSearch)
  const clickRef = useRef(onMentionClick)
  const containerRef = useRef<HTMLDivElement>(null)
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
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkHref, setLinkHref] = useState('')
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({
    left: 0,
    top: 36,
  })
  useEffect(() => {
    onChangeRef.current = onChange
    searchRef.current = onSearch
    clickRef.current = onMentionClick
  }, [onChange, onMentionClick, onSearch])

  const editor = useEditor({
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
      }),
      TaskList,
      EditableTaskItem,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: "Type '/' for commands or '[[' to link…",
      }),
      EditableInlineMath,
      EditableBlockMath,
      LocationNode,
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
      saveTimer.current = setTimeout(
        () => onChangeRef.current(current.getJSON()),
        debounceMs,
      )
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

  useEffect(() => () => clearTimeout(saveTimer.current), [])
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
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(editorContent)) {
      editor.commands.setContent(editorContent, { emitUpdate: false })
    }
  }, [editor, editorContent])
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

  // "+" gutter button: add an empty block after the hovered one and open slash.
  const openSlashAtCursor = () => {
    if (!editor) return
    const pos = hoverPosRef.current
    if (pos != null) {
      const node = editor.state.doc.nodeAt(pos)
      const end = pos + (node?.nodeSize ?? 1)
      editor
        .chain()
        .focus()
        .insertContentAt(end, { type: 'paragraph' })
        .setTextSelection(end + 1)
        .run()
    } else {
      editor.chain().focus().run()
    }
    setSlash({ query: '', from: editor.state.selection.from })
  }

  return (
    <div
      className="notes-editor"
      role="group"
      aria-label="Block editor"
      ref={containerRef}
    >
      {editor && (
        <>
          {/* Notion-style block gutter: add + drag on hover. */}
          <DragHandle
            editor={editor}
            computePositionConfig={{ placement: 'left' }}
            onNodeChange={({ pos }) => {
              hoverPosRef.current = typeof pos === 'number' ? pos : null
            }}
          >
            <div className="notes-block-gutter">
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
        </>
      )}

      <EditorContent editor={editor} />

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
