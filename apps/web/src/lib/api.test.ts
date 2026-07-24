import { afterEach, expect, test, vi } from 'vitest'

import { apiCall, refreshAccessToken } from './api'

afterEach(() => {
  vi.restoreAllMocks()
})

test('shares one refresh request between concurrent callers', async () => {
  let resolveRefresh!: (response: Response) => void
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        resolveRefresh = resolve
      }),
  )

  const firstRefresh = refreshAccessToken()
  const secondRefresh = refreshAccessToken()

  expect(fetchMock).toHaveBeenCalledTimes(1)
  resolveRefresh(new Response(null, { status: 200 }))

  await expect(firstRefresh).resolves.toBe(true)
  await expect(secondRefresh).resolves.toBe(true)
})

test('refreshes once and retries an authenticated request after a 401', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(new Response('retried', { status: 200 }))

  const response = await apiCall('/api/events')

  expect(await response.text()).toBe('retried')
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    '/api/events',
    '/api/auth/refresh',
    '/api/events',
  ])
})
