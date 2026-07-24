import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { App } from './App'
import { AuthProvider } from './context/AuthContext'

let localStorageStore: Record<string, string> = {}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.pushState({}, '', '/')
  localStorageStore = {}
})

beforeEach(() => {
  // jsdom doesn't implement matchMedia, and this test run has no
  // --localstorage-file backing for window.localStorage — both are read by
  // components mounted under authenticated routes (SettingsLayout, Calendar).
  // Re-stubbed every test since the previous test's restoreAllMocks() would
  // otherwise reset these vi.fn()-backed stubs to a no-op.
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => localStorageStore[key] ?? null,
    setItem: (key: string, value: string) => {
      localStorageStore[key] = value
    },
    removeItem: (key: string) => {
      delete localStorageStore[key]
    },
    clear: () => {
      localStorageStore = {}
    },
  })

  // Mock the auth API call to simulate unauthenticated state
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/api/auth/me')) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
        }),
      )
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
  })
})

test('renders the login page when not authenticated', async () => {
  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  )

  await waitFor(() => {
    expect(
      screen.getByRole('heading', { name: 'Second Brain' }),
    ).toBeInTheDocument()
  })
})

const authenticatedUser = {
  id: 'user-1',
  username: 'manuel',
  email: 'manuel@example.com',
  is_admin: false,
  is_test_account: false,
  totp_enabled: false,
}

const settingsResponse = {
  theme: 'dark',
  visual_style: 'neon',
  timezone: 'UTC',
  week_start: 'monday',
  default_view: 'week',
  time_format: '24h',
  favorite_emojis: [],
  favorite_colors: [],
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

/** Mocks `/api/auth/me` and `/api/settings`, counting settings fetches. */
function mockAuthenticatedFetch({
  initiallyAuthenticated,
}: {
  initiallyAuthenticated: boolean
}) {
  let authenticated = initiallyAuthenticated
  let settingsFetchCount = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/api/auth/me')) {
      return Promise.resolve(
        authenticated
          ? new Response(JSON.stringify(authenticatedUser), { status: 200 })
          : new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
            }),
      )
    }
    if (url.includes('/api/auth/logout')) {
      authenticated = false
      return Promise.resolve(new Response(null, { status: 200 }))
    }
    if (url === '/api/settings') {
      settingsFetchCount += 1
      return Promise.resolve(
        new Response(JSON.stringify(settingsResponse), { status: 200 }),
      )
    }
    if (url.includes('/api/auth/login')) {
      authenticated = true
      return Promise.resolve(
        new Response(JSON.stringify(authenticatedUser), {
          status: 200,
        }),
      )
    }
    // Generic fallback for whatever a lazy-loaded route fetches at mount
    // (calendars, events, exercises, ...) — an empty list keeps list-shaped
    // consumers (`.find`/`.map`) from crashing without asserting on them.
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
  })
  return { getSettingsFetchCount: () => settingsFetchCount }
}

test('authenticated entry fetches settings exactly once', async () => {
  window.history.pushState({}, '', '/settings/general')
  const { getSettingsFetchCount } = mockAuthenticatedFetch({
    initiallyAuthenticated: true,
  })

  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  )

  await screen.findByRole('heading', { name: 'General' })
  await waitFor(() => expect(getSettingsFetchCount()).toBe(1))
})

test('login does not fetch authenticated settings', async () => {
  const { getSettingsFetchCount } = mockAuthenticatedFetch({
    initiallyAuthenticated: false,
  })

  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  )

  await screen.findByRole('heading', { name: 'Second Brain' })
  expect(getSettingsFetchCount()).toBe(0)
})

test('navigating between protected routes reuses the same settings context instance', async () => {
  // /settings/general and /food are siblings under the single Route that
  // wraps <SettingsProvider><Outlet /></SettingsProvider> in App.tsx — this
  // pair exercises that shared wrapping without needing to mock every
  // module's own data-fetching surface.
  window.history.pushState({}, '', '/settings/general')
  const { getSettingsFetchCount } = mockAuthenticatedFetch({
    initiallyAuthenticated: true,
  })

  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  )

  await screen.findByRole('heading', { name: 'General' })
  await waitFor(() => expect(getSettingsFetchCount()).toBe(1))
  // The mocked backend value (dark) proves the context wasn't reset to the
  // frontend default ('system') by an intermediate unmount/remount.
  expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute(
    'aria-checked',
    'true',
  )

  window.history.pushState({}, '', '/settings/food')
  window.dispatchEvent(new PopStateEvent('popstate'))

  await screen.findByRole('heading', { name: 'Food' })
  expect(getSettingsFetchCount()).toBe(1)
})

test('logout unmounts settings state', async () => {
  window.history.pushState({}, '', '/settings/general')
  const { getSettingsFetchCount } = mockAuthenticatedFetch({
    initiallyAuthenticated: true,
  })

  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  )

  await screen.findByRole('heading', { name: 'General' })
  await waitFor(() => expect(getSettingsFetchCount()).toBe(1))

  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

  await screen.findByRole('heading', { name: 'Second Brain' })
  // Unauthenticated now — no further settings fetch was attempted.
  expect(getSettingsFetchCount()).toBe(1)
})

test('a later login fetches a fresh settings copy', async () => {
  const { getSettingsFetchCount } = mockAuthenticatedFetch({
    initiallyAuthenticated: false,
  })

  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  )

  await screen.findByRole('heading', { name: 'Second Brain' })
  expect(getSettingsFetchCount()).toBe(0)

  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'manuel@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'hunter22' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  // Login navigates to /calendar ~450ms after a successful submit, which is
  // what actually mounts the (single) SettingsProvider and triggers the fetch.
  await waitFor(() => expect(getSettingsFetchCount()).toBe(1), {
    timeout: 2000,
  })
})
