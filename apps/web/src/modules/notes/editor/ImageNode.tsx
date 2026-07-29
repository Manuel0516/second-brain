/**
 * Image block — hand-rolled TipTap node with a React NodeView.
 * Attrs: src, alt, width (percent), align ('left'|'center'|'right').
 * Serializes as <figure data-type="image" data-align><img …></figure>.
 *
 * The NodeView adds the two controls the plan asks for: a width drag grip
 * on the edge and hover-revealed align buttons. Nothing else.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { apiCall } from '../../../lib/api'
import { ImageBlockView } from './ImageBlockView'

export interface ImageAttributes {
  src: string
  alt: string
  width: number
  align: 'left' | 'center' | 'right'
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageBlock: {
      setImageBlock: (attrs: Partial<ImageAttributes>) => ReturnType
    }
  }
}

/** Upload an image to /api/files; resolves to its URL or null on failure. */
export async function uploadImageFile(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null
  const body = new FormData()
  body.append('file', file)
  try {
    const response = await apiCall('/api/files', { method: 'POST', body })
    if (!response.ok) return null
    return ((await response.json()) as { url: string }).url
  } catch {
    return null
  }
}

export const ImageBlock = Node.create({
  name: 'imageBlock',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (element) =>
          element.querySelector('img')?.getAttribute('src') ?? '',
      },
      alt: {
        default: '',
        parseHTML: (element) =>
          element.querySelector('img')?.getAttribute('alt') ?? '',
      },
      width: {
        default: 100,
        parseHTML: (element) => parseInt(element.style.width, 10) || 100,
      },
      align: {
        default: 'center' as const,
        parseHTML: (element) => element.getAttribute('data-align') ?? 'center',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="image"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'image',
        'data-align': node.attrs.align,
        class: 'notes-image',
        style: `width: ${node.attrs.width}%`,
      }),
      ['img', { src: node.attrs.src, alt: node.attrs.alt }],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView)
  },

  addCommands() {
    return {
      setImageBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})
