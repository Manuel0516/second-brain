import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { MonthView } from './MonthView'
import { TimeGrid } from './TimeGrid'
import type { CalendarEvent } from './types'

const day = new Date(2026, 5, 27)
const draft: Partial<CalendarEvent> = {
  id: 'event-1',
  calendar_id: 'calendar-1',
  title: 'Pinned event',
  icon: '📌',
  start_at: new Date(2026, 5, 27, 10).toISOString(),
  end_at: new Date(2026, 5, 27, 11).toISOString(),
  all_day: false,
}
const calendars = [
  {
    id: 'calendar-1',
    name: 'Default',
    color: '#8B5CF6',
    is_visible: true,
    source: 'local',
  },
]

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify([]), { status: 200 }),
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('keeps the draft icon visible in the time grid', () => {
  render(
    <TimeGrid
      days={[day]}
      rowHeight={48}
      calendars={calendars}
      refresh={0}
      onCreate={vi.fn()}
      onEdit={vi.fn()}
      onRowHeightChange={vi.fn()}
      onHorizontalNavigate={vi.fn()}
      draftEvent={draft}
    />,
  )

  expect(screen.getByText('📌')).toBeInTheDocument()
})

it('keeps the draft icon visible in the month grid', () => {
  render(
    <MonthView
      monthDate={day}
      calendars={calendars}
      refresh={0}
      onCreate={vi.fn()}
      onEdit={vi.fn()}
      draftEvent={draft}
    />,
  )

  expect(screen.getByText('📌')).toBeInTheDocument()
})
