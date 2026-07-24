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
    deleteSession: vi.fn(),
  }
})

afterEach(() => vi.clearAllMocks())

const session = {
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
}

const exercises: fitnessApi.Exercise[] = [
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
]

const sets = [
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
]

async function renderEditing() {
  vi.mocked(fitnessApi.fetchSessions).mockResolvedValue([session])
  vi.mocked(fitnessApi.fetchExercises).mockResolvedValue(exercises)
  vi.mocked(fitnessApi.fetchSetEntries).mockResolvedValue(sets)

  render(<SessionForm />)
  expect(await screen.findByText('Strong session')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await screen.findByRole('heading', { name: 'Bench press' })
}

describe('SessionForm', () => {
  it('groups sets by exercise and shows workout, set notes, and feeling', async () => {
    await renderEditing()

    const bench = screen.getByRole('heading', { name: 'Bench press' })
    const benchCard = bench.closest('section')!
    expect(within(benchCard).getByDisplayValue('Smooth')).toBeVisible()
    expect(
      within(benchCard).getByRole('button', { name: 'Great' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Dips' })).toBeVisible()
  })

  it('autosaves the workout note on blur and shows saving/saved status', async () => {
    vi.mocked(fitnessApi.updateSession).mockResolvedValue({
      ...session,
      notes: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Updated' }] },
        ],
      },
    })
    await renderEditing()

    fireEvent.change(screen.getByPlaceholderText('How did the workout go?'), {
      target: { value: 'Updated' },
    })
    fireEvent.blur(screen.getByPlaceholderText('How did the workout go?'))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Saved'),
    )
    expect(fitnessApi.updateSession).toHaveBeenCalledTimes(1)
    expect(fitnessApi.updateSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        notes: expect.objectContaining({ type: 'doc' }),
      }),
    )
    const call = vi.mocked(fitnessApi.updateSession).mock.calls[0][1]
    expect(call).not.toHaveProperty('date')
    expect(call).not.toHaveProperty('type')
  })

  it('does not send a request when a field is blurred unchanged', async () => {
    await renderEditing()

    fireEvent.blur(screen.getByPlaceholderText('Workout type'))
    fireEvent.blur(screen.getByPlaceholderText('How did the workout go?'))

    expect(fitnessApi.updateSession).not.toHaveBeenCalled()
  })

  it('blocks Done while saving and after an error, and allows retry by blurring again', async () => {
    let resolveSave: (value: typeof session) => void = () => {}
    vi.mocked(fitnessApi.updateSession).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        }),
    )
    await renderEditing()

    const typeInput = screen.getByPlaceholderText('Workout type')
    fireEvent.change(typeInput, { target: { value: 'Pull' } })
    fireEvent.blur(typeInput)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Saving…'),
    )
    const done = screen.getByRole('button', { name: 'Done' })
    expect(done).toBeDisabled()
    fireEvent.click(done)
    expect(screen.getByRole('heading', { name: 'Bench press' })).toBeVisible()

    resolveSave({ ...session, type: 'Pull' })
    await waitFor(() => expect(done).not.toBeDisabled())

    // Now simulate a failing save and confirm Done stays blocked.
    vi.mocked(fitnessApi.updateSession).mockRejectedValueOnce(new Error('fail'))
    fireEvent.change(typeInput, { target: { value: 'Legs' } })
    fireEvent.blur(typeInput)
    await waitFor(() => expect(done).toBeDisabled())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to save workout',
    )

    vi.mocked(fitnessApi.updateSession).mockResolvedValueOnce({
      ...session,
      type: 'Legs',
    })
    fireEvent.blur(typeInput)
    await waitFor(() => expect(done).not.toBeDisabled())

    fireEvent.click(done)
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Bench press' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('set edits still persist on blur and there is no Cancel affordance', async () => {
    vi.mocked(fitnessApi.updateSetEntry).mockResolvedValue({
      ...sets[0],
      weight: 75,
    })
    await renderEditing()

    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Save workout' }),
    ).not.toBeInTheDocument()

    const bench = screen.getByRole('heading', { name: 'Bench press' })
    const benchCard = bench.closest('section')!
    const weightInput = within(benchCard).getByDisplayValue('70')
    fireEvent.change(weightInput, { target: { value: '75' } })
    fireEvent.blur(weightInput)

    await waitFor(() =>
      expect(fitnessApi.updateSetEntry).toHaveBeenCalledWith(
        'session-1',
        'set-1',
        { weight: 75 },
      ),
    )
  })

  it('requires confirmation before deleting a completed session', async () => {
    vi.mocked(fitnessApi.fetchSessions).mockResolvedValue([session])
    render(<SessionForm />)
    await screen.findByText('Strong session')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Delete "Push"?')).toBeVisible()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fitnessApi.deleteSession).not.toHaveBeenCalled()
    expect(screen.getByText('Push')).toBeVisible()
  })

  it('deletes once on confirm and keeps the row with an alert on failure', async () => {
    vi.mocked(fitnessApi.fetchSessions).mockResolvedValue([session])
    vi.mocked(fitnessApi.deleteSession).mockRejectedValueOnce(new Error('fail'))
    render(<SessionForm />)
    await screen.findByText('Strong session')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to delete session',
    )
    expect(fitnessApi.deleteSession).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Push')).toBeVisible()
  })
})
