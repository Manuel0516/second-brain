import { BlockMath, InlineMath } from '@tiptap/extension-mathematics'
import { ReactNodeViewRenderer, type Editor } from '@tiptap/react'
import { BlockMathView, InlineMathView } from './MathNodeViews'

export function insertEditableInlineMath(editor: Editor) {
  const { from, to } = editor.state.selection
  const latex = editor.state.doc.textBetween(from, to, ' ')
  return editor
    .chain()
    .focus()
    .insertContent({ type: 'inlineMath', attrs: { latex } })
    .setNodeSelection(from)
    .run()
}

export const EditableInlineMath = InlineMath.extend({
  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView, { as: 'span' })
  },
})

export const EditableBlockMath = BlockMath.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label') ?? '',
        renderHTML: (attributes) =>
          attributes.label ? { 'data-label': attributes.label } : {},
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(BlockMathView, {
      trackNodeViewPosition: true,
    })
  },
})
