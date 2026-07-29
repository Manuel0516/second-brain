import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { BookmarkAttributes } from './BookmarkNode'

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function BookmarkNodeView({ node, deleteNode }: NodeViewProps) {
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
