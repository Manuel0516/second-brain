import { Heading } from '@tiptap/extension-heading'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

/**
 * Every heading is a toggle: collapsing it hides all following top-level
 * blocks until the next heading of the same or a higher level. The collapsed
 * flag persists in the document JSON as a heading attribute; visibility is
 * pure decoration (hidden blocks stay in the doc).
 *
 * The exported selection helper lets the drag handle move a collapsed heading
 * together with its hidden section.
 */
export const CollapsibleHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        keepOnSplit: false,
        parseHTML: (element) =>
          element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) =>
          attributes.collapsed ? { 'data-collapsed': 'true' } : {},
      },
    }
  },

  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), headingCollapsePlugin()]
  },
})

interface HiddenRange {
  headingPos: number
  from: number
  to: number
}

/** Top-level walk: which block ranges are hidden by collapsed headings. */
function hiddenRanges(doc: PMNode): HiddenRange[] {
  const ranges: HiddenRange[] = []
  let active: { level: number; range: HiddenRange } | null = null
  doc.forEach((node, offset) => {
    const isHeading = node.type.name === 'heading'
    if (active && isHeading && node.attrs.level <= active.level) {
      active = null
    }
    if (active) {
      active.range.to = offset + node.nodeSize
    } else if (isHeading && node.attrs.collapsed) {
      const range: HiddenRange = {
        headingPos: offset,
        from: offset + node.nodeSize,
        to: offset + node.nodeSize,
      }
      ranges.push(range)
      active = { level: node.attrs.level, range }
    }
  })
  return ranges.filter((range) => range.to > range.from)
}

export function collapsedHeadingRange(
  doc: PMNode,
  headingPos: number,
): { from: number; to: number } | null {
  const range = hiddenRanges(doc).find(
    (candidate) => candidate.headingPos === headingPos,
  )
  return range ? { from: headingPos, to: range.to } : null
}

/** Select a collapsed heading and every block hidden beneath it for dragging. */
export function selectCollapsedHeadingSection(
  editor: Editor,
  headingPos: number,
): boolean {
  const range = collapsedHeadingRange(editor.state.doc, headingPos)
  if (!range) return false
  const selection = TextSelection.between(
    editor.state.doc.resolve(range.from + 1),
    editor.state.doc.resolve(range.to - 1),
  )
  editor.view.dispatch(editor.state.tr.setSelection(selection))
  return true
}

function chevronButton(
  view: EditorView,
  headingPos: number,
  collapsed: boolean,
): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `notes-heading-toggle${collapsed ? ' collapsed' : ''}`
  button.setAttribute('aria-expanded', String(!collapsed))
  button.setAttribute(
    'aria-label',
    collapsed ? 'Expand section' : 'Collapse section',
  )
  button.innerHTML =
    '<svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4l6 6-6 6"/></svg>'
  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    view.dispatch(
      view.state.tr.setNodeAttribute(headingPos, 'collapsed', !collapsed),
    )
  })
  return button
}

function headingCollapsePlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('headingCollapse'),
    props: {
      // Recomputed fresh from the doc each time — no DecorationSet mapping
      // to get wrong; the top-level walk is O(blocks) and docs are small.
      decorations(state) {
        const decorations: Decoration[] = []
        for (const range of hiddenRanges(state.doc)) {
          state.doc.nodesBetween(range.from, range.to, (node, pos) => {
            if (pos < range.from) return true
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: 'notes-collapsed-hidden',
              }),
            )
            return false // top-level nodes only
          })
        }
        state.doc.forEach((node, offset) => {
          if (node.type.name !== 'heading') return
          const collapsed = Boolean(node.attrs.collapsed)
          decorations.push(
            Decoration.widget(
              offset + 1,
              (view) => chevronButton(view, offset, collapsed),
              { side: -1, key: `heading-toggle-${offset}-${collapsed}` },
            ),
          )
        })
        return DecorationSet.create(state.doc, decorations)
      },
    },
    // Editing/moving the cursor into a hidden range auto-expands its heading;
    // after expansion the range no longer covers the selection, so this
    // cannot loop. Programmatic syncs (TipTap setContent with emitUpdate
    // false) carry preventUpdate meta and must NOT expand — they place the
    // selection at the doc end, which silently un-collapsed sections on load.
    appendTransaction(transactions, _oldState, newState) {
      const userTransactions = transactions.filter(
        (tr) => !tr.getMeta('preventUpdate'),
      )
      if (!userTransactions.some((tr) => tr.docChanged || tr.selectionSet)) {
        return null
      }
      if (!newState.selection.empty) return null
      const head = newState.selection.head
      const owner = hiddenRanges(newState.doc).find(
        (range) => head >= range.from && head <= range.to,
      )
      if (!owner) return null
      return newState.tr.setNodeAttribute(owner.headingPos, 'collapsed', false)
    },
  })
}
