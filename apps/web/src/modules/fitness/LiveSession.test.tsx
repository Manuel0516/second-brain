import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LiveSession } from './LiveSession'
import type { ActiveSession } from './exerciseLibrary'
import { SettingsProvider } from '../../context/SettingsContext'

const session: ActiveSession = {
  type: 'Push',
  exercises: [
    {
      name: 'Bench press',
      prev: '70 kg x 8',
      sets: [{ w: '70', r: '8', done: false }],
    },
  ],
}

describe('LiveSession', () => {
  it('updates set feeling and notes and adds an exercise inline', () => {
    const onUpdate = vi.fn()
    const { rerender } = render(
      <SettingsProvider>
        <LiveSession session={session} onUpdate={onUpdate} onFinish={vi.fn()} />
      </SettingsProvider>,
    )

    expect(
      screen.getByRole('button', { name: 'Mark set 1 done' }),
    ).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Great' }))
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        exercises: [
          expect.objectContaining({
            sets: [expect.objectContaining({ feeling: 5 })],
          }),
        ],
      }),
    )

    const withFeeling = onUpdate.mock.calls.at(-1)?.[0] as ActiveSession
    rerender(
      <SettingsProvider>
        <LiveSession
          session={withFeeling}
          onUpdate={onUpdate}
          onFinish={vi.fn()}
        />
      </SettingsProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add note for set 1' }))
    fireEvent.change(
      screen.getByPlaceholderText(
        'Technique, pain, or anything worth remembering',
      ),
      { target: { value: 'Shoulder felt good' } },
    )
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        exercises: [
          expect.objectContaining({
            sets: [expect.objectContaining({ note: 'Shoulder felt good' })],
          }),
        ],
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '+ Add exercise' }))
    fireEvent.change(screen.getByPlaceholderText('e.g. Incline bench press'), {
      target: { value: 'Dips' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        exercises: expect.arrayContaining([
          expect.objectContaining({ name: 'Dips' }),
        ]),
      }),
    )
  })

  it('shows a compact feeling legend once per exercise for touch layouts', () => {
    render(
      <SettingsProvider>
        <LiveSession session={session} onUpdate={vi.fn()} onFinish={vi.fn()} />
      </SettingsProvider>,
    )

    expect(screen.getByText('Feel: Low → High')).toBeInTheDocument()
  })

  it('gives note and remove controls distinct accessible names', () => {
    render(
      <SettingsProvider>
        <LiveSession session={session} onUpdate={vi.fn()} onFinish={vi.fn()} />
      </SettingsProvider>,
    )

    expect(
      screen.getByRole('button', { name: 'Add note for set 1' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove set 1' }),
    ).toBeInTheDocument()
    expect(
      screen
        .getByLabelText('Bench press set 1 weight')
        .closest('.fit-live-cell'),
    ).not.toHaveTextContent('kg')
    expect(
      screen.getByLabelText('Bench press set 1 reps').closest('.fit-live-cell'),
    ).not.toHaveTextContent('reps')
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('reveals set removal with a left swipe before deleting the set', () => {
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.hasPointerCapture = vi.fn(() => true)
    Element.prototype.releasePointerCapture = vi.fn()
    const onUpdate = vi.fn()
    const { container } = render(
      <SettingsProvider>
        <LiveSession session={session} onUpdate={onUpdate} onFinish={vi.fn()} />
      </SettingsProvider>,
    )
    const row = container.querySelector<HTMLElement>(
      '.fit-live-row-shell > .fit-live-row',
    )!

    fireEvent.pointerDown(row, {
      clientX: 120,
      clientY: 20,
      pointerId: 1,
      pointerType: 'touch',
    })
    fireEvent.pointerMove(row, {
      clientX: 60,
      clientY: 22,
      pointerId: 1,
      pointerType: 'touch',
    })
    fireEvent.pointerUp(row, {
      clientX: 60,
      clientY: 22,
      pointerId: 1,
      pointerType: 'touch',
    })

    expect(row).toHaveStyle({ transform: 'translateX(-48px)' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove set 1' }))
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        exercises: [expect.objectContaining({ sets: [] })],
      }),
    )
  })
})
