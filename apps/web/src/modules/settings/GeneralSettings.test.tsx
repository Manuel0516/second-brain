import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { GeneralSettings } from './GeneralSettings'

const apiCall = vi.fn()

vi.mock('../../lib/api', () => ({
  apiCall: (...args: unknown[]) => apiCall(...args),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      username: 'manuel',
      email: 'manuel@example.com',
      role: 'user',
    },
    logout: vi.fn(),
  }),
}))

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      favorite_emojis: [],
      visual_style: 'neon',
      theme: 'system',
      timezone: 'UTC',
      time_format: '24h',
    },
    patch: vi.fn(),
  }),
}))

beforeEach(() => {
  apiCall.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

function renderPage() {
  render(
    <MemoryRouter>
      <GeneralSettings />
    </MemoryRouter>,
  )
  const profileCard = screen
    .getByRole('heading', { name: 'Profile' })
    .closest('section') as HTMLElement
  const passwordCard = screen
    .getByRole('heading', { name: 'Password' })
    .closest('section') as HTMLElement
  return { profileCard, passwordCard }
}

test('profile save success is announced via role=status', async () => {
  apiCall.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ username: 'manuel2', email: 'manuel@example.com' }),
      {
        status: 200,
      },
    ),
  )
  const { profileCard } = renderPage()

  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'manuel2' },
  })
  fireEvent.click(within(profileCard).getByRole('button', { name: 'Save' }))

  expect(await within(profileCard).findByRole('status')).toHaveTextContent(
    'Saved',
  )
})

test('profile save failure is announced via role=alert', async () => {
  apiCall.mockResolvedValueOnce(
    new Response(JSON.stringify({ detail: 'Username taken' }), { status: 400 }),
  )
  const { profileCard } = renderPage()

  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'taken' },
  })
  fireEvent.click(within(profileCard).getByRole('button', { name: 'Save' }))

  expect(await within(profileCard).findByRole('alert')).toHaveTextContent(
    'Username taken',
  )
})

test('password save success is announced via role=status', async () => {
  apiCall.mockResolvedValueOnce(new Response(null, { status: 200 }))
  const { passwordCard } = renderPage()

  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'oldpassword1' },
  })
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: 'newpassword1' },
  })
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: 'newpassword1' },
  })
  fireEvent.click(within(passwordCard).getByRole('button', { name: 'Save' }))

  expect(await within(passwordCard).findByRole('status')).toHaveTextContent(
    'Password updated',
  )
})

test('password mismatch is announced via role=alert without a request', () => {
  const { passwordCard } = renderPage()

  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'oldpassword1' },
  })
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: 'newpassword1' },
  })
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: 'different1' },
  })
  fireEvent.click(within(passwordCard).getByRole('button', { name: 'Save' }))

  expect(within(passwordCard).getByRole('alert')).toHaveTextContent(
    'Passwords do not match',
  )
  expect(apiCall).not.toHaveBeenCalled()
})
