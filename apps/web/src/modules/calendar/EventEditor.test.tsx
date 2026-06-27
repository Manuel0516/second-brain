import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EventEditor } from './EventEditor'

afterEach(() => vi.restoreAllMocks())

describe('EventEditor', () => {
  it('submits a new event through the API', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'event-1' }), { status: 201 }),
      )
    const onSaved = vi.fn()

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
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Event title'), {
      target: { value: 'Project review' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/events',
      expect.objectContaining({ method: 'POST' }),
    )
    const request = fetchMock.mock.calls[0][1]
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({
        title: 'Project review',
        calendar_id: 'calendar-1',
      }),
    )
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
