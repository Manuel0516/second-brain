import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { AuthProvider, useAuth } from './AuthContext'

const apiMocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  refreshAccessToken: vi.fn(),
}))

vi.mock('../lib/api', () => apiMocks)

const userResponse = () =>
  new Response(
    JSON.stringify({
      id: 'user-1',
      username: 'manuel',
      email: 'manuel@example.com',
      is_admin: true,
      is_test_account: false,
      totp_enabled: true,
    }),
    { status: 200 },
  )

function AuthProbe() {
  const { isAuthenticated, loading, logout, user } = useAuth()

  return (
    <>
      <span>
        {loading ? 'loading' : isAuthenticated ? user?.email : 'logged out'}
      </span>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </>
  )
}

beforeEach(() => {
  apiMocks.apiCall.mockReset()
  apiMocks.refreshAccessToken.mockReset()
})

test('restores the session on startup when the access token has expired', async () => {
  apiMocks.apiCall
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(userResponse())
  apiMocks.refreshAccessToken.mockResolvedValueOnce(true)

  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  )

  expect(await screen.findByText('manuel@example.com')).toBeInTheDocument()
  expect(apiMocks.refreshAccessToken).toHaveBeenCalledTimes(1)
  expect(apiMocks.apiCall).toHaveBeenNthCalledWith(1, '/api/auth/me')
  expect(apiMocks.apiCall).toHaveBeenNthCalledWith(2, '/api/auth/me')
})

test('refreshes an expired access token before retrying logout', async () => {
  apiMocks.apiCall
    .mockResolvedValueOnce(userResponse())
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
  apiMocks.refreshAccessToken.mockResolvedValueOnce(true)

  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  )

  await screen.findByText('manuel@example.com')
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

  await waitFor(() => {
    expect(screen.getByText('logged out')).toBeInTheDocument()
  })
  expect(apiMocks.refreshAccessToken).toHaveBeenCalledTimes(1)
  expect(apiMocks.apiCall).toHaveBeenNthCalledWith(2, '/api/auth/logout', {
    method: 'POST',
  })
  expect(apiMocks.apiCall).toHaveBeenNthCalledWith(3, '/api/auth/logout', {
    method: 'POST',
  })
})
