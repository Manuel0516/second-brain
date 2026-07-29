/**
 * Bookmark (link embed) card — Notion-style.
 *
 * Block node, atom: true, rendered as a card with favicon + title + description
 * left, thumbnail right. Whole card opens the URL in a new tab.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { apiCall } from '../../../lib/api'
import { BookmarkNodeView } from './BookmarkNodeView'

export interface BookmarkAttributes {
  url: string
  title: string
  description: string
  image: string
  favicon: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bookmark: {
      setBookmark: (attrs: Partial<BookmarkAttributes>) => ReturnType
    }
  }
}

/** Fetch page metadata for a URL; falls back to the bare URL on any failure. */
export async function fetchBookmarkMeta(
  url: string,
): Promise<Partial<BookmarkAttributes>> {
  try {
    const response = await apiCall(`/api/embed?url=${encodeURIComponent(url)}`)
    if (!response.ok) return { url, title: url }
    return (await response.json()) as BookmarkAttributes
  } catch {
    return { url, title: url }
  }
}

export const BookmarkNode = Node.create({
  name: 'bookmark',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      url: { default: '' },
      title: { default: '' },
      description: { default: '' },
      image: { default: '' },
      favicon: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-bookmark]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-bookmark': '',
        class: 'notes-bookmark',
      }),
      [
        'a',
        { href: node.attrs.url, target: '_blank' },
        node.attrs.title || node.attrs.url,
      ],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkNodeView)
  },

  addCommands() {
    return {
      setBookmark:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})
