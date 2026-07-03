import { Extension } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import type { Editor } from '@tiptap/react'

/**
 * Semantic color names stored in the document JSON; the actual colors are
 * CSS rules built from theme tokens, so both themes stay correct and no raw
 * color ever enters the doc.
 */
export const COLOR_NAMES = ['accent', 'warm', 'neutral', 'contrast'] as const
export type ColorName = (typeof COLOR_NAMES)[number]

/**
 * Text highlight — renders `<mark data-color="accent">`, styled via CSS.
 * The stock attribute also writes an inline background-color style; this
 * override keeps the semantic name only (tokens are law).
 */
export const NoteHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-color'),
        renderHTML: (attributes) =>
          attributes.color ? { 'data-color': attributes.color } : {},
      },
    }
  },
}).configure({ multicolor: true })

/**
 * Block background — a `blockColor` attribute on paragraphs and headings,
 * rendered as `data-block-color` and styled via CSS.
 */
export const BlockColor = Extension.create({
  name: 'blockColor',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          blockColor: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-block-color'),
            renderHTML: (attributes) =>
              attributes.blockColor
                ? { 'data-block-color': attributes.blockColor }
                : {},
          },
        },
      },
    ]
  },
})

/** Apply a background to the paragraph/heading containing the cursor. */
export function setSelectedBlockColor(
  editor: Editor,
  color: string | null,
): void {
  const { $from } = editor.state.selection
  const block = $from.node($from.depth)
  if (block.type.name !== 'paragraph' && block.type.name !== 'heading') return
  editor
    .chain()
    .focus()
    .updateAttributes(block.type.name, { blockColor: color })
    .run()
}
