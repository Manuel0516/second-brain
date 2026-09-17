import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useEffect, useState } from 'react'
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create new note' }))
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

  it('allows a single-day all-day event and stores an exclusive end date', async () => {
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
          start_at: '2026-06-27T00:00:00.000Z',
          end_at: '2026-06-27T00:00:00.000Z',
          all_day: true,
        }}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Event title'), {
      target: { value: 'Holiday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce(), {
      timeout: 2_000,
    })
    const request = fetchMock.mock.calls.find(
      ([url]) => String(url) === '/api/events',
    )?.[1]
    const body = JSON.parse(String(request?.body))
    expect(body.all_day).toBe(true)
    expect(
      new Date(body.end_at).getTime() - new Date(body.start_at).getTime(),
    ).toBe(24 * 60 * 60 * 1000)
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create new note' }))
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

  it('edit mode keeps links in one card and unlinks explicitly', async () => {
    let linked = true
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        const url = String(input)
        if (url.endsWith('/links'))
          return Promise.resolve(
            new Response(
              JSON.stringify(
                linked
                  ? [
                      {
                        id: 'link-1',
                        target_type: 'page',
                        target_id: 'page-1',
                        relation: 'note',
                        direction: 'outgoing',
                        title: 'Sprint notes',
                        icon: null,
                      },
                    ]
                  : [],
              ),
              { status: 200 },
            ),
          )
        if (init?.method === 'DELETE') {
          linked = false
          return Promise.resolve(new Response(null, { status: 204 }))
        }
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'event-1' }), { status: 200 }),
        )
      })
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
        onSaved={vi.fn()}
      />,
    )

    expect(await screen.findByText('Sprint notes')).toBeVisible()
    expect(screen.getByText('Linked · 1')).toBeVisible()
    expect(screen.getByRole('switch', { name: 'Notes' })).toBeVisible()
    expect(screen.getByRole('switch', { name: 'Fitness' })).toBeVisible()
    expect(screen.getByPlaceholderText('Link a note or folder…')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Create new note' }),
    ).toBeVisible()

    fireEvent.click(screen.getByRole('switch', { name: 'Notes' }))
    expect(screen.queryByPlaceholderText('Link a note or folder…')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create new note' })).toBeNull()
    expect(screen.getByText('Sprint notes')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Unlink Sprint notes' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/links/link-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    await waitFor(() => expect(screen.queryByText('Sprint notes')).toBeNull())
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

  it('closes after saving a new repeating event', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            String(input).endsWith('/api/pages') ? [] : { id: 'event-1' },
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
      target: { value: 'Standup' },
    })
    // Configure a repeat, then confirm the popover with "Done".
    fireEvent.click(screen.getByRole('button', { name: 'Repeats' }))
    fireEvent.click(screen.getByLabelText('Frequency'))
    fireEvent.click(screen.getByRole('option', { name: 'Week' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce(), {
      timeout: 2_000,
    })
  })

  it('still closes when the parent re-renders mid-save (WebSocket refresh)', async () => {
    // Reproduces the real bug: creating an event broadcasts a calendar update,
    // the parent re-renders with a fresh inline onClose, and the editor's
    // cleanup must NOT cancel the scheduled close.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'event-1' }), { status: 201 }),
      ),
    )
    const onSaved = vi.fn()

    function Harness() {
      const [, setTick] = useState(0)
      useEffect(() => {
        // Mimic a stream of parent re-renders during the close window.
        const id = setInterval(() => setTick((t) => t + 1), 40)
        return () => clearInterval(id)
      }, [])
      return (
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
          onClose={() => {}}
          onSaved={onSaved}
        />
      )
    }
    render(<Harness />)

    fireEvent.change(screen.getByPlaceholderText('Event title'), {
      target: { value: 'Standup' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce(), {
      timeout: 2_000,
    })
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

it('copies a saved university occurrence into Personal without editing the source', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async () => new Response(JSON.stringify([]), { status: 200 }),
    )
  const onSaved = vi.fn()
  render(
    <EventEditor
      calendars={[
        {
          id: 'university',
          name: 'University',
          color: '#123456',
          source: 'ics',
          is_visible: true,
        },
        {
          id: 'personal',
          name: 'Personal',
          color: '#654321',
          source: 'local',
          is_visible: true,
        },
      ]}
      event={{
        id: 'lecture',
        calendar_id: 'university',
        title: 'Lecture',
        start_at: '2026-09-21T09:00:00Z',
        end_at: '2026-09-21T10:00:00Z',
        rrule: 'WEEKLY',
      }}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  expect(
    screen.getByRole('button', { name: 'Copy destination calendar' }),
  ).toHaveTextContent('Personal')
  fireEvent.click(screen.getByRole('button', { name: 'Copy event' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  const writes = fetchMock.mock.calls.filter(
    ([, init]) => init?.method === 'POST' || init?.method === 'PATCH',
  )
  expect(writes).toHaveLength(1)
  expect(writes[0][0]).toBe('/api/events/copy')
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({
    event_ids: ['lecture'],
    target_calendar_id: 'personal',
    target_start: '2026-09-21T09:00:00Z',
    occurrence_only: true,
  })
})
