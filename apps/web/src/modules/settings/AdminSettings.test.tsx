import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { AdminSettings } from './AdminSettings'

const apiCall = vi.fn()

vi.mock('../../lib/api', () => ({
  apiCall: (...args: unknown[]) => apiCall(...args),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin',
    },
  }),
}))

beforeEach(() => {
  apiCall.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminSettings />
    </MemoryRouter>,
  )
}

test('a failed user list load is announced via role=alert', async () => {
  apiCall.mockResolvedValueOnce(
    new Response(JSON.stringify({ detail: 'Could not load users' }), {
      status: 500,
    }),
  )
  renderPage()

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not load users',
  )
})

test('a failed create-user request is announced via role=alert', async () => {
  apiCall.mockResolvedValueOnce(
    new Response(JSON.stringify([]), { status: 200 }),
  )
  apiCall.mockResolvedValueOnce(
    new Response(JSON.stringify({ detail: 'Email already in use' }), {
      status: 400,
    }),
  )
  renderPage()

  await screen.findByRole('heading', { name: 'Users (0)' })
  fireEvent.click(screen.getByRole('button', { name: '+ New user' }))
  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'newuser' },
  })
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'dup@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'longenoughpassword' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Email already in use',
  )
})
