import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AISettings } from './AISettings'

const CONFIG = {
  provider: 'openrouter',
  model_name: 'test-model',
  local_endpoint_url: null,
  autonomy_level: 'ask_before_write',
  embedding_provider: 'openrouter',
  embedding_model: 'test-embed',
  embedding_endpoint_url: null,
  embedding_dimensions: 1536,
  web_fetch_enabled: false,
}

function mockFetch(
  overrides: {
    importResponse?: unknown
    importOk?: boolean
    memories?: unknown[]
    settings?: unknown
    settingsOk?: boolean
    capabilities?: unknown
    capabilitiesOk?: boolean
  } = {},
) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, init })
    if (u === '/api/ai/settings')
      return {
        ok: overrides.settingsOk ?? true,
        status: overrides.settingsOk === false ? 500 : 200,
        json: async () => overrides.settings ?? CONFIG,
      }
    if (u === '/api/ai/memories')
      return { ok: true, json: async () => overrides.memories ?? [] }
    if (u === '/api/ai/capabilities')
      return {
        ok: overrides.capabilitiesOk ?? true,
        status: overrides.capabilitiesOk === false ? 500 : 200,
        json: async () => overrides.capabilities ?? [],
      }
    if (u === '/api/ai/actions') return { ok: true, json: async () => [] }
    if (u === '/api/ai/skills') return { ok: true, json: async () => [] }
    if (u === '/api/ai/knowledge/export') {
      return {
        ok: true,
        blob: async () => new Blob(['{}'], { type: 'application/json' }),
      }
    }
    if (u === '/api/ai/knowledge/import') {
      return {
        ok: overrides.importOk ?? true,
        json: async () =>
          overrides.importResponse ?? {
            memories_imported: 2,
            memories_already_known: 1,
            skills_imported: 1,
            tools_imported: 0,
            tools_skipped: [],
          },
      }
    }
    return { ok: true, json: async () => ({}) }
  })
  return { fn, calls }
}

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('importing a valid export file shows the result summary', async () => {
  const { fn } = mockFetch()
  vi.stubGlobal('fetch', fn)
  render(<AISettings />)

  await screen.findByText('Model & autonomy')
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(
    [JSON.stringify({ memories: [], skills: [], tools: [] })],
    'export.json',
    { type: 'application/json' },
  )
  fireEvent.change(input, { target: { files: [file] } })

  await waitFor(() =>
    expect(
      screen.getByText(/Imported 2 memories \(1 already known\)/),
    ).toBeTruthy(),
  )
})

test('importing invalid JSON shows an error instead of calling the API', async () => {
  const { fn } = mockFetch()
  vi.stubGlobal('fetch', fn)
  render(<AISettings />)

  await screen.findByText('Model & autonomy')
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['not json'], 'export.json', {
    type: 'application/json',
  })
  fireEvent.change(input, { target: { files: [file] } })

  await waitFor(() =>
    expect(screen.getByText('That file is not valid JSON.')).toBeTruthy(),
  )
  expect(fn).not.toHaveBeenCalledWith(
    '/api/ai/knowledge/import',
    expect.anything(),
  )
})

test('forgetting a memory deletes it and removes it from the list', async () => {
  const { fn, calls } = mockFetch({
    memories: [
      { id: 'mem-1', fact: 'Gym calendar is blue', category: 'preference' },
    ],
  })
  vi.stubGlobal('fetch', fn)
  render(<AISettings />)

  await screen.findByText('Gym calendar is blue')
  fireEvent.click(screen.getByRole('button', { name: /Forget/ }))

  await waitFor(() =>
    expect(screen.queryByText('Gym calendar is blue')).toBeNull(),
  )
  expect(
    calls.some(
      (c) => c.url === '/api/ai/memories/mem-1' && c.init?.method === 'DELETE',
    ),
  ).toBe(true)
})

test('export button fetches the export endpoint', async () => {
  const { fn, calls } = mockFetch()
  vi.stubGlobal('fetch', fn)
  render(<AISettings />)

  await screen.findByText('Model & autonomy')
  fireEvent.click(screen.getByRole('button', { name: 'Export' }))

  await waitFor(() =>
    expect(calls.some((c) => c.url === '/api/ai/knowledge/export')).toBe(true),
  )
})

test('settings API failure shows a useful error instead of crashing', async () => {
  const { fn } = mockFetch({ settingsOk: false })
  vi.stubGlobal('fetch', fn)
  render(<AISettings />)

  expect(
    await screen.findByText(/database migrations are up to date/),
  ).toBeTruthy()
  expect(screen.queryByText('Model & autonomy')).toBeNull()
})

test('an optional section failure keeps the settings page usable', async () => {
  const { fn } = mockFetch({
    capabilities: { detail: 'Internal Server Error' },
  })
  vi.stubGlobal('fetch', fn)
  render(<AISettings />)

  expect(await screen.findByText('Model & autonomy')).toBeTruthy()
  expect(
    screen.getByText('Some assistant data could not be loaded: capabilities.'),
  ).toBeTruthy()
  expect(screen.getByText('Capabilities (0 enabled)')).toBeTruthy()
})
