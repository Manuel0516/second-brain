/**
 * Multi-column layout — a row of block columns, Notion-style.
 *
 * Created by dragging a block onto the left/right edge of another top-level
 * block (handleColumnDrop, wired into BlockEditor's handleDrop with a live
 * edge indicator) or via the /2 columns – /3 columns slash commands.
 *
 * Normalization (appendTransaction), applied until stable:
 * - a columnList nested inside a column flattens into plain blocks
 * - a columnList left with one column unwraps back to plain blocks
 * - an empty column (single empty textblock) dissolves, unless the caret is
 *   inside it — that keeps a freshly created slash-command column alive
 *   while it's being typed into.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { Fragment } from '@tiptap/pm/model'
import type { Node as PMNode, Slice } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columnLayout: {
      setColumnLayout: (count: 2 | 3) => ReturnType
    }
  }
}

/** Horizontal band on each side of a block that counts as a column drop. */
const EDGE_ZONE = 56

export interface ColumnDropTarget {
  pos: number
  side: 'left' | 'right'
}

/**
 * The top-level block (or columnList) whose left/right edge band the pointer
 * is inside, or null when the pointer is in the middle (default drop zone).
 */
export function getColumnDropTarget(
  view: EditorView,
  event: DragEvent,
): ColumnDropTarget | null {
  const found = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!found || found.inside < 0) return null
  const $inside = view.state.doc.resolve(found.inside)
  const pos = $inside.depth === 0 ? found.inside : $inside.before(1)
  const node = view.state.doc.nodeAt(pos)
  if (!node) return null
  // Full layouts cap at 3 columns.
  if (node.type.name === 'columnList' && node.childCount >= 3) return null
  const dom = view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return null
  const rect = dom.getBoundingClientRect()
  const zone = Math.min(EDGE_ZONE, rect.width / 4)
  if (event.clientX <= rect.left + zone) return { pos, side: 'left' }
  if (event.clientX >= rect.right - zone) return { pos, side: 'right' }
  return null
}

/**
 * Handle a block being dropped on the edge of another block: wrap the two
 * into a columnList (or add a column to an existing one). Returns false to
 * fall through to ProseMirror's default drop.
 */
export function handleColumnDrop(
  view: EditorView,
  event: DragEvent,
  slice: Slice,
): boolean {
  const target = getColumnDropTarget(view, event)
  if (!target || !applyColumnDrop(view, target, slice)) return false
  event.preventDefault()
  return true
}

/** The transaction half of handleColumnDrop, split out for testability. */
export function applyColumnDrop(
  view: EditorView,
  target: ColumnDropTarget,
  slice: Slice,
): boolean {
  const { state } = view
  const { selection } = state
  // Dropping a block onto its own edge is a no-op.
  if (selection.from <= target.pos && target.pos < selection.to) return false
  const { column, columnList } = state.schema.nodes
  if (slice.content.firstChild?.type === columnList) return false
  // The payload must be valid column content (a bare listItem is not).
  let dropped: PMNode
  try {
    dropped = column.createChecked(null, slice.content)
  } catch {
    return false
  }
  const tr = state.tr
  tr.deleteSelection()
  const mapped = tr.mapping.map(target.pos)
  const targetNode = tr.doc.nodeAt(mapped)
  if (!targetNode) return false
  if (targetNode.type === columnList) {
    tr.insert(
      target.side === 'left' ? mapped + 1 : mapped + targetNode.nodeSize - 1,
      dropped,
    )
  } else {
    const existing = column.create(null, Fragment.from(targetNode))
    const columns =
      target.side === 'left' ? [dropped, existing] : [existing, dropped]
    tr.replaceWith(
      mapped,
      mapped + targetNode.nodeSize,
      columnList.create(null, columns),
    )
  }
  view.dispatch(tr.scrollIntoView())
  return true
}

/** All blocks inside a columnList, flattened in order. */
function columnsContent(list: PMNode): Fragment {
  let content = Fragment.empty
  list.forEach((column) => {
    content = content.append(column.content)
  })
  return content
}

export const ColumnList = Node.create({
  name: 'columnList',

  group: 'block',

  // {1,3} not {2,3}: removing a column from a pair must stay schema-valid
  // for one transaction so the normalizer below can unwrap the leftover.
  content: 'column{1,3}',

  parseHTML() {
    return [{ tag: 'div[data-type="columnList"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'columnList' }),
      0,
    ]
  },

  addCommands() {
    return {
      setColumnLayout:
        (count) =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection
          if ($from.depth < 1 || $from.node(1).type.name === 'columnList')
            return false
          const blockPos = $from.before(1)
          const block = state.doc.nodeAt(blockPos)
          if (!block) return false
          const { column, columnList, paragraph } = state.schema.nodes
          const columns = [column.create(null, Fragment.from(block))]
          for (let index = 1; index < count; index += 1) {
            columns.push(column.create(null, paragraph.create()))
          }
          if (dispatch) {
            tr.replaceWith(
              blockPos,
              blockPos + block.nodeSize,
              columnList.create(null, columns),
            )
            // Caret into the first empty column so it can be typed into
            // immediately (and isn't dissolved as abandoned).
            tr.setSelection(
              TextSelection.near(tr.doc.resolve(blockPos + block.nodeSize + 5)),
            )
            dispatch(tr.scrollIntoView())
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged))
            return null
          const head = newState.selection.head
          const ops: Array<{
            from: number
            to: number
            content: Fragment | null
          }> = []
          newState.doc.descendants((node, pos, parent) => {
            if (node.type.name !== 'columnList') return true
            if ((parent && parent.type.name !== 'doc') || node.childCount < 2) {
              ops.push({
                from: pos,
                to: pos + node.nodeSize,
                content: columnsContent(node),
              })
              return false
            }
            node.forEach((column, offset) => {
              const columnPos = pos + 1 + offset
              const isEmpty =
                column.childCount === 1 &&
                column.firstChild !== null &&
                column.firstChild.isTextblock &&
                column.firstChild.content.size === 0
              const holdsCaret =
                head >= columnPos && head <= columnPos + column.nodeSize
              if (isEmpty && !holdsCaret)
                ops.push({
                  from: columnPos,
                  to: columnPos + column.nodeSize,
                  content: null,
                })
            })
            return false
          })
          if (!ops.length) return null
          const tr = newState.tr
          // Back-to-front so earlier positions stay valid; skip overlaps.
          ops.sort((a, b) => b.from - a.from)
          let applied = Infinity
          for (const op of ops) {
            if (op.to > applied) continue
            if (op.content && op.content.size > 0)
              tr.replaceWith(op.from, op.to, op.content)
            else tr.delete(op.from, op.to)
            applied = op.from
          }
          return tr
        },
      }),
    ]
  },
})

export const Column = Node.create({
  name: 'column',

  // NOT part of the "block" group — columns only live inside columnList.
  group: 'columnContent',

  content: 'block+',

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'column' }),
      0,
    ]
  },
})
