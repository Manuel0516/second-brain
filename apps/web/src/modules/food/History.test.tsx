import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { History } from './History'
import * as foodApi from './api'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return { ...actual, fetchMealLogs: vi.fn(), deleteMealLog: vi.fn() }
})

vi.mock('../fitness/BodyMetricLog', () => ({ BodyMetricLog: () => null }))

afterEach(() => vi.clearAllMocks())

describe('Food history photos', () => {
  it('uses the first photo as the cover and shows the additional count', async () => {
    vi.mocked(foodApi.fetchMealLogs).mockResolvedValue([
      {
        id: 'meal-1',
        user_id: 'user-1',
        date: '2026-07-20T12:00:00Z',
        meal_type: 'dinner',
        slot_index: 0,
        status: 'logged',
        scheduled_at: null,
        logged_at: '2026-07-20T12:00:00Z',
        photo_file_ids: ['photo-1', 'photo-2', 'photo-3'],
        calories: 800,
        protein_g: 50,
        carbs_g: 60,
        fat_g: 30,
        water_units: 0,
        veg_units: 1,
        fruit_units: 0,
        notes: null,
        ai_items: null,
        created_at: '',
        updated_at: '',
      },
    ])

    render(<History onSaved={vi.fn()} onEditMeal={vi.fn()} refreshKey={0} />)

    expect(await screen.findByAltText('Meal')).toHaveAttribute(
      'src',
      '/api/files/photo-1',
    )
    expect(screen.getByText('+2')).toBeVisible()
  })
})
