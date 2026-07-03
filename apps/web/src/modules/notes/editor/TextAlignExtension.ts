/**
 * Block text alignment — a `textAlign` attribute on paragraphs and headings,
 * rendered as an inline `text-align` style (same shape the official
 * @tiptap/extension-text-align uses, so documents stay compatible).
 * Hand-rolled to avoid a dependency for one attribute.
 */

import { Extension } from '@tiptap/core'

export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number]

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockTextAlign: {
      setTextAlign: (align: TextAlignment) => ReturnType
    }
  }
}

export const TextAlign = Extension.create({
  name: 'blockTextAlign',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => element.style.textAlign || null,
            renderHTML: (attributes) =>
              attributes.textAlign
                ? { style: `text-align: ${attributes.textAlign}` }
                : {},
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setTextAlign:
        (align) =>
        ({ commands }) => {
          // Left is the document default — store null, not a value.
          const value = align === 'left' ? null : align
          const applied = ['paragraph', 'heading'].map((type) =>
            commands.updateAttributes(type, { textAlign: value }),
          )
          return applied.some(Boolean)
        },
    }
  },
})
