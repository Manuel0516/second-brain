import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { SwipeReveal } from './SwipeReveal'

test('shows an explicit delete button without a desktop gesture', () => {
  const onDelete = vi.fn()
  render(
    <SwipeReveal
      className="row"
      deleteLabel="Delete planned workout"
      onDelete={onDelete}
    >
      Workout
    </SwipeReveal>,
  )

  const deleteButton = screen.getByRole('button', {
    name: 'Delete planned workout',
  })
  fireEvent.click(deleteButton)
  expect(onDelete).toHaveBeenCalledOnce()
})

test('does not turn a desktop mouse drag into a swipe', () => {
  render(
    <SwipeReveal
      className="row"
      deleteLabel="Delete planned workout"
      onDelete={vi.fn()}
    >
      Workout
    </SwipeReveal>,
  )

  const row = screen.getByText('Workout')
  fireEvent.pointerDown(row, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 80,
    clientY: 20,
  })
  fireEvent.pointerMove(row, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 20,
  })

  expect(row).toHaveStyle('transform: translateX(0px)')
})

test('keeps touch deletion behind a swipe and explicit click', () => {
  const onDelete = vi.fn()
  render(
    <SwipeReveal
      className="row"
      deleteLabel="Delete planned meal"
      onDelete={onDelete}
    >
      Meal
    </SwipeReveal>,
  )

  const row = screen.getByText('Meal')
  Object.assign(row, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  })
  fireEvent.pointerDown(row, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 80,
    clientY: 20,
  })
  fireEvent.pointerMove(row, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 20,
    clientY: 20,
  })
  fireEvent.pointerUp(row, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 20,
    clientY: 20,
  })

  expect(row).toHaveStyle('transform: translateX(-48px)')
  expect(onDelete).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Delete planned meal' }))
  expect(onDelete).toHaveBeenCalledOnce()
})
