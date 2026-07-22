import { apiCall } from '../../lib/api'

// ── Types ──────────────────────────────────────────────────────────────

export interface MealLog {
  id: string
  user_id: string
  date: string
  meal_type: string
  slot_index: number
  status: string
  scheduled_at: string | null
  logged_at: string | null
  photo_file_ids: string[]
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  water_units: number
  veg_units: number
  fruit_units: number
  notes: string | null
  ai_items: Record<string, unknown>[] | null
  created_at: string
  updated_at: string
}

export interface FoodDailyExtras {
  id: string
  user_id: string
  date: string
  water_units: number
  veg_units: number
  fruit_units: number
  created_at: string
  updated_at: string
}

export interface DaySummary {
  date: string
  calories_consumed: number
  protein_consumed: number
  carbs_consumed: number
  fat_consumed: number
  water_units: number
  veg_units: number
  fruit_units: number
  extras_water_units: number
  extras_veg_units: number
  extras_fruit_units: number
  meals_planned: number
  meals_logged: number
  meals: MealLog[]
}

export interface FoodSummary {
  days: DaySummary[]
}

export interface FileUpload {
  id: string
  url: string
  name: string
  content_type: string
  size: number
  created_at: string
}

// ── Meal Logs ──────────────────────────────────────────────────────────

export async function fetchMealLogs(
  fromDate?: string,
  toDate?: string,
): Promise<MealLog[]> {
  const params = new URLSearchParams()
  if (fromDate) params.set('from_date', fromDate)
  if (toDate) params.set('to_date', toDate)
  const qs = params.toString()
  const res = await apiCall(`/api/food/logs${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error('Failed to fetch meal logs')
  return res.json()
}

export async function createMealLog(data: {
  date: string
  meal_type?: string
  slot_index?: number
  status?: string
  scheduled_at?: string | null
  notes?: string | null
  photo_file_ids?: string[]
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  water_units?: number
  veg_units?: number
  fruit_units?: number
  ai_items?: Record<string, unknown>[] | null
}): Promise<MealLog> {
  const res = await apiCall('/api/food/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to create meal log')
  }
  return res.json()
}

export async function updateMealLog(
  id: string,
  data: {
    date?: string
    meal_type?: string
    slot_index?: number
    status?: string
    scheduled_at?: string | null
    notes?: string | null
    photo_file_ids?: string[]
    calories?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fat_g?: number | null
    water_units?: number
    veg_units?: number
    fruit_units?: number
    ai_items?: Record<string, unknown>[] | null
  },
): Promise<MealLog> {
  const res = await apiCall(`/api/food/logs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update meal log')
  return res.json()
}

export async function deleteMealLog(id: string): Promise<void> {
  const res = await apiCall(`/api/food/logs/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete meal log')
}

export async function analyzeMealLog(id: string): Promise<MealLog> {
  const res = await apiCall(`/api/food/logs/${id}/analyze`, {
    method: 'POST',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to analyze meal photo')
  }
  return res.json()
}

// ── Summary ────────────────────────────────────────────────────────────

export async function fetchSummary(
  fromDate: string,
  toDate: string,
): Promise<FoodSummary> {
  const params = new URLSearchParams({ from_date: fromDate, to_date: toDate })
  const res = await apiCall(`/api/food/summary?${params.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch food summary')
  return res.json()
}

// ── Daily Extras ───────────────────────────────────────────────────────

export async function upsertExtras(
  date: string,
  data: {
    water_units?: number
    veg_units?: number
    fruit_units?: number
  },
): Promise<FoodDailyExtras> {
  const res = await apiCall('/api/food/extras', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, ...data }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to update daily extras')
  }
  return res.json()
}

// ── File Upload ────────────────────────────────────────────────────────

export async function uploadFile(file: File): Promise<FileUpload> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiCall('/api/files', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to upload file')
  }
  return res.json()
}
