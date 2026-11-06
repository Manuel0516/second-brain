import { apiCall, apiErrorMessage } from '../../lib/api'

export interface Garment {
  id: string
  name: string
  category: string
  brand: string
  size: string
  color: string
  notes: string
  archived: boolean
  photo_file_id: string | null
}
export interface Outfit {
  id: string
  name: string
  notes: string
  garment_ids: string[]
}
export interface Schedule {
  event_id: string
  outfit_id: string
  title: string
  start_at: string
  timezone: string
}
export interface WardrobeCalendar {
  id: string
  name: string
  source: string
  effective_role: 'owner' | 'editor' | 'viewer'
}

export async function wardrobeRequest<T>(
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  const response = await apiCall(`/api/wardrobe/${path}`, {
    method,
    ...(data === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
  })
  if (!response.ok)
    throw new Error(
      await apiErrorMessage(
        response,
        'Could not save wardrobe changes. Please try again.',
      ),
    )
  return response.status === 204 ? (undefined as T) : response.json()
}

export async function fetchWardrobeCalendars(): Promise<WardrobeCalendar[]> {
  const response = await apiCall('/api/calendars')
  if (!response.ok) throw new Error('Could not load calendars')
  return response.json()
}

export interface WardrobePreferences {
  ai_outfits_enabled: boolean
  weather_planning_enabled: boolean
  weather_city: string
  categories: string[]
  default_calendar_id: string | null
}

export interface OutfitSuggestions {
  calendar_events?: {
    title: string
    start_at: string
    end_at: string
    all_day: boolean
    location: string | null
    description: string | null
  }[]
  outfits: Omit<Outfit, 'id'>[]
  date: string
  weather: {
    location: string
    date: string
    min_c: number
    max_c: number
    rain_probability: number
    wind_kmh: number
    weather_code: number
  } | null
}
