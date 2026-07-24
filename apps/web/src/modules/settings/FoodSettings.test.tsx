import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { FoodSettings } from './FoodSettings'

const patch = vi.fn()

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      food_daily_meal_goal: 5,
      food_calorie_target: 2000,
      food_protein_target_g: 150,
      food_carbs_target_g: 200,
      food_fat_target_g: 70,
      food_water_target_units: 8,
      food_veg_target_units: 3,
      food_fruit_target_units: 2,
      food_stats_range_days: 90,
    },
    patch: (partial: unknown) => patch(partial),
  }),
}))

test('groups targets into Macros and Daily units with unit suffixes', () => {
  render(<FoodSettings />)
  expect(screen.getByText('Macros')).toBeInTheDocument()
  expect(screen.getByText('Daily units')).toBeInTheDocument()
  expect(screen.getByText('kcal')).toBeInTheDocument()
  expect(screen.getByText('meals')).toBeInTheDocument()
  expect(screen.getAllByText('g')).toHaveLength(3)
  expect(screen.getAllByText('units')).toHaveLength(3)
})

test('committing a changed target sends one patch with only that field', () => {
  render(<FoodSettings />)
  const calories = screen.getByLabelText(/^Calories/)
  fireEvent.change(calories, { target: { value: '2200' } })
  fireEvent.blur(calories)
  expect(patch).toHaveBeenCalledTimes(1)
  expect(patch).toHaveBeenCalledWith({ food_calorie_target: 2200 })
})

test('clearing a nullable target commits null', () => {
  render(<FoodSettings />)
  const protein = screen.getByLabelText(/^Protein/)
  fireEvent.change(protein, { target: { value: '' } })
  fireEvent.blur(protein)
  expect(patch).toHaveBeenCalledWith({ food_protein_target_g: null })
})
