export interface CalendarData {
  id: string
  name: string
  color: string
  is_visible: boolean
  source: string
}

export interface CalendarEvent {
  id: string
  calendar_id: string
  title: string
  description?: string
  location?: string
  link?: string
  start_at: string
  end_at: string
  all_day: boolean
  timezone: string
  color_override?: string
  reminder_minutes?: number
  rrule?: 'DAILY' | 'WEEKLY' | 'MONTHLY'
}
