import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionForm } from './SessionForm'
import * as fitnessApi from './api'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    fetchSessions: vi.fn(),
    fetchSetEntries: vi.fn(),
    fetchExercises: vi.fn(),
    updateSession: vi.fn(),
    updateSetEntry: vi.fn(),
  }
})

afterEach(() => vi.clearAllMocks())

describe('SessionForm', () => {
  it('groups sets by exercise and shows workout, set notes, and feeling', async () => {
    vi.mocked(fitnessApi.fetchSessions).mockResolvedValue([
      {
        id: 'session-1',
        user_id: 'user-1',
        date: '2026-07-01T12:00:00Z',
        type: 'Push',
        status: 'completed' as const,
        scheduled_at: null,
        plan: null,
        notes: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Strong session' }],
            },
          ],
        },
        created_at: '',
        updated_at: '',
      },
    ])
    vi.mocked(fitnessApi.fetchExercises).mockResolvedValue([
      {
        id: 'bench',
        name: 'Bench press',
        category: 'strength',
        unit: 'reps+weight',
        created_at: '',
        updated_at: '',
      },
      {
        id: 'dips',
        name: 'Dips',
        category: 'strength',
        unit: 'reps',
        created_at: '',
        updated_at: '',
      },
    ])
    vi.mocked(fitnessApi.fetchSetEntries).mockResolvedValue([
      {
        id: 'set-1',
        workout_session_id: 'session-1',
        exercise_id: 'bench',
        set_number: 1,
        reps: 8,
        weight: 70,
        distance_km: null,
        duration_min: null,
        rpe: null,
        feeling: 5,
        notes: 'Smooth',
        created_at: '',
        updated_at: '',
      },
      {
        id: 'set-2',
        workout_session_id: 'session-1',
        exercise_id: 'dips',
        set_number: 1,
        reps: 10,
        weight: null,
        distance_km: null,
        duration_min: null,
        rpe: null,
        feeling: 3,
        notes: null,
        created_at: '',
        updated_at: '',
      },
    ])

    render(<SessionForm />)
    expect(await screen.findByText('Strong session')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const bench = await screen.findByRole('heading', { name: 'Bench press' })
    const benchCard = bench.closest('section')!
    expect(within(benchCard).getByDisplayValue('Smooth')).toBeVisible()
    expect(
      within(benchCard).getByRole('button', { name: 'Great' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Dips' })).toBeVisible()

    fireEvent.change(screen.getByPlaceholderText('How did the workout go?'), {
      target: { value: 'Updated note' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save workout' }))
    await waitFor(() =>
      expect(fitnessApi.updateSession).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          notes: expect.objectContaining({ type: 'doc' }),
        }),
      ),
    )
  })
})
