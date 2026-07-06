import { describe, it, vi, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SettingsProvider } from '../../context/SettingsContext'

const mockFetch = (bodyWeight: unknown) =>
  vi.fn(async (url: RequestInfo | URL) => ({
    ok: true,
    status: 200,
    json: async () => {
      const u = String(url)
      if (u.includes('/stats/body-weight')) return bodyWeight
      if (u.includes('/body-metrics'))
        return [
          {
            id: 'metric-1',
            date: '2026-07-05T08:00:00Z',
            weight: 80,
          },
        ]
      if (u.includes('/stats')) return {}
      return []
    },
  }))

vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
)

describe('Fitness page smoke', () => {
  it('renders with healthy body-weight payload', async () => {
    vi.stubGlobal('fetch', mockFetch({ metrics: [], trend: null }))
    const { Fitness } = await import('./Fitness')
    const { unmount } = render(
      <MemoryRouter>
        <SettingsProvider>
          <Fitness />
        </SettingsProvider>
      </MemoryRouter>,
    )
    expect(await screen.findAllByText(/fitness/i)).toBeTruthy()
    unmount()
  })

  it('survives malformed stats payload', async () => {
    vi.stubGlobal('fetch', mockFetch({}))
    const { Fitness } = await import('./Fitness')
    const { unmount } = render(
      <MemoryRouter>
        <SettingsProvider>
          <Fitness />
        </SettingsProvider>
      </MemoryRouter>,
    )
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.getAllByText(/fitness/i).length).toBeGreaterThan(0)
    unmount()
  })
})
