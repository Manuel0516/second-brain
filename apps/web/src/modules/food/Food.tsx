import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppRail } from '../../components/AppRail'
import { SidebarShell } from '../../components/SidebarShell'
import { ProgressBar } from '../../components/ProgressBar'
import { IconButton } from '../../components/IconButton'
import { Segmented } from '../../components/Segmented'
import { BodyWeightCard } from '../../components/BodyWeightCard'
import { BodyMetricForm } from '../fitness/BodyMetricForm'
import { useSettings } from '../../context/SettingsContext'
import { toDisplayWeight } from '../fitness/units'
import {
  fetchMealLogs,
  fetchSummary,
  upsertExtras,
  type DaySummary,
  type FoodSummary,
  type MealLog,
} from './api'
import {
  fetchBodyMetrics,
  fetchBodyWeightStats,
  type BodyWeightStats,
} from '../fitness/api'
import { MealLogModal } from './MealLogModal'
import { Overview } from './Overview'
import { Stats } from './Stats'
import { History } from './History'
import './food.css'

const TABS = ['overview', 'stats', 'history'] as const
type FoodTab = (typeof TABS)[number]

// ── Inline SVG icons (declared outside component to avoid re-creation) ──

function BroccoliIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      stroke={filled ? 'var(--food-veg)' : 'var(--text-tertiary)'}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={filled ? 1 : 0.35}
    >
      <path d="M6.3 11.2h7.4c1.5 0 2.7-1.1 2.7-2.5 0-1.1-.8-2.1-1.9-2.4a2.8 2.8 0 0 0-2.8-2.1c-1 0-1.8.4-2.4 1.1a2.5 2.5 0 0 0-3.8 2c-.9.2-1.5 1-1.5 2 0 1.1.9 1.9 2 1.9h.3" />
      <path d="M10 11.2v1.8" />
      <path d="M10 13c-.4 1-1.1 1.7-2.1 2.1" />
      <path d="M10 13c.4 1 1.1 1.7 2.1 2.1" />
    </svg>
  )
}

function AppleIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      stroke={filled ? 'var(--food-fruit)' : 'var(--text-tertiary)'}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={filled ? 1 : 0.35}
    >
      <path d="M10 6.4c-1.1-1.2-3.2-1-4.4.5-1 1.3-1 3.6.1 5.2 1 1.6 2.2 2.7 3.6 2.7.6 0 1-.2 1.4-.2s.8.2 1.4.2c1.4 0 2.6-1.1 3.6-2.7 1.1-1.6 1.1-3.9.1-5.2-1.2-1.5-3.3-1.7-4.4-.5Z" />
      <path d="M10 6.4c0-1.2.7-2.2 1.8-2.7" />
      <path d="M9.3 4.7c-.7-.6-1.7-.7-2.4-.2" />
    </svg>
  )
}

function WaterDropIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 20 20"
      fill="var(--food-water)"
      stroke="var(--food-water)"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3c-3 4-5 7-5 10a5 5 0 0010 0c0-3-2-6-5-10z" />
    </svg>
  )
}

