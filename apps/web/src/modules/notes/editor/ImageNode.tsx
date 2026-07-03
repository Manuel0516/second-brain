/**
 * Image block — hand-rolled TipTap node with a React NodeView.
 * Attrs: src, alt, width (percent), align ('left'|'center'|'right').
 * Serializes as <figure data-type="image" data-align><img …></figure>.
 *
 * The NodeView adds the two controls the plan asks for: a width drag grip
 * on the edge and hover-revealed align buttons. Nothing else.
 */

import { useRef, useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react'
import { apiCall } from '../../../lib/api'

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

const ALIGN_ICONS = {
  left: <path d="M3 4h14M3 8h8M3 12h14M3 16h8" />,
  center: <path d="M3 4h14M6 8h8M3 12h14M6 16h8" />,
  right: <path d="M3 4h14M9 8h8M3 12h14M9 16h8" />,
} as const

function ImageBlockView({ node, selected, updateAttributes }: NodeViewProps) {
  const { src, alt, width, align } = node.attrs as ImageAttributes
  const imgRef = useRef<HTMLImageElement>(null)
  // Live width during a grip drag; committed to attrs on pointer-up so the
  // resize is one undo step, not hundreds.
  const [liveWidth, setLiveWidth] = useState<number | null>(null)
  // Natural pixel width caps the block: images render at most 1:1, never
  // upscaled, so they keep full quality.
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null)

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    const figure = imgRef.current?.parentElement
    const container = figure?.parentElement
    if (!figure || !container) return
    const containerWidth = container.getBoundingClientRect().width
    const startWidth = figure.getBoundingClientRect().width
    const startX = event.clientX
    // Centered images grow on both sides; right-aligned grow leftward.
    const direction = align === 'center' ? 2 : align === 'right' ? -1 : 1
    let next = width
    const move = (pointer: PointerEvent) => {
      const pixels = startWidth + (pointer.clientX - startX) * direction
      next = Math.round(
        Math.min(100, Math.max(20, (pixels / containerWidth) * 100)),
      )
      setLiveWidth(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setLiveWidth(null)
      updateAttributes({ width: next })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <NodeViewWrapper
      as="figure"
      className={`notes-image${selected ? ' is-selected' : ''}`}
      data-align={align}
      style={{
        width: `${liveWidth ?? width}%`,
        maxWidth: naturalWidth ? `${naturalWidth}px` : undefined,
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(event) =>
          setNaturalWidth(event.currentTarget.naturalWidth || null)
        }
      />
      <div
        className="notes-image-toolbar"
        contentEditable={false}
        role="group"
        aria-label="Image alignment"
      >
        {(['left', 'center', 'right'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-label={`Align ${option}`}
            title={`Align ${option}`}
            aria-pressed={align === option}
            onClick={() => updateAttributes({ align: option })}
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
              {ALIGN_ICONS[option]}
            </svg>
          </button>
        ))}
      </div>
      <span
        className="notes-image-grip"
        contentEditable={false}
        onPointerDown={startResize}
        aria-hidden="true"
      />
    </NodeViewWrapper>
  )
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
