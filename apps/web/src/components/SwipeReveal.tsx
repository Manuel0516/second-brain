import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

const DELETE_REVEAL = 48

interface Props {
  children: ReactNode
  className: string
  id?: string
  deleteLabel: string
  onDelete: () => void
}

export function SwipeReveal({
  children,
  className,
  id,
  deleteLabel,
  onDelete,
}: Props) {
  const [revealed, setRevealed] = useState(false)
  const swipeRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    baseOffset: number
    offset: number
    swiping: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)

  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return
    const baseOffset = revealed ? -DELETE_REVEAL : 0
    swipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseOffset,
      offset: baseOffset,
      swiping: false,
    }
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const swipe = swipeRef.current
    if (!swipe || swipe.pointerId !== event.pointerId) return
    const deltaX = event.clientX - swipe.startX
    const deltaY = event.clientY - swipe.startY
    if (!swipe.swiping) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        event.currentTarget.style.transform = 'translateX(0)'
        setRevealed(false)
        swipeRef.current = null
        return
      }
      swipe.swiping = true
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.classList.add('swiping')
    }
    event.preventDefault()
    swipe.offset = Math.max(
      -DELETE_REVEAL,
      Math.min(0, swipe.baseOffset + deltaX),
    )
    event.currentTarget.style.transform = `translateX(${swipe.offset}px)`
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    const swipe = swipeRef.current
    if (!swipe || swipe.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (swipe.swiping) {
      const nextRevealed = swipe.offset <= -DELETE_REVEAL / 2
      event.currentTarget.classList.remove('swiping')
      event.currentTarget.style.transform = `translateX(${nextRevealed ? -DELETE_REVEAL : 0}px)`
      setRevealed(nextRevealed)
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    } else if (swipe.baseOffset < 0) setRevealed(false)
    swipeRef.current = null
  }

  function cancel(event: PointerEvent<HTMLDivElement>) {
    const swipe = swipeRef.current
    if (!swipe || swipe.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    event.currentTarget.classList.remove('swiping')
    event.currentTarget.style.transform = `translateX(${swipe.baseOffset}px)`
    swipeRef.current = null
  }

  return (
    <div className="swipe-reveal-shell">
      <button
        className="swipe-reveal-delete"
        type="button"
        aria-label={deleteLabel}
        onFocus={() => {
          if (
            !window.matchMedia('(any-hover: hover) and (any-pointer: fine)')
              .matches
          )
            setRevealed(true)
        }}
        onClick={onDelete}
      >
        ×
      </button>
      <div
        className={`${className} swipe-reveal-content`}
        id={id}
        style={{ transform: `translateX(${revealed ? -DELETE_REVEAL : 0}px)` }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return
          event.preventDefault()
          event.stopPropagation()
          suppressClickRef.current = false
        }}
      >
        {children}
      </div>
    </div>
  )
}
