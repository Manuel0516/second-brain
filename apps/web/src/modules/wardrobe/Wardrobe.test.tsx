import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Wardrobe } from './Wardrobe'
import { fetchWardrobeCalendars, wardrobeRequest, type Garment } from './api'

vi.mock('./api', () => ({
  wardrobeRequest: vi.fn(),
  fetchWardrobeCalendars: vi.fn(),
}))
vi.mock('../../components/AppRail', () => ({
  AppRail: () => <nav aria-label="App navigation" />,
}))
vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      timezone: 'Europe/Stockholm',
      default_calendar_id: 'calendar-1',
    },
  }),
}))
const shirt: Garment = {
  id: 'shirt-1',
  name: 'Linen shirt',
  category: 'Tops',
  brand: 'Brand',
  size: 'M',
  color: 'Blue',
  notes: '',
  archived: false,
  photo_file_id: 'photo-1',
}

beforeEach(() => {
  vi.mocked(wardrobeRequest).mockImplementation(
    async (path, method = 'GET') => {
      if (method !== 'GET') return {}
      if (path === 'preferences')
        return { categories: ['Tops', 'Shoes'], default_calendar_id: null }
      if (path === 'garments')
        return [
          shirt,
          { ...shirt, id: 'coat-1', name: 'Old coat', archived: true },
        ]
      if (path === 'outfits')
        return [
          {
            id: 'outfit-1',
            name: 'Work look',
            notes: '',
            garment_ids: [shirt.id],
          },
        ]
      return []
    },
  )
  vi.mocked(fetchWardrobeCalendars).mockResolvedValue([
    {
      id: 'calendar-1',
      name: 'Personal',
      source: 'local',
      effective_role: 'owner',
    },
  ])
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function open(path = '/wardrobe') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Wardrobe />
    </MemoryRouter>,
  )
}

describe('Wardrobe', () => {
  it('filters archived clothes and displays uploaded photos', async () => {
    open()
    expect(await screen.findByAltText('Linen shirt')).toHaveAttribute(
      'src',
      '/api/files/photo-1',
    )
    expect(screen.queryByText('Old coat')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Archived'))
    expect(screen.getByText('Old coat')).toBeVisible()
    expect(screen.queryByText('Linen shirt')).not.toBeInTheDocument()
  })

  it('saves garment details through the native API', async () => {
    open()
    fireEvent.click(
      await screen.findByRole('button', { name: '+ Add garment' }),
    )
    fireEvent.change(screen.getByLabelText('name'), {
      target: { value: 'Running shoes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Category' }))
    fireEvent.click(screen.getByRole('option', { name: 'Shoes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save garment' }))
    await waitFor(() =>
      expect(wardrobeRequest).toHaveBeenCalledWith(
        'garments',
        'POST',
        expect.objectContaining({ name: 'Running shoes', category: 'Shoes' }),
      ),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Save garment' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('schedules a saved outfit in the selected local calendar and timezone', async () => {
    open('/wardrobe?tab=schedule')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Outfit' })).toHaveTextContent(
        'Work look',
      ),
    )
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-11-07' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' }))
    await waitFor(() =>
      expect(wardrobeRequest).toHaveBeenCalledWith('schedule', 'POST', {
        outfit_id: 'outfit-1',
        calendar_id: 'calendar-1',
        date: '2026-11-07',
        timezone: 'Europe/Stockholm',
      }),
    )
  })

  it('keeps the draft and shows an API failure when saving fails', async () => {
    open()
    fireEvent.click(
      await screen.findByRole('button', { name: '+ Add garment' }),
    )
    fireEvent.change(screen.getByLabelText('name'), {
      target: { value: 'Shirt' },
    })
    vi.mocked(wardrobeRequest).mockRejectedValueOnce(
      new Error('Upload unavailable'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save garment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Upload unavailable',
    )
    expect(screen.getByLabelText('name')).toHaveValue('Shirt')
  })
})

it('filters categories and returns to all clothes', async () => {
  open()
  await screen.findByAltText('Linen shirt')
  fireEvent.click(screen.getByRole('button', { name: 'Category: Shoes' }))
  expect(screen.queryByText('Linen shirt')).not.toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'No matching garments' }),
  ).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /All clothes/ }))
  expect(screen.getByText('Linen shirt')).toBeVisible()
})

it('creates a custom category through the styled menu', async () => {
  open()
  fireEvent.click(await screen.findByRole('button', { name: '+ Add garment' }))
  fireEvent.change(screen.getByLabelText('name'), {
    target: { value: 'Swim shorts' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Category' }))
  fireEvent.click(screen.getByRole('option', { name: '+ New category…' }))
  fireEvent.change(screen.getByLabelText('Custom category'), {
    target: { value: 'Swimwear' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save garment' }))
  await waitFor(() =>
    expect(wardrobeRequest).toHaveBeenCalledWith(
      'garments',
      'POST',
      expect.objectContaining({ name: 'Swim shorts', category: 'Swimwear' }),
    ),
  )
})

it('uses the wardrobe default calendar ahead of the app default', async () => {
  const original = vi.mocked(wardrobeRequest).getMockImplementation()!
  vi.mocked(wardrobeRequest).mockImplementation((path, method, data) =>
    path === 'preferences'
      ? Promise.resolve({
          categories: ['Tops'],
          default_calendar_id: 'wardrobe-calendar',
        })
      : original(path, method, data),
  )
  vi.mocked(fetchWardrobeCalendars).mockResolvedValue([
    {
      id: 'calendar-1',
      name: 'Personal',
      source: 'local',
      effective_role: 'owner',
    },
    {
      id: 'wardrobe-calendar',
      name: 'Outfit plans',
      source: 'local',
      effective_role: 'owner',
    },
  ])
  open('/wardrobe?tab=schedule')
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Calendar' })).toHaveTextContent(
      'Outfit plans',
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' }))
  await waitFor(() =>
    expect(wardrobeRequest).toHaveBeenCalledWith(
      'schedule',
      'POST',
      expect.objectContaining({ calendar_id: 'wardrobe-calendar' }),
    ),
  )
})
