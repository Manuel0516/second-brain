import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('creates a calendar and refreshes the list', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify({ id: 'calendar-1' }), { status: 201 }),
    )
  const onChanged = vi.fn()
  render(<Sidebar calendars={[]} onChanged={onChanged} />)

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
  render(<Sidebar calendars={[]} onChanged={vi.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: 'Add calendar' }))
  fireEvent.change(screen.getByPlaceholderText('Calendar name'), {
    target: { value: 'Projects' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Calendar name already exists',
  )
})
