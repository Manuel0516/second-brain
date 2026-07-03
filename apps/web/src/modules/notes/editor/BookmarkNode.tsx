/**
 * Bookmark (link embed) card — Notion-style.
 *
 * Block node, atom: true, rendered as a card with favicon + title + description
 * left, thumbnail right. Whole card opens the URL in a new tab.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react'
import { apiCall } from '../../../lib/api'

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

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function BookmarkNodeView({ node, deleteNode }: NodeViewProps) {
  const { url, title, description, image, favicon } =
    node.attrs as BookmarkAttributes

  return (
    <NodeViewWrapper className="notes-bookmark" contentEditable={false}>
      <a
        className="notes-bookmark-link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={0}
      >
        <div className="notes-bookmark-body">
          <span className="notes-bookmark-title">{title || url}</span>
          {description && (
            <span className="notes-bookmark-desc">{description}</span>
          )}
          <span className="notes-bookmark-domain">
            {favicon && (
              <img
                className="notes-bookmark-favicon"
                src={favicon}
                alt=""
                width={16}
                height={16}
                loading="lazy"
              />
            )}
            {hostnameOf(url)}
          </span>
        </div>
        {image && (
          <div className="notes-bookmark-thumb">
            <img src={image} alt="" loading="lazy" />
          </div>
        )}
      </a>
      <button
        type="button"
        className="notes-bookmark-remove"
        aria-label="Remove bookmark"
        onClick={() => deleteNode()}
      >
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
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </NodeViewWrapper>
  )
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