export function Food() {
  const { settings } = useSettings()
  const weightUnit = settings.fitness_weight_unit
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: FoodTab = TABS.includes(tabParam as FoodTab)
    ? (tabParam as FoodTab)
    : 'overview'

  function setTab(next: FoodTab) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === 'overview') params.delete('tab')
        else params.set('tab', next)
        return params
      },
      { replace: true },
    )
  }

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 640,
  )
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 800,
  )
  const [weekOffset, setWeekOffset] = useState(0)
  const [viewedWeekSummary, setViewedWeekSummary] =
    useState<FoodSummary | null>(null)
  const [currentWeekSummary, setCurrentWeekSummary] =
    useState<FoodSummary | null>(null)
  const [bodyWeightData, setBodyWeightData] = useState<BodyWeightStats | null>(
    null,
  )
  const [lastWeight, setLastWeight] = useState<number | null>(null)
  const [showWeightForm, setShowWeightForm] = useState(false)
  const [showLogModal, setShowLogModal] = useState(false)
  const [historyShowAll, setHistoryShowAll] = useState(false)
  const [logModalPlannedMeal, setLogModalPlannedMeal] =
    useState<MealLog | null>(null)
  const [logModalDefaultMealType, setLogModalDefaultMealType] = useState<
    'breakfast' | 'lunch' | 'dinner' | 'snack'
  >('breakfast')
  const [refreshKey, setRefreshKey] = useState(0)

  function localDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function weekStartFor(offset: number): Date {
    const now = new Date()
    const dayOfWeek = now.getDay() // 0=Sunday, 1=Monday, ...
    const offsetDays =
      settings.week_start === 'sunday'
        ? dayOfWeek // days since Sunday
        : (dayOfWeek + 6) % 7 // days since Monday
    const start = new Date(now)
    start.setDate(now.getDate() - offsetDays + offset * 7)
    start.setHours(0, 0, 0, 0)
    return start
  }

  async function loadWeek(offset = weekOffset) {
    try {
      const viewedStart = weekStartFor(offset)
      const viewedEnd = new Date(viewedStart)
      viewedEnd.setDate(viewedStart.getDate() + 6)
      viewedEnd.setHours(23, 59, 59, 999)

      const currentStart = weekStartFor(0)
      const currentEnd = new Date(currentStart)
      currentEnd.setDate(currentStart.getDate() + 6)
      currentEnd.setHours(23, 59, 59, 999)

      const fromStr = (d: Date) => `${localDateStr(d)}T00:00:00.000Z`
      const toStr = (d: Date) => `${localDateStr(d)}T23:59:59.999Z`

      const [viewedSummary, currentSummary, bwStats] = await Promise.all([
        fetchSummary(fromStr(viewedStart), toStr(viewedEnd)),
        fetchSummary(fromStr(currentStart), toStr(currentEnd)),
        fetchBodyWeightStats(),
      ])
      setViewedWeekSummary(viewedSummary)
      setCurrentWeekSummary(currentSummary)
      setBodyWeightData(bwStats)

      // Get last weight from body metrics
      const metrics = await fetchBodyMetrics()
      if (metrics.length > 0 && metrics[0].weight != null) {
        setLastWeight(toDisplayWeight(metrics[0].weight, weightUnit))
      } else {
        setLastWeight(null)
      }
    } catch (err) {
      console.error('Failed to load food data', err)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWeek(weekOffset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // Deep link: ?meal=<id> — open the meal log edit modal on history tab
  const handledMealRef = useRef<string | null>(null)
  useEffect(() => {
    const mealParam = searchParams.get('meal')
    if (!mealParam || mealParam === handledMealRef.current) return
    handledMealRef.current = mealParam
    setHistoryShowAll(true)
    if (tab !== 'history') setTab('history')
    fetchMealLogs()
      .then((all) => {
        const meal = all.find((m) => m.id === mealParam)
        if (meal) {
          // Scroll to the meal row
          const el = document.getElementById(`food-history-row-${meal.id}`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setLogModalPlannedMeal(meal)
          setShowLogModal(true)
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ISO week number
  function isoWeek(date: Date): number {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    )
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  }

  const viewedWeekStart = weekStartFor(weekOffset)
  const weekNumber = isoWeek(viewedWeekStart)

  // Today's data
  const todayStr = localDateStr(new Date())
  const todaySummary: DaySummary | undefined = currentWeekSummary?.days.find(
    (d) => d.date === todayStr,
  )

  // Settings with defaults
  const dailyMealGoal = settings.food_daily_meal_goal ?? 5
  const calorieTarget = settings.food_calorie_target ?? null
  const proteinTarget = settings.food_protein_target_g ?? null
  const carbsTarget = settings.food_carbs_target_g ?? null
  const fatTarget = settings.food_fat_target_g ?? null
  const waterTarget = settings.food_water_target_units ?? null
  const vegTarget = settings.food_veg_target_units ?? null
  const fruitTarget = settings.food_fruit_target_units ?? null

  // Today's values
  const todayCalories = todaySummary?.calories_consumed ?? 0
  const todayProtein = todaySummary?.protein_consumed ?? 0
  const todayCarbs = todaySummary?.carbs_consumed ?? 0
  const todayFat = todaySummary?.fat_consumed ?? 0
  const todayWater = todaySummary?.water_units ?? 0
  const todayVeg = todaySummary?.veg_units ?? 0
  const todayFruit = todaySummary?.fruit_units ?? 0

  // Week days for the bars
  const weekDays = currentWeekSummary?.days ?? []

  async function handleWaterAdjust(delta: number) {
    const base = todaySummary?.extras_water_units ?? 0
    const newVal = Math.max(0, base + delta)
    try {
      await upsertExtras(todayStr, { water_units: newVal })
      await loadWeek()
    } catch (err) {
      console.error('Failed to update water', err)
    }
  }

  async function handleVegAdjust(delta: number) {
    const base = todaySummary?.extras_veg_units ?? 0
    const newVal = Math.max(0, base + delta)
    try {
      await upsertExtras(todayStr, { veg_units: newVal })
      await loadWeek()
    } catch (err) {
      console.error('Failed to update vegetables', err)
    }
  }

  async function handleFruitAdjust(delta: number) {
    const base = todaySummary?.extras_fruit_units ?? 0
    const newVal = Math.max(0, base + delta)
    try {
      await upsertExtras(todayStr, { fruit_units: newVal })
      await loadWeek()
    } catch (err) {
      console.error('Failed to update fruits', err)
    }
  }

  function openLogModal(meal?: MealLog | null, mealType?: string) {
    setLogModalPlannedMeal(meal ?? null)
    setLogModalDefaultMealType(
      (mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack') ?? 'breakfast',
    )
    setShowLogModal(true)
  }

  // Calorie ring calculations
  const caloriePct =
    calorieTarget && calorieTarget > 0
      ? Math.min(100, (todayCalories / calorieTarget) * 100)
      : 0
  const calorieRemaining = calorieTarget
    ? Math.max(0, calorieTarget - todayCalories)
    : 0

  // SVG ring constants
  const ringRadius = 38
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringOffset = ringCircumference - (caloriePct / 100) * ringCircumference

  return (
    <div
      className="food-page"
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-base)',
        animation: 'fadeUp .4s cubic-bezier(.16,1,.3,1) both',
      }}
    >
      {(!isMobile || sidebarOpen) && (
        <AppRail active="food" onNavigate={navigate} />
      )}

      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minWidth: 0,
          position: 'relative',
        }}
      >
        <SidebarShell
          title="Food"
          open={sidebarOpen}
          actions={
            <IconButton
              icon={
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              }
              label="Close navigation"
              onClick={() => setSidebarOpen(false)}
              size="md"
              className="sidebar-close"
            />
          }
        >
          <div
            style={{
              padding: '20px 16px',
              animation: 'slideInL .3s ease both',
            }}
          >
            {/* 1. This week bars */}
            <div className="food-sidebar-section-label">This week</div>
            <div className="food-week-bars">
              {weekDays.map((day, i) => {
                const isToday = day.date === todayStr
                const segments = Array.from(
                  { length: dailyMealGoal },
                  (_, s) => s < day.meals_logged,
                )
                return (
                  <div
                    key={i}
                    className="food-week-bar"
                    style={{
                      background: isToday
                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                        : 'var(--border-grid)',
                      border: isToday
                        ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)'
                        : 'none',
                    }}
                  >
                    {segments.map((filled, s) => (
                      <div
                        key={s}
                        className={`food-week-bar-segment${filled ? ' filled' : ''}`}
                      />
                    ))}
                  </div>
                )
              })}
            </div>

            {/* 2. Today calorie ring */}
            <div className="food-sidebar-section-label">Today</div>
            <div
              className="food-sidebar-card"
              style={{
                marginBottom: '14px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '12px 10px',
              }}
            >
              {calorieTarget ? (
                <>
                  <div
                    style={{
                      position: 'relative',
                      width: '90px',
                      height: '90px',
                    }}
                  >
                    <svg
                      width="90"
                      height="90"
                      viewBox="0 0 90 90"
                      style={{ transform: 'rotate(-90deg)' }}
                    >
                      <circle
                        cx="45"
                        cy="45"
                        r={ringRadius}
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth="5"
                      />
                      <circle
                        cx="45"
                        cy="45"
                        r={ringRadius}
                        fill="none"
                        stroke="var(--food-accent)"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={ringOffset}
                        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                      />
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span className="food-calorie-ring-value">
                        {Math.round(todayCalories)}
                      </span>
                      <span className="food-calorie-ring-target">
                        / {calorieTarget}
                      </span>
                    </div>
                  </div>
                  <span className="food-calorie-ring-remaining">
                    {Math.round(calorieRemaining)} kcal remaining of{' '}
                    {calorieTarget} target
                  </span>
                </>
              ) : (
                <span
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-tertiary)',
                    padding: '20px 0',
                  }}
                >
                  No calorie target set
                </span>
              )}
            </div>

            {/* 3. Macros card */}
            <div className="food-sidebar-section-label">Macros</div>
            <div
              className="food-sidebar-card"
              style={{
                marginBottom: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <ProgressBar
                label="Protein"
                value={todayProtein}
                max={proteinTarget ?? 100}
                sublabel={
                  proteinTarget
                    ? `${Math.round(todayProtein)}g / ${proteinTarget}g`
                    : `${Math.round(todayProtein)}g`
                }
                color="var(--food-accent)"
              />
              <ProgressBar
                label="Carbs"
                value={todayCarbs}
                max={carbsTarget ?? 100}
                sublabel={
                  carbsTarget
                    ? `${Math.round(todayCarbs)}g / ${carbsTarget}g`
                    : `${Math.round(todayCarbs)}g`
                }
                color="var(--food-accent)"
              />
              <ProgressBar
                label="Fat"
                value={todayFat}
                max={fatTarget ?? 100}
                sublabel={
                  fatTarget
                    ? `${Math.round(todayFat)}g / ${fatTarget}g`
                    : `${Math.round(todayFat)}g`
                }
                color="var(--food-accent)"
              />
            </div>

            {/* 4. Water card */}
            <div className="food-sidebar-section-label">Water</div>
            <div className="food-sidebar-card" style={{ marginBottom: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '4px',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <WaterDropIcon />
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {todayWater}
                    {waterTarget ? ` / ${waterTarget}` : ''}
                  </span>
                </div>
                <div className="food-water-controls">
                  <button
                    className="food-water-btn"
                    onClick={() => handleWaterAdjust(-1)}
                    aria-label="Decrease water"
                  >
                    −
                  </button>
                  <button
                    className="food-water-btn"
                    onClick={() => handleWaterAdjust(1)}
                    aria-label="Increase water"
                  >
                    +
                  </button>
                </div>
              </div>
              {waterTarget && waterTarget > 0 && (
                <div className="food-water-bar">
                  <div
                    className="food-water-bar-fill"
                    style={{
                      width: `${Math.min(100, (todayWater / waterTarget) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* 5. Vegetables card */}
            <div className="food-sidebar-section-label">Vegetables</div>
            <div className="food-sidebar-card" style={{ marginBottom: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {todayVeg}
                  {vegTarget ? ` / ${vegTarget}` : ''} portions
                </span>
                <div className="food-water-controls">
                  <button
                    className="food-water-btn"
                    onClick={() => handleVegAdjust(-1)}
                    aria-label="Decrease vegetables"
                  >
                    −
                  </button>
                  <button
                    className="food-water-btn"
                    onClick={() => handleVegAdjust(1)}
                    aria-label="Increase vegetables"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="food-icon-row">
                {Array.from(
                  { length: Math.max(vegTarget ?? 5, todayVeg) },
                  (_, i) => (
                    <div
                      key={i}
                      className="food-icon-btn"
                      style={{ cursor: 'default' }}
                    >
                      <BroccoliIcon filled={i < todayVeg} />
                    </div>
                  ),
                )}
              </div>
            </div>

            {/* 6. Fruits card */}
            <div className="food-sidebar-section-label">Fruits</div>
            <div className="food-sidebar-card" style={{ marginBottom: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {todayFruit}
                  {fruitTarget ? ` / ${fruitTarget}` : ''} portions
                </span>
                <div className="food-water-controls">
                  <button
                    className="food-water-btn"
                    onClick={() => handleFruitAdjust(-1)}
                    aria-label="Decrease fruit"
                  >
                    −
                  </button>
                  <button
                    className="food-water-btn"
                    onClick={() => handleFruitAdjust(1)}
                    aria-label="Increase fruit"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="food-icon-row">
                {Array.from(
                  { length: Math.max(fruitTarget ?? 5, todayFruit) },
                  (_, i) => (
                    <div
                      key={i}
                      className="food-icon-btn"
                      style={{ cursor: 'default' }}
                    >
                      <AppleIcon filled={i < todayFruit} />
                    </div>
                  ),
                )}
              </div>
            </div>

            {/* 7. Body weight card */}
            {lastWeight !== null && bodyWeightData && (
              <BodyWeightCard
                lastWeight={lastWeight}
                weightUnit={weightUnit}
                metrics={bodyWeightData.metrics}
                trend={
                  bodyWeightData.trend != null
                    ? toDisplayWeight(bodyWeightData.trend, weightUnit)
                    : null
                }
                onOpenLog={() => setShowWeightForm((v) => !v)}
              />
            )}

            {/* Weight form (toggled by body weight card) */}
            {showWeightForm && (
              <div style={{ marginTop: '10px' }}>
                <BodyMetricForm
                  onSaved={() => {
                    setShowWeightForm(false)
                    loadWeek()
                  }}
                />
              </div>
            )}
          </div>
        </SidebarShell>
        {sidebarOpen && (
          <div
            className="sidebar-backdrop"
            role="presentation"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <div className="food-topbar">
            <div className="food-topbar-row">
              <div className="food-topbar-nav">
                <button
                  onClick={() => setSidebarOpen((open) => !open)}
                  aria-label={
                    sidebarOpen ? 'Hide navigation' : 'Show navigation'
                  }
                  aria-pressed={sidebarOpen}
                  className="food-topbar-nav-btn"
                  style={{
                    position: isMobile ? 'absolute' : undefined,
                    left: isMobile ? 0 : undefined,
                    top: isMobile ? 2 : undefined,
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                    <path d="M7.5 3.5v13" />
                  </svg>
                </button>
                <h2 className="food-topbar-title">Food</h2>
                <div className="food-topbar-nav-buttons">
                  <button
                    onClick={() => setWeekOffset((o) => o - 1)}
                    aria-label="Previous week"
                    className="food-topbar-nav-btn"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setWeekOffset((o) => o + 1)}
                    aria-label="Next week"
                    className="food-topbar-nav-btn"
                  >
                    ›
                  </button>
                </div>
                <button
                  onClick={() => setWeekOffset(0)}
                  disabled={weekOffset === 0}
                  className="food-topbar-today"
                >
                  Today
                </button>
                <span className="food-topbar-sub">Week {weekNumber}</span>
              </div>
              <div
                className="food-tabs"
                style={{ margin: isMobile ? '0 auto' : undefined }}
              >
                <Segmented
                  value={tab}
                  options={[...TABS]}
                  onChange={setTab}
                  labels={{
                    overview: 'Overview',
                    stats: 'Stats',
                    history: 'History',
                  }}
                  ariaLabel="Food sections"
                />
              </div>
              <div className="food-topbar-actions">
                <button
                  onClick={() => openLogModal()}
                  className="food-primary-button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  >
                    <path d="M10 4v12M4 10h12" />
                  </svg>
                  Log meal
                </button>
              </div>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '28px 32px 64px',
              minWidth: 0,
            }}
          >
            {tab === 'overview' && (
              <Overview
                summary={viewedWeekSummary}
                weekOffset={weekOffset}
                onLogMeal={openLogModal}
                onSaved={() => loadWeek()}
              />
            )}

            {tab === 'stats' && (
              <Stats summary={viewedWeekSummary} onSaved={() => loadWeek()} />
            )}

            {tab === 'history' && (
              <History
                onSaved={() => {
                  loadWeek()
                  setRefreshKey((k) => k + 1)
                }}
                onEditMeal={(meal) => openLogModal(meal)}
                refreshKey={refreshKey}
                initialShowAll={historyShowAll}
              />
            )}

            {/* MealLogModal */}
            <MealLogModal
              open={showLogModal}
              onClose={() => setShowLogModal(false)}
              onSaved={() => {
                loadWeek()
                setRefreshKey((k) => k + 1)
              }}
              plannedMeal={logModalPlannedMeal}
              defaultMealType={logModalDefaultMealType}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
