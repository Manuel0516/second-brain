import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { OutfitAssistant } from './OutfitAssistant'
import { wardrobeRequest, type Garment } from './api'
vi.mock('./api', () => ({ wardrobeRequest: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const garment: Garment = {
  id: 'garment-1',
  name: 'Rain coat',
  category: 'Outerwear',
  brand: '',
  size: 'M',
  color: 'Blue',
  notes: '',
  archived: false,
  photo_file_id: null,
}

it('reviews weather proposals and retries scheduling without duplicating a saved outfit', async () => {
  let attempts = 0
  vi.mocked(wardrobeRequest).mockImplementation(async (path) => {
    if (path === 'ai/suggestions')
      return {
        date: '2026-11-07',
        weather: {
          location: 'Lund, Sweden',
          date: '2026-11-07',
          min_c: 3,
          max_c: 8,
          rain_probability: 70,
          wind_kmh: 20,
          weather_code: 61,
        },
        outfits: [
          {
            name: 'Rainy day',
            notes: 'A layer for rain',
            garment_ids: [garment.id],
          },
        ],
      }
    if (path === 'outfits') return { id: 'outfit-1' }
    if (path === 'schedule') {
      attempts += 1
      if (attempts === 1) throw new Error('Calendar unavailable')
    }
    return undefined
  })
  const saved = vi.fn().mockResolvedValue(undefined)
  render(
    <MemoryRouter>
      <OutfitAssistant
        mode="weather"
        date="2026-11-07"
        onDateChange={vi.fn()}
        calendarId="calendar-1"
        timezone="Europe/Stockholm"
        garments={[garment]}
        onSaved={saved}
      />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Suggest for weather' }))
  expect(
    await screen.findByRole('heading', { name: 'Rainy day' }),
  ).toBeVisible()
  expect(screen.getByText(/Lund, Sweden/)).toBeVisible()
  expect(
    vi
      .mocked(wardrobeRequest)
      .mock.calls.filter((call) => call[0] === 'outfits'),
  ).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Save and schedule' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Calendar unavailable',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save and schedule' }))
  await screen.findByRole('button', { name: 'Scheduled' })
  expect(
    vi
      .mocked(wardrobeRequest)
      .mock.calls.filter((call) => call[0] === 'outfits'),
  ).toHaveLength(1)
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
})

it('shows actionable provider failures without creating outfits', async () => {
  vi.mocked(wardrobeRequest).mockRejectedValue(
    new Error('Configure AI provider first'),
  )
  render(
    <MemoryRouter>
      <OutfitAssistant
        mode="outfits"
        date="2026-11-07"
        onDateChange={vi.fn()}
        calendarId=""
        timezone="Europe/Stockholm"
        garments={[garment]}
        onSaved={vi.fn().mockResolvedValue(undefined)}
      />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Suggest outfits' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Configure AI provider first',
  )
  expect(wardrobeRequest).toHaveBeenCalledTimes(1)
})
