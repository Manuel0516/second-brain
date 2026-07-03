import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface PopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  className?: string
  /** Match the anchor's width (dropdown lists and row menus). */
  matchAnchorWidth?: boolean
  align?: 'start' | 'end'
  role?: string
  ariaLabel?: string
  children: React.ReactNode
}

/**
 * The one floating-panel primitive: portalled to <body>, fixed-position,
 * measured against its REAL rendered size (no estimated heights), flipped
 * above the anchor when it would overflow the bottom, clamped to the
 * viewport horizontally, repositioned on scroll/resize, closed on outside
 * pointerdown or Escape.
 *
 * Position is applied by mutating the element style directly — coordinates
 * are data, not design; everything visual lives in the .popover CSS class.
 */
export function Popover({
  anchorRef,
  open,
  onClose,
  className = '',
  matchAnchorWidth = false,
  align = 'start',
  role,
  ariaLabel,
  children,
}: PopoverProps) {
  const popRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const reposition = () => {
    const anchor = anchorRef.current
    const pop = popRef.current
    if (!anchor || !pop) return
    const a = anchor.getBoundingClientRect()
    if (matchAnchorWidth) pop.style.width = `${a.width}px`
    const p = pop.getBoundingClientRect()
    let top = a.bottom + 4
    if (top + p.height > window.innerHeight - 8 && a.top - p.height - 4 >= 8) {
      top = a.top - p.height - 4
    }
    top = Math.max(8, Math.min(top, window.innerHeight - p.height - 8))
    const anchorLeft = align === 'end' ? a.right - p.width : a.left
    const left = Math.max(
      16,
      Math.min(anchorLeft, window.innerWidth - p.width - 16),
    )
    pop.style.top = `${top}px`
    pop.style.left = `${left}px`
    pop.style.visibility = 'visible'
  }

  // Measure after the portal renders, before paint (no flash of 0,0).
  useLayoutEffect(() => {
    if (open) reposition()
  })

  useEffect(() => {
    if (!open) return
    const onScrollOrResize = () => reposition()
    const onPointerDown = (event: PointerEvent) => {
      if (popRef.current?.contains(event.target as Node)) return
      if (anchorRef.current?.contains(event.target as Node)) return
      onCloseRef.current()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null
  return createPortal(
    <div
      ref={popRef}
      className={`popover${className ? ` ${className}` : ''}`}
      role={role}
      aria-label={ariaLabel}
      style={{ visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}
