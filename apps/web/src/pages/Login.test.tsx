import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { Login } from './Login'

const login = vi.fn()

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login, isAuthenticated: false }),
}))

beforeEach(() => {
  login.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  )
}

test('submits email and password on first submit', async () => {
  login.mockResolvedValueOnce('totp_required')
  renderLogin()

  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'manuel@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'hunter2' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  await waitFor(() => {
    expect(login).toHaveBeenCalledWith('manuel@example.com', 'hunter2', '')
  })
})

test('retains the password through the TOTP step and focuses the code input', async () => {
  login.mockResolvedValueOnce('totp_required')
  renderLogin()

  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'manuel@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'hunter2' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  const totpInput = await screen.findByLabelText('Authenticator code')
  await waitFor(() => expect(totpInput).toHaveFocus())

  login.mockResolvedValueOnce('success')
  fireEvent.change(totpInput, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

  await waitFor(() => {
    expect(login).toHaveBeenLastCalledWith(
      'manuel@example.com',
      'hunter2',
      '123456',
    )
  })
})

test('an invalid code clears only the code and keeps the password for retry', async () => {
  login.mockResolvedValueOnce('totp_required')
  renderLogin()

  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'manuel@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'hunter2' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  const totpInput = await screen.findByLabelText('Authenticator code')
  login.mockRejectedValueOnce(new Error('Invalid TOTP code'))
  fireEvent.change(totpInput, { target: { value: '000000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Invalid TOTP code',
  )
  expect((totpInput as HTMLInputElement).value).toBe('')

  login.mockResolvedValueOnce('success')
  fireEvent.change(totpInput, { target: { value: '654321' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

  await waitFor(() => {
    expect(login).toHaveBeenLastCalledWith(
      'manuel@example.com',
      'hunter2',
      '654321',
    )
  })
})

test('clears credentials and navigates on success', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  login.mockResolvedValueOnce('success')
  renderLogin()

  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'manuel@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'hunter2' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  await waitFor(() => expect(login).toHaveBeenCalledTimes(1))
  await vi.advanceTimersByTimeAsync(500)
})

test('exposes an alert region for errors and a status region for progress', () => {
  renderLogin()

  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('disables the submit button while a request is in flight', async () => {
  let resolveLogin: (value: string) => void = () => {}
  login.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveLogin = resolve
    }),
  )
  renderLogin()

  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'manuel@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'hunter2' },
  })
  const button = screen.getByRole('button', { name: 'Sign in' })
  fireEvent.click(button)

  await waitFor(() => expect(button).toBeDisabled())
  resolveLogin('totp_required')
  await screen.findByLabelText('Authenticator code')
  expect(login).toHaveBeenCalledTimes(1)
})
