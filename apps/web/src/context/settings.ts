import { createContext, useContext } from 'react'

export interface UserSettings {
  theme: 'system' | 'light' | 'dark'
  visual_style: 'neon' | 'monochrome'
  timezone: string
  week_start: 'monday' | 'sunday'
  default_view: 'day' | 'week' | 'month'
  time_format: '24h' | '12h'
  favorite_emojis: string[]
  favorite_colors: string[]
  default_event_minutes: number
  default_calendar_id: string | null
  default_reminder_minutes: number | null
  show_weekends: boolean
  dim_past_events: boolean
  notes_bullet_style: 'disc' | 'circle' | 'square' | 'dash'
  notes_numbered_style:
    | 'decimal'
    | 'lower-alpha'
    | 'upper-alpha'
    | 'lower-roman'
    | 'upper-roman'
  favorite_text_colors: string[]
  favorite_highlight_colors: string[]
  favorite_block_colors: string[]
  favorite_covers: string[]
  fitness_rest_seconds: number
  fitness_auto_start_rest: boolean
  fitness_weight_unit: 'kg' | 'lb'
  fitness_weekly_session_target: number | null
  fitness_stats_range_days: number
  food_daily_meal_goal: number
  food_calorie_target: number | null
  food_protein_target_g: number | null
  food_carbs_target_g: number | null
  food_fat_target_g: number | null
  food_water_target_units: number | null
  food_veg_target_units: number | null
  food_fruit_target_units: number | null
  food_stats_range_days: number
}

export interface SettingsContextType {
  settings: UserSettings
  loading: boolean
  patch: (partial: Partial<UserSettings>) => Promise<void>
}

export const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
)

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
