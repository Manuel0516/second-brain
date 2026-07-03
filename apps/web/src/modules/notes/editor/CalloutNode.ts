import { Node, mergeAttributes } from '@tiptap/core'

/**
 * Callout block: a highlighted aside with a leading emoji (CSS ::before reads
 * the data-emoji attribute — no NodeView needed).
 * ponytail: fixed emoji per node; add a picker NodeView if it's ever wanted.
 */
export const CalloutNode = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      emoji: {
        default: '💡',
        parseHTML: (element) => element.getAttribute('data-emoji') || '💡',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'callout',
        'data-emoji': node.attrs.emoji,
      }),
      0,
    ]
  },
})
