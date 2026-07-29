import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { FitnessSettings } from './FitnessSettings'

const patch = vi.fn()

vi.mock('../../context/settings', () => ({
  useSettings: () => ({
    settings: {
      fitness_rest_seconds: 90,
      fitness_auto_start_rest: true,
      fitness_weight_unit: 'kg',
      fitness_weekly_session_target: 4,
      fitness_stats_range_days: 90,
    },
    patch: (partial: unknown) => patch(partial),
  }),
}))

test('commits rest duration once on blur with a seconds suffix', () => {
  render(<FitnessSettings />)
  expect(screen.getByText('seconds')).toBeInTheDocument()
  const rest = screen.getByLabelText(/^Rest duration/)
  fireEvent.change(rest, { target: { value: '120' } })
  fireEvent.blur(rest)
  expect(patch).toHaveBeenCalledTimes(1)
  expect(patch).toHaveBeenCalledWith({ fitness_rest_seconds: 120 })
})

test('clearing the nullable weekly target commits null', () => {
  render(<FitnessSettings />)
  expect(screen.getByText('sessions')).toBeInTheDocument()
  const weekly = screen.getByLabelText(/^Sessions per week/)
  fireEvent.change(weekly, { target: { value: '' } })
  fireEvent.blur(weekly)
  expect(patch).toHaveBeenCalledWith({ fitness_weekly_session_target: null })
})

test('unit choice remains a Segmented radiogroup', () => {
  render(<FitnessSettings />)
  const kg = screen.getByRole('radio', { name: 'kg' })
  expect(kg).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(screen.getByRole('radio', { name: 'lb' }))
  expect(patch).toHaveBeenCalledWith({ fitness_weight_unit: 'lb' })
})
