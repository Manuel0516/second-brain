import { Extension, Mark } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import type { Editor } from '@tiptap/react'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      toggleTextColor: (color: string) => ReturnType
      unsetTextColor: () => ReturnType
    }
  }
}

/**
 * Semantic color names stored in the document JSON; the actual colors are
 * CSS rules built from theme tokens, so both themes stay correct and no raw
 * color ever enters the doc.
 */
export const COLOR_NAMES = ['accent', 'warm', 'neutral', 'contrast'] as const
export type ColorName = (typeof COLOR_NAMES)[number]

/** Pick a legible on-color for a swatch icon — dark on light, cream on dark. */
export function onColor(hex: string): string {
  const value = hex.replace('#', '')
  if (value.length !== 6) return '#f0ede5'
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.72 ? '#131210' : '#f0ede5'
}

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v)

/**
 * Text highlight — renders `<mark data-color="accent">`, styled via CSS.
 * Hex values (custom colors) use `data-color="custom"` with an inline
 * background-color so they work without a CSS rule per hex.
 */
export const NoteHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-color'),
        renderHTML: (attributes) => {
          if (!attributes.color) return {}
          const hex = isHex(attributes.color)
          return {
            'data-color': hex ? 'custom' : attributes.color,
            ...(hex ? { style: `background-color: ${attributes.color}` } : {}),
          }
        },
      },
    }
  },
}).configure({ multicolor: true })

/**
 * Block background — a `blockColor` attribute on paragraphs and headings,
 * rendered as `data-block-color` and styled via CSS.
 * Hex values use `data-block-color="custom"` with an inline background-color.
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
            renderHTML: (attributes) => {
              if (!attributes.blockColor) return {}
              const hex = isHex(attributes.blockColor)
              return {
                'data-block-color': hex ? 'custom' : attributes.blockColor,
                ...(hex
                  ? { style: `background-color: ${attributes.blockColor}` }
                  : {}),
              }
            },
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

/**
 * Inline text color — a `<span data-text-color="accent">` mark.
 * Hex values use `data-text-color="custom"` with an inline `color` style.
 */
export const NoteTextColor = Mark.create({
  name: 'textColor',

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-text-color'),
        renderHTML: (attributes) => {
          if (!attributes.color) return {}
          const hex = isHex(attributes.color)
          return {
            'data-text-color': hex ? 'custom' : attributes.color,
            ...(hex ? { style: `color: ${attributes.color}` } : {}),
          }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-text-color]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  },

  addCommands() {
    return {
      toggleTextColor:
        (color: string) =>
        ({ commands, editor }) => {
          if (editor.isActive(this.name, { color })) {
            return commands.unsetMark(this.name)
          }
          return commands.setMark(this.name, { color })
        },
      unsetTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },
})
