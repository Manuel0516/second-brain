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
              String(input).endsWith('/api/pages')
                ? []
                : String(input).endsWith('/note')
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
    const request = fetchMock.mock.calls.find(
      ([url]) => String(url) === '/api/events',
    )?.[1]
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({
        title: 'Project review',
        icon: '☕',
        calendar_id: 'calendar-1',
        connections: expect.objectContaining({
          notes: { title: 'Project notes', folder_id: null, link_ids: [] },
        }),
      }),
    )
  })

  it('creates the note inside the chosen folder', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              String(input).endsWith('/api/pages')
                ? [
                    {
                      id: 'folder-1',
                      title: 'Work',
                      parent_page_id: null,
                      position: 'a0',
                      type: 'folder',
                    },
                  ]
                : String(input).endsWith('/note')
                  ? { id: 'page-1', title: 'Notes' }
                  : { id: 'event-1' },
            ),
            { status: 201 },
          ),
        ),
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
      target: { value: 'Planning' },
    })
    fireEvent.click(screen.getByRole('switch', { name: 'Notes' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Folder')).toBeInTheDocument(),
    )
    // Open the folder dropdown and pick the folder.
    fireEvent.click(screen.getByLabelText('Folder'))
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Work' })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('option', { name: 'Work' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce(), {
      timeout: 2_000,
    })
    const noteCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/note'),
    )
    expect(JSON.parse(String(noteCall?.[1]?.body))).toEqual(
      expect.objectContaining({ parent_page_id: 'folder-1' }),
    )
  })

  it('edit mode shows a toggle-only notes card and unlinks on toggle-off', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        const url = String(input)
        if (url.endsWith('/links'))
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  id: 'link-1',
                  target_type: 'page',
                  target_id: 'page-1',
                  relation: 'note',
                  direction: 'outgoing',
                  title: 'Sprint notes',
                  icon: null,
                },
              ]),
              { status: 200 },
            ),
          )
        if (init?.method === 'DELETE')
          return Promise.resolve(new Response(null, { status: 204 }))
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'event-1' }), { status: 200 }),
        )
      })
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
          id: 'event-1',
          title: 'Sprint',
          calendar_id: 'calendar-1',
          start_at: '2026-06-27T10:15:00.000Z',
          end_at: '2026-06-27T11:15:00.000Z',
        }}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    )

    // Links load → toggle reflects reality; the Linked card appears.
    const toggle = await screen.findByRole('switch', { name: 'Notes' })
    await waitFor(() => expect(toggle).toBeChecked())
    expect(screen.getByText('Sprint notes')).toBeVisible()
    // Toggle-only: no note title field inside the connections card.
    expect(screen.queryByLabelText('Note title')).toBeNull()

    fireEvent.click(toggle)
    expect(screen.queryByText('Sprint notes')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce(), {
      timeout: 2_000,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/links/link-1',
      expect.objectContaining({ method: 'DELETE' }),
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
