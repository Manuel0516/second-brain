import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EventEditor } from './EventEditor'

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      favorite_emojis: ['📅', '💼', '☕', '🏃', '🍽️', '📝', '🎧', '🎯'],
      favorite_colors: ['#3B6FE0', '#2E9E6E', '#D6932B', '#8B5CF6', '#D9573F'],
    },
    loading: false,
    patch: vi.fn(),
  }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('EventEditor', () => {
  it('submits a new event through the API', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              String(input).endsWith('/note')
                ? { id: 'page-1', title: 'Project notes' }
                : { id: 'event-1' },
            ),
            { status: 201 },
          ),
        ),
      )
    const onSaved = vi.fn()
    const onOpenNote = vi.fn()

    render(
      <EventEditor
        calendars={[
          {
            id: 'calendar-1',
            name: 'Default',
            color: '#8B5CF6',
            is_visible: true,
            source: 'local',
          },
        ]}
        event={{
          start_at: '2026-06-27T10:15:00.000Z',
          end_at: '2026-06-27T11:15:00.000Z',
        }}
        onClose={vi.fn()}
        onSaved={onSaved}
        onOpenNote={onOpenNote}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Use color #3B6FE0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use calendar color' }))
    expect(screen.getByLabelText('Custom event color')).toHaveValue('#8b5cf6')

    fireEvent.click(screen.getByRole('button', { name: 'Choose event icon' }))
    fireEvent.click(screen.getByRole('button', { name: '☕' }))

    fireEvent.click(screen.getByRole('switch', { name: 'Notes' }))
    fireEvent.change(screen.getByLabelText('Note title'), {
      target: { value: 'Project notes' },
    })

    fireEvent.change(screen.getByPlaceholderText('Event title'), {
      target: { value: 'Project review' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce(), {
      timeout: 2_000,
    })
    expect(onOpenNote).toHaveBeenCalledWith('page-1')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/events',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/events/event-1/note',
      expect.objectContaining({ method: 'POST' }),
    )
    const request = fetchMock.mock.calls[0][1]
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({
        title: 'Project review',
        icon: '☕',
        calendar_id: 'calendar-1',
        connections: expect.objectContaining({
          notes: { title: 'Project notes' },
        }),
      }),
    )
  })

  it('shows the saved icon when editing an existing event', () => {
    render(
      <EventEditor
        calendars={[
          {
            id: 'calendar-1',
            name: 'Default',
            color: '#8B5CF6',
            is_visible: true,
            source: 'local',
          },
        ]}
        event={{
          id: 'event-1',
          icon: '📌',
          title: 'Pinned event',
          start_at: '2026-06-27T10:15:00.000Z',
          end_at: '2026-06-27T11:15:00.000Z',
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Choose event icon' }),
    ).toHaveTextContent('📌')
  })

  it('keeps the icon in draft updates while editing', () => {
    const onDraftChange = vi.fn()

    render(
      <EventEditor
        calendars={[
          {
            id: 'calendar-1',
            name: 'Default',
            color: '#8B5CF6',
            is_visible: true,
            source: 'local',
          },
        ]}
        event={{
          id: 'event-1',
          icon: '📌',
          title: 'Pinned event',
          start_at: '2026-06-27T10:15:00.000Z',
          end_at: '2026-06-27T11:15:00.000Z',
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onDraftChange={onDraftChange}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Event title'), {
      target: { value: 'Pinned event updated' },
    })

    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({
        icon: '📌',
        title: 'Pinned event updated',
      }),
    )
  })

  it('locks editor scrolling while the repeat card is open', () => {
    render(
      <EventEditor
        calendars={[
          {
            id: 'calendar-1',
            name: 'Default',
            color: '#8B5CF6',
            is_visible: true,
            source: 'local',
          },
        ]}
        event={{
          title: 'Pinned event',
          start_at: '2026-06-27T10:15:00.000Z',
          end_at: '2026-06-27T11:15:00.000Z',
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Repeats' }))

    expect(screen.getByLabelText('New event').className).toContain('locked')
  })

  it('shows validation rather than sending an invalid event', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    render(
      <EventEditor
        calendars={[]}
        event={{
          start_at: '2026-06-27T10:15:00.000Z',
          end_at: '2026-06-27T11:15:00.000Z',
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.submit(
      screen.getByRole('button', { name: 'Save' }).closest('form')!,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Create or select a calendar',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
