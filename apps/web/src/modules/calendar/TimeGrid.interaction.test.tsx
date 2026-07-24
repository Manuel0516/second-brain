import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { TimeGrid } from './TimeGrid'
import type { CalendarEvent } from './types'

const day = new Date(2026, 5, 27)
const calendarEvent: CalendarEvent = {
  id: 'event-1',
  calendar_id: 'calendar-1',
  title: 'Touch event',
  start_at: new Date(2026, 5, 27, 10).toISOString(),
  end_at: new Date(2026, 5, 27, 11).toISOString(),
  all_day: false,
  timezone: 'UTC',
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify([calendarEvent]), { status: 200 }),
  )
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => true)
  Element.prototype.releasePointerCapture = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('selects tapped events and starts pinch resizing from the real touch distance', async () => {
  const onRowHeightChange = vi.fn()
  const { container, rerender } = render(
    <TimeGrid
      days={[day]}
      rowHeight={48}
      calendars={[]}
      refresh={0}
      onCreate={vi.fn()}
      onCreateAllDay={vi.fn()}
      onEdit={vi.fn()}
      onRowHeightChange={onRowHeightChange}
      onHorizontalNavigate={vi.fn()}
    />,
  )
  const eventButton = await screen.findByRole('button', {
    name: 'Touch event',
  })
  const column = container.querySelector<HTMLElement>('.day-column')!

  fireEvent.pointerDown(eventButton, {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 20,
    clientY: 100,
  })
  fireEvent.pointerUp(column, {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 20,
    clientY: 100,
  })
  expect(eventButton).toHaveAttribute('aria-pressed', 'true')

  fireEvent.pointerDown(column, {
    pointerType: 'touch',
    pointerId: 2,
    clientX: 20,
    clientY: 100,
  })
  fireEvent.pointerDown(column, {
    pointerType: 'touch',
    pointerId: 3,
    clientX: 20,
    clientY: 200,
  })
  fireEvent.pointerMove(column, {
    pointerType: 'touch',
    pointerId: 3,
    clientX: 20,
    clientY: 210,
  })

  expect(onRowHeightChange).toHaveBeenLastCalledWith(53)

  const scroller = container.querySelector<HTMLElement>('.week-scroll')!
  scroller.scrollTop = 300
  rerender(
    <TimeGrid
      days={[day]}
      rowHeight={96}
      calendars={[]}
      refresh={0}
      onCreate={vi.fn()}
      onCreateAllDay={vi.fn()}
      onEdit={vi.fn()}
      onRowHeightChange={onRowHeightChange}
      onHorizontalNavigate={vi.fn()}
    />,
  )
  expect(scroller.scrollTop).toBe(600)
})

it('starts event move or resize only after a stationary long press', async () => {
  const { container } = render(
    <TimeGrid
      days={[day]}
      rowHeight={48}
      calendars={[]}
      refresh={0}
      onCreate={vi.fn()}
      onCreateAllDay={vi.fn()}
      onEdit={vi.fn()}
      onRowHeightChange={vi.fn()}
      onHorizontalNavigate={vi.fn()}
    />,
  )
  const eventButton = await screen.findByRole('button', {
    name: 'Touch event',
  })
  const column = container.querySelector<HTMLElement>('.day-column')!
  vi.spyOn(eventButton, 'getBoundingClientRect').mockReturnValue({
    top: 100,
    bottom: 148,
    left: 0,
    right: 100,
    width: 100,
    height: 48,
    x: 0,
    y: 100,
    toJSON: () => ({}),
  })
  vi.useFakeTimers()

  fireEvent.pointerDown(eventButton, {
    pointerType: 'touch',
    pointerId: 10,
    clientX: 20,
    clientY: 110,
  })
  fireEvent.pointerMove(column, {
    pointerType: 'touch',
    pointerId: 10,
    clientX: 20,
    clientY: 130,
  })
  act(() => vi.advanceTimersByTime(650))
  expect(eventButton).not.toHaveClass('dragging')
  fireEvent.pointerUp(column, { pointerType: 'touch', pointerId: 10 })

  fireEvent.pointerDown(eventButton, {
    pointerType: 'touch',
    pointerId: 11,
    clientX: 20,
    clientY: 110,
  })
  act(() => vi.advanceTimersByTime(650))
  fireEvent.pointerMove(column, {
    pointerType: 'touch',
    pointerId: 11,
    clientX: 20,
    clientY: 158,
  })
  expect(eventButton).toHaveStyle({ transform: 'translate(0px, 48px)' })
  fireEvent.pointerCancel(column, { pointerType: 'touch', pointerId: 11 })

  fireEvent.pointerDown(eventButton, {
    pointerType: 'touch',
    pointerId: 12,
    clientX: 20,
    clientY: 145,
  })
  act(() => vi.advanceTimersByTime(650))
  fireEvent.pointerMove(column, {
    pointerType: 'touch',
    pointerId: 12,
    clientX: 20,
    clientY: 169,
  })
  expect(eventButton).toHaveStyle({ height: '72px' })
})

