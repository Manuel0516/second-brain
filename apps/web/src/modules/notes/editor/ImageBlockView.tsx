import { useRef, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { ImageAttributes } from './ImageNode'

const ALIGN_ICONS = {
  left: <path d="M3 4h14M3 8h8M3 12h14M3 16h8" />,
  center: <path d="M3 4h14M6 8h8M3 12h14M6 16h8" />,
  right: <path d="M3 4h14M9 8h8M3 12h14M9 16h8" />,
} as const

export function ImageBlockView({
  node,
  selected,
  updateAttributes,
}: NodeViewProps) {
  const { src, alt, width, align } = node.attrs as ImageAttributes
  const imgRef = useRef<HTMLImageElement>(null)
  const [liveWidth, setLiveWidth] = useState<number | null>(null)
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null)

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    const figure = imgRef.current?.parentElement
    const container = figure?.parentElement
    if (!figure || !container) return
    const containerWidth = container.getBoundingClientRect().width
    const startWidth = figure.getBoundingClientRect().width
    const startX = event.clientX
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
