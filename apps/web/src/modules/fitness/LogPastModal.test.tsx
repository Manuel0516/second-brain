import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LogPastModal } from './LogPastModal'
import { SettingsProvider } from '../../context/SettingsContext'
import * as fitnessApi from './api'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    fetchExercises: vi.fn(),
    createSession: vi.fn(),
    createExercise: vi.fn(),
    createSetEntry: vi.fn(),
  }
})

afterEach(() => vi.clearAllMocks())

function renderModal(onClose = vi.fn()) {
  vi.mocked(fitnessApi.fetchExercises).mockResolvedValue([])
  render(
    <SettingsProvider>
      <LogPastModal open onClose={onClose} onSaved={vi.fn()} />
    </SettingsProvider>,
  )
  return onClose
}

/** Stateful harness so a confirmed close actually flips `open`, exercising
 * the focus-restoration cleanup in useDialogFocus. */
function Harness() {
  const [open, setOpen] = useState(true)
  return (
    <SettingsProvider>
      <button type="button">Opener</button>
      <LogPastModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={vi.fn()}
      />
    </SettingsProvider>
  )
}

function addExercise(name: string) {
  fireEvent.change(screen.getByPlaceholderText('Search or add exercise…'), {
    target: { value: name },
  })
  fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
}

describe('LogPastModal', () => {
  it('exposes session type as a radiogroup matching Segmented semantics', async () => {
    renderModal()
    const group = screen.getByRole('radiogroup', { name: 'Session type' })
    expect(group).toBeInTheDocument()
    const push = screen.getByRole('radio', { name: 'Push' })
    expect(push).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByRole('radio', { name: 'Pull' }))
    expect(screen.getByRole('radio', { name: 'Pull' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('orders strength set fields as reps then weight with a feeling scale and note', async () => {
    renderModal()
    addExercise('Bench press')

    const heading = await screen.findByRole('heading', { name: 'Bench press' })
    const card = heading.closest('section')!
    const labels = Array.from(card.querySelectorAll('label > span')).map(
      (el) => el.textContent,
    )
    expect(labels).toEqual(['Reps', 'kg', 'Set note'])
    expect(
      screen.getByRole('group', { name: 'Bench press set 1 feeling' }),
    ).toBeInTheDocument()
  })

  it('orders cardio set fields as distance then time', async () => {
    renderModal()
    addExercise('Running')

    const heading = await screen.findByRole('heading', { name: 'Running' })
    const card = heading.closest('section')!
    const labels = Array.from(card.querySelectorAll('label > span')).map(
      (el) => el.textContent,
    )
    expect(labels).toEqual(['Distance', 'Time', 'Set note'])
  })

  it('toggles feeling checked state per set', async () => {
    renderModal()
    addExercise('Bench press')
    await screen.findByRole('heading', { name: 'Bench press' })

    const great = screen.getByRole('button', { name: 'Great' })
    expect(great).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(great)
    expect(great).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(great)
    expect(great).toHaveAttribute('aria-pressed', 'false')
  })

  it('gives the note field and remove controls accessible names', async () => {
    renderModal()
    addExercise('Bench press')
    await screen.findByRole('heading', { name: 'Bench press' })

    expect(screen.getByLabelText('Set note')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove set 1' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove Bench press' }),
    ).toBeInTheDocument()
  })

  it('adds and removes sets while keeping draft values for the remaining sets', async () => {
    renderModal()
    addExercise('Bench press')
    await screen.findByRole('heading', { name: 'Bench press' })

    fireEvent.change(screen.getByPlaceholderText('8'), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('button', { name: '+ Set' }))
    expect(screen.getAllByDisplayValue('5')).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: 'Remove set 2' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove set 2' }))
    expect(screen.getAllByDisplayValue('5')).toHaveLength(1)
    expect(
      screen.queryByRole('button', { name: 'Remove set 2' }),
    ).not.toBeInTheDocument()
  })

  it('submits feeling and notes alongside the other set fields', async () => {
    vi.mocked(fitnessApi.createSession).mockResolvedValue({
      id: 'session-1',
      user_id: 'user-1',
      date: '',
      type: 'Push',
      status: 'completed',
      scheduled_at: null,
      plan: null,
      notes: { type: 'doc', content: [] },
      created_at: '',
      updated_at: '',
    })
    vi.mocked(fitnessApi.createExercise).mockResolvedValue({
      id: 'ex-1',
      name: 'Bench press',
      category: 'strength',
      unit: 'reps+weight',
      created_at: '',
      updated_at: '',
    })

    renderModal()
    addExercise('Bench press')
    await screen.findByRole('heading', { name: 'Bench press' })

    fireEvent.change(screen.getByPlaceholderText('8'), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Great' }))
    fireEvent.change(screen.getByLabelText('Set note'), {
      target: { value: 'Felt strong' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Log workout' }))

    await waitFor(() =>
      expect(fitnessApi.createSetEntry).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          reps: 5,
          feeling: 5,
          notes: 'Felt strong',
        }),
      ),
    )
  })
})

describe('LogPastModal focus and dismissal', () => {
  it('focuses inside the dialog on open and labels it via aria-labelledby', async () => {
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'Log past workout' })
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    )
  })

  it('traps Tab within the dialog', async () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, [tabindex]',
      ),
    ).filter((el) => !el.hasAttribute('hidden'))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('closes immediately on Escape when the draft is clean', () => {
    const onClose = renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByRole('dialog', { name: 'Discard changes?' }),
    ).not.toBeInTheDocument()
  })

  it('asks for confirmation on Escape when the draft is dirty, and Keep editing preserves it', () => {
    const onClose = renderModal()
    addExercise('Bench press')
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    const confirm = screen.getByRole('dialog', { name: 'Discard changes?' })
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Keep editing' }),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByRole('heading', { name: 'Bench press' }),
    ).toBeInTheDocument()
  })

  it('Discard changes closes the modal from the dirty-confirmation dialog', () => {
    const onClose = renderModal()
    addExercise('Bench press')
    fireEvent.keyDown(document, { key: 'Escape' })
    const confirm = screen.getByRole('dialog', { name: 'Discard changes?' })
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Discard changes' }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close or prompt on Escape while submitting', async () => {
    vi.mocked(fitnessApi.createSession).mockReturnValue(new Promise(() => {}))
    const onClose = renderModal()
    addExercise('Bench press')
    fireEvent.click(screen.getByRole('button', { name: 'Log workout' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('dialog', { name: 'Discard changes?' }),
    ).not.toBeInTheDocument()
  })

  it('restores focus to the opener once a confirmed close actually unmounts the dialog', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Opener' })
    opener.focus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.activeElement).toBe(opener)
  })
})
