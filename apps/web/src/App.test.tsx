import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { App } from './App'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  // Mock the auth API call to simulate unauthenticated state
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/api/auth/me')) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
        }),
      )
    }
    return Promise.resolve(
      new Response(JSON.stringify({}), { status: 200 }),
    )
  })
})

test('renders the login page when not authenticated', async () => {
  render(<App />)

  await waitFor(() => {
    expect(
      screen.getByRole('heading', { name: 'Login' }),
    ).toBeInTheDocument()
  })
})