it('navigates progressively as horizontal wheel scrolling crosses day boundaries', async () => {
  const onHorizontalNavigate = vi.fn()
  const { container } = render(
    <TimeGrid
      days={[day]}
      rowHeight={48}
      calendars={[]}
      refresh={0}
      onCreate={vi.fn()}
      onCreateAllDay={vi.fn()}
      onEdit={vi.fn()}
      onRowHeightChange={vi.fn()}
      onHorizontalNavigate={onHorizontalNavigate}
    />,
  )
  await screen.findByRole('button', { name: 'Touch event' })
  const scroller = container.querySelector<HTMLElement>('.week-scroll')!
  vi.useFakeTimers()

  // A single trackpad flick worth two day-steps, delivered as several wheel
  // events with realistic spacing (real trackpads don't deliver them in the
  // same instant, which would otherwise read as an unrealistic ~infinite
  // velocity). Each full day crossed navigates immediately — not just once
  // at the end — so continuous scrolling stays smooth at any speed/distance
  // instead of jumping.
  for (let i = 0; i < 4; i++) {
    fireEvent.wheel(scroller, { deltaX: 50, deltaY: 0, clientX: 100 })
    act(() => vi.advanceTimersByTime(16))
  }
  expect(onHorizontalNavigate).toHaveBeenCalledTimes(2)
  expect(onHorizontalNavigate).toHaveBeenCalledWith(1)
  expect(scroller).toHaveClass('is-swiping')

  // Gesture ends — the settle spring continues from the release velocity
  // (possibly crossing further days, like a real flick) and always lands
  // exactly on a day boundary. The exact number of extra days depends on the
  // spring's physics, so assert the invariant (clean boundary, not mid-drag)
  // rather than a specific call count.
  act(() => vi.advanceTimersByTime(3000))
  expect(scroller).not.toHaveClass('is-swiping')
  const finalOffset = Number(
    scroller.style.getPropertyValue('--calendar-swipe-x').replace('px', ''),
  )
  expect(Math.abs(finalOffset % 80)).toBeLessThan(0.5)
})

it('settles monotonically and keeps transitions off through the final position', async () => {
  const { container } = render(
    <TimeGrid
      days={[day]}
      rowHeight={48}
      calendars={[]}
      refresh={0}
      onCreate={vi.fn()}
      onCreateAllDay={vi.fn()}
      onEdit={vi.fn()}
      onRowHeightChange={vi.fn()}
      onHorizontalNavigate={vi.fn()}
    />,
  )
  await screen.findByRole('button', { name: 'Touch event' })
  const scroller = container.querySelector<HTMLElement>('.week-scroll')!
  vi.useFakeTimers()

  // A slowing gesture ends while still moving right, but its nearest boundary
  // is back to the left. Settling must head directly there without first
  // continuing in the release direction.
  act(() => vi.advanceTimersByTime(16))
  fireEvent.wheel(scroller, { deltaX: -25, deltaY: 0, clientX: 100 })
  act(() => vi.advanceTimersByTime(200))
  fireEvent.wheel(scroller, { deltaX: -5, deltaY: 0, clientX: 100 })
  const offsets = [
    Number(
      scroller.style.getPropertyValue('--calendar-swipe-x').replace('px', ''),
    ),
  ]

  let reachedFinalOffset = false
  for (let elapsed = 0; elapsed < 2500; elapsed += 16) {
    act(() => vi.advanceTimersByTime(16))
    const offset = Number(
      scroller.style.getPropertyValue('--calendar-swipe-x').replace('px', ''),
    )
    offsets.push(offset)
    if (offset === -80) {
      reachedFinalOffset = true
      break
    }
  }

  expect(reachedFinalOffset).toBe(true)
  expect(
    offsets.every(
      (offset, index) => index === 0 || offset <= offsets[index - 1],
    ),
  ).toBe(true)
  expect(scroller).toHaveClass('is-swiping')

  act(() => vi.advanceTimersByTime(16))
  expect(scroller).not.toHaveClass('is-swiping')
  expect(scroller.style.getPropertyValue('--calendar-swipe-x')).toBe('-80px')
})

it('commits new day columns before rebasing the horizontal transform', async () => {
  function NavigatingGrid() {
    const [visibleDay, setVisibleDay] = useState(day)
    const navigate = useCallback((distance: number) => {
      setVisibleDay((current) => {
        const next = new Date(current)
        next.setDate(next.getDate() + distance)
        return next
      })
    }, [])

    return (
      <TimeGrid
        days={[visibleDay]}
        rowHeight={48}
        calendars={[]}
        refresh={0}
        onCreate={vi.fn()}
        onCreateAllDay={vi.fn()}
        onEdit={vi.fn()}
        onRowHeightChange={vi.fn()}
        onHorizontalNavigate={navigate}
      />
    )
  }

  const { container } = render(<NavigatingGrid />)
  await screen.findByRole('button', { name: 'Touch event' })
  const scroller = container.querySelector<HTMLElement>('.week-scroll')!
  const labelsAtRebase: string[][] = []
  const nativeSetProperty = CSSStyleDeclaration.prototype.setProperty

  vi.spyOn(scroller.style, 'setProperty').mockImplementation(
    (property, value, priority) => {
      if (property === '--calendar-swipe-x' && value === '-80px') {
        labelsAtRebase.push(
          [...container.querySelectorAll('.week-header-daylabel strong')].map(
            (label) => label.textContent ?? '',
          ),
        )
      }
      nativeSetProperty.call(scroller.style, property, value, priority)
    },
  )

  fireEvent.wheel(scroller, { deltaX: 80, deltaY: 0, clientX: 100 })

  expect(labelsAtRebase.length).toBeGreaterThan(0)
  expect(
    labelsAtRebase.every((labels) => labels.join(',') === '27,28,29'),
  ).toBe(true)
})
