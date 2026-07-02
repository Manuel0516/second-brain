export interface CalendarData {
  id: string
  name: string
  color: string
  is_visible: boolean
  source: string
}

export interface EventConnections {
  notes?: {
    title: string
    folder_id?: string | null
    link_ids?: string[]
  } | null
  finance?: {
    type: 'income' | 'expense'
    amount: number
    currency: string
    category: string
    counterparty?: string | null
    tax_relevant: boolean
  } | null
  fitness?: { workout_type: string; notes?: string | null } | null
  food?: {
    meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
    name: string
    quantity: number
    unit: string
    calories?: number | null
    protein?: number | null
    carbs?: number | null
    fat?: number | null
  } | null
}

export interface CalendarEvent {
  id: string
  calendar_id: string
  title: string
  icon?: string
  description?: string
  location?: string
  link?: string
  start_at: string
  end_at: string
  all_day: boolean
  timezone: string
  color_override?: string
  reminder_minutes?: number
  rrule?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  recurrence_interval?: number
  recurrence_byday?: string[]
  recurrence_count?: number | null
  recurrence_until?: string | null
  connections?: EventConnections
}

export const occurrenceKey = (event: Pick<CalendarEvent, 'id' | 'start_at'>) =>
  `${event.id}:${event.start_at}`
