/**
 * Floating table toolbar — appears above the table the caret is in, aligned
 * to its right edge. Row/column add/delete, header toggle, delete table.
 *
 * Rendered as an overlay inside the .notes-editor container (like the slash
 * menu), not as a table NodeView: a NodeView would replace prosemirror-tables'
 * own table view and break native column resizing (`resizable: true`).
 */

import { useEffect, useState, type RefObject } from 'react'
import type { Editor } from '@tiptap/react'

const ICONS = {
  addRow: <path d="M3 5h14M3 9h14M10 13v5M7.5 15.5h5" />,
  deleteRow: <path d="M3 5h14M3 9h14M7.5 15h5" />,
  addCol: <path d="M5 3v14M9 3v14M13 10h5M15.5 7.5v5" />,
  deleteCol: <path d="M5 3v14M9 3v14M14 10h4" />,
  header: (
    <>
      <rect x="3" y="4" width="14" height="4" rx="1" />
      <path d="M3 11h14M3 14.5h14" />
    </>
  ),
  remove: <path d="M5 5l10 10M15 5L5 15" />,
} as const

function Icon({ type }: { type: keyof typeof ICONS }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {ICONS[type]}
    </svg>
  )
}

interface TableToolbarProps {
  editor: Editor
  containerRef: RefObject<HTMLDivElement | null>
}

export function TableToolbar({ editor, containerRef }: TableToolbarProps) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    const update = () => {
      const { $from } = editor.state.selection
      let tablePos = -1
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        if ($from.node(depth).type.name === 'table') {
          tablePos = $from.before(depth)
          break
        }
      }
      const box = containerRef.current?.getBoundingClientRect()
      if (tablePos < 0 || !box) {
        setPos(null)
        return
      }
      const dom = editor.view.nodeDOM(tablePos)
      if (!(dom instanceof HTMLElement)) {
        setPos(null)
        return
      }
      const rect = dom.getBoundingClientRect()
      setPos({ left: rect.right - box.left, top: rect.top - box.top })
    }
    update()
    editor.on('transaction', update)
    return () => {
      editor.off('transaction', update)
    }
  }, [editor, containerRef])

  if (!pos) return null

  const actions = [
    ['Add row', 'addRow', () => editor.chain().focus().addRowAfter().run()],
    ['Delete row', 'deleteRow', () => editor.chain().focus().deleteRow().run()],
    null,
    [
      'Add column',
      'addCol',
      () => editor.chain().focus().addColumnAfter().run(),
    ],
    [
      'Delete column',
      'deleteCol',
      () => editor.chain().focus().deleteColumn().run(),
    ],
    null,
    [
      'Toggle header row',
      'header',
      () => editor.chain().focus().toggleHeaderRow().run(),
    ],
    [
      'Delete table',
      'remove',
      () => editor.chain().focus().deleteTable().run(),
    ],
  ] as const

  return (
    <div
      className="notes-table-toolbar"
      role="toolbar"
      aria-label="Table controls"
      style={pos}
    >
      {actions.map((action, index) =>
        action === null ? (
          <span key={`divider-${index}`} className="notes-table-divider" />
        ) : (
          <button
            key={action[0]}
            type="button"
            className={`notes-table-btn${action[1] === 'remove' ? ' notes-table-btn-danger' : ''}`}
            aria-label={action[0]}
            title={action[0]}
            onMouseDown={(event) => event.preventDefault()}
            onClick={action[2]}
          >
            <Icon type={action[1]} />
          </button>
        ),
      )}
    </div>
  )
}
