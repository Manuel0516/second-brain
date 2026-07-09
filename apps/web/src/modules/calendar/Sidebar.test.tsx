import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { Sidebar } from './Sidebar'

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      favorite_colors: ['#3B6FE0', '#2E9E6E', '#D6932B', '#8B5CF6', '#D9573F'],
    },
    loading: false,
    patch: vi.fn(),
  }),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', username: 'tester', email: 'tester@example.com' },
  }),
}))

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('creates a calendar and refreshes the list', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify({ id: 'calendar-1' }), { status: 201 }),
    )
  const onChanged = vi.fn()
  render(
    <MemoryRouter>
      <Sidebar calendars={[]} onChanged={onChanged} />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Add calendar' }))
  fireEvent.change(screen.getByPlaceholderText('Calendar name'), {
    target: { value: 'Projects' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/calendars',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Projects', color: '#8B5CF6' }),
    }),
  )
})

test('shows the API validation reason', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({ detail: [{ msg: 'Calendar name already exists' }] }),
      { status: 422 },
    ),
  )
  render(
    <MemoryRouter>
      <Sidebar calendars={[]} onChanged={vi.fn()} />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Add calendar' }))
  fireEvent.change(screen.getByPlaceholderText('Calendar name'), {
    target: { value: 'Projects' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Calendar name already exists',
  )
})

test('reorders calendars only after a long press and saves the preference', () => {
  Element.prototype.setPointerCapture = vi.fn()
  const calendars = [
    {
      id: 'work',
      name: 'Work',
      color: '#3B6FE0',
      is_visible: true,
      source: 'local',
    },
    {
      id: 'personal',
      name: 'Personal',
      color: '#2E9E6E',
      is_visible: true,
      source: 'local',
    },
    {
      id: 'family',
      name: 'Family',
      color: '#D6932B',
      is_visible: true,
      source: 'local',
    },
  ]
  const { container } = render(
    <MemoryRouter>
      <Sidebar calendars={calendars} onChanged={vi.fn()} />
    </MemoryRouter>,
  )
  const work = screen.getByRole('button', { name: 'Work options' })
  const workRow = work.closest('.calendar-row')!
  fireEvent.click(work)
  expect(screen.getByRole('heading', { name: 'Edit calendar' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(
    screen.queryByRole('heading', { name: 'Edit calendar' }),
  ).not.toBeInTheDocument()
  vi.useFakeTimers()

  fireEvent.pointerDown(work, {
    pointerId: 1,
    button: 0,
    clientX: 20,
    clientY: 100,
  })
  fireEvent.pointerMove(work, {
    pointerId: 1,
    clientX: 20,
    clientY: 120,
  })
  act(() => vi.advanceTimersByTime(650))
  expect(workRow).not.toHaveClass('reordering')
  fireEvent.pointerUp(work, { pointerId: 1 })

  fireEvent.pointerDown(work, {
    pointerId: 2,
    button: 0,
    clientX: 20,
    clientY: 100,
  })
  act(() => vi.advanceTimersByTime(650))
  fireEvent.pointerMove(work, {
    pointerId: 2,
    clientX: 20,
    clientY: 180,
  })
  expect(workRow).toHaveClass('reordering')
  // The row drops two slots (80px / 42px row pitch ≈ 2), and the lifted row
  // is re-anchored under the finger, leaving only the residual offset.
  expect(workRow).toHaveStyle({ transform: 'translateY(-4px) scale(1.03)' })
  fireEvent.pointerUp(work, {
    pointerId: 2,
    clientX: 20,
    clientY: 180,
  })
  fireEvent.click(work)
  expect(
    screen.queryByRole('heading', { name: 'Edit calendar' }),
  ).not.toBeInTheDocument()

  expect(
    [...container.querySelectorAll('.calendar-name')].map(
      (element) => element.textContent,
    ),
  ).toEqual(['Personal', 'Family', 'Work'])
  expect(localStorage.getItem('sb-calendar-order')).toBe(
    JSON.stringify(['personal', 'family', 'work']),
  )
})
