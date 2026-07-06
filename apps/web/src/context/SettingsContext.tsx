import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { apiCall } from '../lib/api'

export interface UserSettings {
  theme: 'system' | 'light' | 'dark'
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
}

interface SettingsContextType {
  settings: UserSettings
  loading: boolean
  patch: (partial: Partial<UserSettings>) => Promise<void>
}

const DEFAULTS: UserSettings = {
  theme: 'system',
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
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
)

let themeTransitionTimer = 0

function applyTheme(theme: string, animate = false) {
  const root = document.documentElement
  const next = theme === 'light' ? 'light' : theme === 'dark' ? 'dark' : ''
  const current = root.dataset.theme ?? ''
  // Briefly enable a global colour transition so the swap eases instead of snapping.
  if (animate && next !== current) {
    root.classList.add('theme-transition')
    window.clearTimeout(themeTransitionTimer)
    themeTransitionTimer = window.setTimeout(
      () => root.classList.remove('theme-transition'),
      400,
    )
  }
  if (next) root.dataset.theme = next
  else delete root.dataset.theme
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
            applyTheme(data.theme)
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

    const response = await apiCall('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    })

    if (response.ok) {
      const data = (await response.json()) as UserSettings
      setSettings(data)
      applyTheme(data.theme)
    } else {
      // Revert on error — re-fetch
      const refresh = await apiCall('/api/settings')
      if (refresh.ok) {
        const data = (await refresh.json()) as UserSettings
        setSettings(data)
        applyTheme(data.theme)
      }
    }
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, loading, patch }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
