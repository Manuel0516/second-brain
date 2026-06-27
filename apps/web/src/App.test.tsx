import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { App } from './App'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('shows the application and reports a healthy API', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('{}', { status: 200 }),
  )

  render(<App />)

  expect(
    screen.getByRole('heading', { name: 'Second Brain' }),
  ).toBeInTheDocument()
  expect(await screen.findByText('API ready')).toBeInTheDocument()
})

test('reports an unavailable API without hiding the application', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

  render(<App />)

  expect(await screen.findByText('API unavailable')).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'Second Brain' }),
  ).toBeInTheDocument()
})
