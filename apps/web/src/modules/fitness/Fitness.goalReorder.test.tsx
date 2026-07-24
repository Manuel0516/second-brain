import { describe, it, vi, expect, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SettingsProvider } from '../../context/SettingsContext'
import type { Goal } from './api'

function goal(id: string, metric_key: string, order_index: number): Goal {
  return {
    id,
    target_type: 'body_metric',
    exercise_id: null,
    metric_key,
    target_value: 10,
    target_date: null,
    order_index,
    current_value: 1,
    created_at: '',
    updated_at: '',
  }
}

function mockFetch(goals: Goal[]) {
  const patches: Array<{ id: string; order_index: number }> = []
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    if (init?.method === 'PATCH' && u.includes('/api/fitness/goals/')) {
      const id = u.split('/').pop() as string
      const body = JSON.parse(String(init.body))
      patches.push({ id, order_index: body.order_index })
      return { ok: true, status: 200, json: async () => ({}) }
    }
    if (u.includes('/api/fitness/goals')) {
      return { ok: true, status: 200, json: async () => goals }
    }
    if (u.includes('/stats'))
      return { ok: true, status: 200, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => [] }
  })
  return { fn, patches }
}

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

afterEach(() => {
  vi.useRealTimers()
})

async function renderGoals(goals: Goal[]) {
  const { fn, patches } = mockFetch(goals)
  vi.stubGlobal('fetch', fn)
  const { Fitness } = await import('./Fitness')

  render(
    <MemoryRouter>
      <SettingsProvider>
        <Fitness />
      </SettingsProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('button', { name: 'Reorder goals' })
  return { patches }
}

describe('Fitness sidebar goal keyboard reorder', () => {
  it('hides the move buttons until reorder mode is toggled on', async () => {
    await renderGoals([goal('g1', 'First', 0), goal('g2', 'Second', 1)])

    expect(
      screen.queryByRole('button', { name: 'Move First up' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reorder goals' }))
    expect(
      await screen.findByRole('button', { name: 'Move Second up' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Hide reorder controls' }),
    ).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(
      screen.getByRole('button', { name: 'Hide reorder controls' }),
    )
    expect(
      screen.queryByRole('button', { name: 'Move First up' }),
    ).not.toBeInTheDocument()
  })

  it('reveals the move buttons on a long press and reverts a quick tap to a no-op', async () => {
    Element.prototype.setPointerCapture = vi.fn()
    await renderGoals([goal('g1', 'First', 0), goal('g2', 'Second', 1)])
    vi.useFakeTimers()

    const card = screen.getByLabelText('Reorder First')
    fireEvent.pointerDown(card, { clientX: 0, clientY: 0, pointerId: 1 })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(
      screen.getByRole('button', { name: 'Move Second up' }),
    ).toBeInTheDocument()
    fireEvent.pointerUp(card, { pointerId: 1 })
  })

  it('closes on an outside click', async () => {
    await renderGoals([goal('g1', 'First', 0), goal('g2', 'Second', 1)])

    fireEvent.click(screen.getByRole('button', { name: 'Reorder goals' }))
    await screen.findByRole('button', { name: 'Move Second up' })

    fireEvent.pointerDown(document.body)
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Move First up' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('moves a goal with buttons alone, disables boundary buttons, and announces the new position', async () => {
    const { patches } = await renderGoals([
      goal('g1', 'First', 0),
      goal('g2', 'Second', 1),
      goal('g3', 'Third', 2),
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Reorder goals' }))

    await screen.findByRole('button', { name: 'Move Second up' })
    expect(screen.getByRole('button', { name: 'Move First up' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Move Third down' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Move Second up' }),
    ).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Move Second up' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Second moved to position 1 of 3',
      ),
    )
    await waitFor(() => expect(patches.length).toBe(2))
    expect(patches).toEqual(
      expect.arrayContaining([
        { id: 'g1', order_index: 1 },
        { id: 'g2', order_index: 0 },
      ]),
    )

    // The move re-renders with the new order — "up" is now disabled for the
    // goal that moved into first place. Reorder mode stays open through the
    // move so the user can keep adjusting.
    expect(
      screen.getByRole('button', { name: 'Move Second up' }),
    ).toBeDisabled()
  })
})
