import { apiCall } from '../../lib/api'

// ── Types ──────────────────────────────────────────────────────────────

export interface Exercise {
  id: string
  name: string
  category: 'strength' | 'cardio' | 'mobility'
  unit: 'reps' | 'kg' | 'km' | 'min' | 'reps+weight'
  created_at: string
  updated_at: string
}

export interface WorkoutSession {
  id: string
  user_id: string
  date: string
  type: string
  notes: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SetEntry {
  id: string
  workout_session_id: string
  exercise_id: string
  set_number: number
  reps: number
  weight: number | null
  rpe: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface BodyMetric {
  id: string
  user_id: string
  date: string
  weight: number | null
  body_fat_pct: number | null
  measurements: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Goal {
  id: string
  target_type: 'exercise_max' | 'exercise_reps' | 'body_metric'
  exercise_id: string | null
  metric_key: string | null
  target_value: number
  target_date: string | null
  current_value: number | null
  created_at: string
  updated_at: string
}

export interface CalendarEvent {
  id: string
  title: string
  start_at: string
  end_at: string
  created_by: string
}

export async function fetchEvents(
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({ from, to })
  const res = await apiCall(`/api/events?${params.toString()}`)
  if (!res.ok) return [] // ponytail: fail gracefully, show empty
  return res.json()
}

// ── Exercises ───────────────────────────────────────────────────────────

export async function fetchExercises(): Promise<Exercise[]> {
  const res = await apiCall('/api/fitness/exercises')
  if (!res.ok) throw new Error('Failed to fetch exercises')
  return res.json()
}

export async function createExercise(data: {
  name: string
  category?: string
  unit?: string
}): Promise<Exercise> {
  const res = await apiCall('/api/fitness/exercises', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create exercise')
  return res.json()
}

// ── Sessions ────────────────────────────────────────────────────────────

export async function fetchSessions(
  fromDate?: string,
  toDate?: string,
): Promise<WorkoutSession[]> {
  const params = new URLSearchParams()
  if (fromDate) params.set('from_date', fromDate)
  if (toDate) params.set('to_date', toDate)
  const qs = params.toString()
  const res = await apiCall(`/api/fitness/sessions${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error('Failed to fetch sessions')
  return res.json()
}

export async function createSession(data: {
  date: string
  type: string
  notes?: Record<string, unknown>
}): Promise<WorkoutSession> {
  const res = await apiCall('/api/fitness/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to create session')
  }
  return res.json()
}

export async function updateSession(
  sessionId: string,
  data: { date?: string; type?: string; notes?: Record<string, unknown> },
): Promise<WorkoutSession> {
  const res = await apiCall(`/api/fitness/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update session')
  return res.json()
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await apiCall(`/api/fitness/sessions/${sessionId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete session')
}

// ── Set Entries ─────────────────────────────────────────────────────────

export async function fetchSetEntries(sessionId: string): Promise<SetEntry[]> {
  const res = await apiCall(`/api/fitness/sessions/${sessionId}/sets`)
  if (!res.ok) throw new Error('Failed to fetch set entries')
  return res.json()
}

export async function createSetEntry(
  sessionId: string,
  data: {
    exercise_id: string
    set_number: number
    reps: number
    weight?: number | null
    rpe?: number | null
    notes?: string | null
  },
): Promise<SetEntry> {
  const res = await apiCall(`/api/fitness/sessions/${sessionId}/sets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to create set entry')
  }
  return res.json()
}

export async function deleteSetEntry(
  sessionId: string,
  setId: string,
): Promise<void> {
  const res = await apiCall(
    `/api/fitness/sessions/${sessionId}/sets/${setId}`,
    {
      method: 'DELETE',
    },
  )
  if (!res.ok) throw new Error('Failed to delete set entry')
}

export async function updateSetEntry(
  sessionId: string,
  setId: string,
  data: {
    reps?: number
    weight?: number | null
    rpe?: number | null
    notes?: string | null
    exercise_id?: string
    set_number?: number
  },
): Promise<SetEntry> {
  const res = await apiCall(
    `/api/fitness/sessions/${sessionId}/sets/${setId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  )
  if (!res.ok) throw new Error('Failed to update set entry')
  return res.json()
}

// ── Body Metrics ────────────────────────────────────────────────────────

export async function fetchBodyMetrics(
  fromDate?: string,
  toDate?: string,
): Promise<BodyMetric[]> {
  const params = new URLSearchParams()
  if (fromDate) params.set('from_date', fromDate)
  if (toDate) params.set('to_date', toDate)
  const qs = params.toString()
  const res = await apiCall(`/api/fitness/body-metrics${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error('Failed to fetch body metrics')
  return res.json()
}

export async function createBodyMetric(data: {
  date: string
  weight?: number | null
  body_fat_pct?: number | null
  measurements?: Record<string, unknown>
}): Promise<BodyMetric> {
  const res = await apiCall('/api/fitness/body-metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to create body metric')
  }
  return res.json()
}

export async function deleteBodyMetric(metricId: string): Promise<void> {
  const res = await apiCall(`/api/fitness/body-metrics/${metricId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete body metric')
}

// ── Stats ──────────────────────────────────────────────────────────────

export interface ExerciseStats {
  exercise: { id: string; name: string; category: string }
  personal_records: { reps: number; max_weight: number; date: string }[]
  estimated_1rm: number | null
  volume_by_week: {
    week: string
    total_volume: number
    session_count: number
  }[]
  progression: { date: string; max_weight: number; max_reps: number }[]
}

export interface BodyWeightStats {
  metrics: {
    date: string
    weight: number | null
    body_fat_pct: number | null
  }[]
  trend: number | null
}

export async function fetchExerciseStats(
  exerciseId: string,
): Promise<ExerciseStats> {
  const res = await apiCall(`/api/fitness/stats/exercise/${exerciseId}`)
  if (!res.ok) throw new Error('Failed to fetch exercise stats')
  return res.json()
}

export async function fetchBodyWeightStats(): Promise<BodyWeightStats> {
  const res = await apiCall('/api/fitness/stats/body-weight')
  if (!res.ok) throw new Error('Failed to fetch body weight stats')
  return res.json()
}

// ── Goals ─────────────────────────────────────────────────────────────

export async function fetchGoals(): Promise<Goal[]> {
  const res = await apiCall('/api/fitness/goals')
  if (!res.ok) return []
  return res.json()
}

export async function createGoal(data: {
  target_type: string
  exercise_id?: string | null
  metric_key?: string | null
  target_value: number
  target_date?: string | null
}): Promise<Goal> {
  const res = await apiCall('/api/fitness/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create goal')
  return res.json()
}

export async function deleteGoal(goalId: string): Promise<void> {
  const res = await apiCall(`/api/fitness/goals/${goalId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete goal')
}
