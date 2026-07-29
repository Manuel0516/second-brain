import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { apiCall } from '../lib/api'
import {
  applyBackendAppearance,
  applyTheme,
  applyVisualStyle,
} from '../lib/appearance'
import { SettingsContext, type UserSettings } from './settings'

const DEFAULTS: UserSettings = {
  theme: 'system',
  visual_style: 'neon',
  timezone: 'Europe/Stockholm',
  week_start: 'monday',
  default_view: 'week',
  time_format: '24h',
  favorite_emojis: ['📅', '💼', '☕', '🏃', '🍽️', '📝', '🎧', '🎯'],
  favorite_colors: ['#3B6FE0', '#2E9E6E', '#D6932B', '#8B5CF6', '#D9573F'],
  default_event_minutes: 60,
  default_calendar_id: null,
  default_reminder_minutes: null,
  show_weekends: true,
  dim_past_events: true,
  notes_bullet_style: 'disc',
  notes_numbered_style: 'decimal',
  favorite_text_colors: [],
  favorite_highlight_colors: [],
  favorite_block_colors: [],
  favorite_covers: [],
  fitness_rest_seconds: 90,
  fitness_auto_start_rest: true,
  fitness_weight_unit: 'kg',
  fitness_weekly_session_target: null,
  fitness_stats_range_days: 90,
  food_daily_meal_goal: 5,
  food_calorie_target: null,
  food_protein_target_g: null,
  food_carbs_target_g: null,
  food_fat_target_g: null,
  food_water_target_units: null,
  food_veg_target_units: null,
  food_fruit_target_units: null,
  food_stats_range_days: 90,
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    apiCall('/api/settings')
      .then(async (response) => {
        if (response.ok) {
          const data = (await response.json()) as UserSettings
          if (!cancelled) {
            setSettings(data)
            applyBackendAppearance(data.theme, data.visual_style)
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const patch = useCallback(async (partial: Partial<UserSettings>) => {
    // Optimistic update
    setSettings((prev) => ({ ...prev, ...partial }))

    if (partial.theme) {
      applyTheme(partial.theme, true)
    }
    if (partial.visual_style) {
      applyVisualStyle(partial.visual_style, true)
    }

    const response = await apiCall('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    })

    if (response.ok) {
      const data = (await response.json()) as UserSettings
      setSettings(data)
      applyBackendAppearance(data.theme, data.visual_style)
    } else {
      // Revert on error — re-fetch
      const refresh = await apiCall('/api/settings')
      if (refresh.ok) {
        const data = (await refresh.json()) as UserSettings
        setSettings(data)
        applyBackendAppearance(data.theme, data.visual_style)
      }
    }
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, loading, patch }}>
      {children}
    </SettingsContext.Provider>
  )
}
