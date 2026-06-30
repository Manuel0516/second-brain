import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
