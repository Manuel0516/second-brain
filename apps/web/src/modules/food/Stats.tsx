import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { BodyMetricForm } from '../fitness/BodyMetricForm'
import { useSettings } from '../../context/SettingsContext'
import { toDisplayWeight } from '../fitness/units'
import { fetchBodyWeightStats, type BodyWeightStats } from '../fitness/api'
import { fetchSummary, type FoodSummary } from './api'

interface StatsProps {
  summary: FoodSummary | null
  onSaved: () => void
}

type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat'

const MACRO_KEYS: MacroKey[] = ['calories', 'protein', 'carbs', 'fat']
const MACRO_LABELS: Record<MacroKey, string> = {
  calories: 'Calories',
  protein: 'Protein (g)',
  carbs: 'Carbs (g)',
  fat: 'Fat (g)',
}

interface DayPoint {
  date: string
  calories: number
  protein: number
  carbs: number
  fat: number
  water: number
  veg: number
  fruit: number
}

const tooltipStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-strong)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--text-primary)',
}

const axisTick = { fontSize: 10, fill: 'var(--text-tertiary)' }

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function Stats({ summary, onSaved }: StatsProps) {
  const { settings } = useSettings()
  const weightUnit = settings.fitness_weight_unit
  const [macroIdx, setMacroIdx] = useState(0)
  const [bwMetrics, setBwMetrics] = useState<BodyWeightStats['metrics']>([])
  const [historicalSummary, setHistoricalSummary] =
    useState<FoodSummary | null>(null)

  const statsDays = settings.food_stats_range_days

  // Load body weight stats
  useEffect(() => {
    fetchBodyWeightStats(statsDays)
      .then((bw) => setBwMetrics(bw.metrics ?? []))
      .catch(() => {})
  }, [statsDays])

  // Load food history for the charts, spanning the configured stats range
  useEffect(() => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - statsDays)
    const fromStr = `${localDateStr(from)}T00:00:00.000Z`
    const toStr = `${localDateStr(to)}T23:59:59.999Z`
    fetchSummary(fromStr, toStr)
      .then(setHistoricalSummary)
      .catch(() => {})
  }, [statsDays])

  const macroKey = MACRO_KEYS[macroIdx]

  function cycleMacro(dir: 1 | -1) {
    setMacroIdx((i) => (i + dir + MACRO_KEYS.length) % MACRO_KEYS.length)
  }

  // Build day chart data from 30-day historical summary — never plot beyond today
  const todayStr = localDateStr(new Date())
  const days: DayPoint[] = (historicalSummary?.days ?? summary?.days ?? [])
    .filter((d) => d.date <= todayStr)
    .map((d) => ({
      date: d.date,
      calories: d.calories_consumed,
      protein: d.protein_consumed,
      carbs: d.carbs_consumed,
      fat: d.fat_consumed,
      water: d.water_units,
      veg: d.veg_units,
      fruit: d.fruit_units,
    }))

  const hasDays = days.length > 0

  // Weight data
  const weightSeries = bwMetrics
    .filter((m) => m.weight != null)
    .map((m) => ({
      date: m.date,
      value: toDisplayWeight(m.weight as number, weightUnit),
    }))
  const hasWeight = weightSeries.length > 1

  if (!hasDays && !hasWeight) {
    return (
      <div className="food-overview-empty">
        No food data yet for this period. Log some meals to see your stats here.
      </div>
    )
  }

  return (
    <div style={{ animation: 'fadeUp .4s cubic-bezier(.16,1,.3,1) both' }}>
      {/* Macro arrow switcher graph */}
      {hasDays && (
        <div className="food-stats-section">
          <div className="food-stats-card-head">
            <h3 className="food-section-title" style={{ margin: 0 }}>
              {MACRO_LABELS[macroKey]}
            </h3>
            <div className="food-stats-arrows">
              <button
                className="food-week-nav"
                type="button"
                onClick={() => cycleMacro(-1)}
                aria-label="Previous metric"
              >
                ‹
              </button>
              <span className="food-stats-meta">{MACRO_LABELS[macroKey]}</span>
              <button
                className="food-week-nav"
                type="button"
                onClick={() => cycleMacro(1)}
                aria-label="Next metric"
              >
                ›
              </button>
            </div>
          </div>
          <div className="food-stats-card">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={days}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-grid)"
                />
                <XAxis
                  dataKey="date"
                  tick={axisTick}
                  tickFormatter={shortDate}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => shortDate(String(label))}
                />
                <Line
                  type="monotone"
                  dataKey={macroKey}
                  stroke="var(--food-accent)"
                  strokeWidth={1.8}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Water graph */}
      {hasDays && (
        <div className="food-stats-section">
          <h3 className="food-section-title">Water (units)</h3>
          <div className="food-stats-card">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={days}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-grid)"
                />
                <XAxis
                  dataKey="date"
                  tick={axisTick}
                  tickFormatter={shortDate}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => shortDate(String(label))}
                />
                <Line
                  type="monotone"
                  dataKey="water"
                  stroke="var(--food-water)"
                  strokeWidth={1.8}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Vegetables graph */}
      {hasDays && (
        <div className="food-stats-section">
          <h3 className="food-section-title">Vegetables (portions)</h3>
          <div className="food-stats-card">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={days}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-grid)"
                />
                <XAxis
                  dataKey="date"
                  tick={axisTick}
                  tickFormatter={shortDate}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => shortDate(String(label))}
                />
                <Line
                  type="monotone"
                  dataKey="veg"
                  stroke="var(--food-veg)"
                  strokeWidth={1.8}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Fruits graph */}
      {hasDays && (
        <div className="food-stats-section">
          <h3 className="food-section-title">Fruits (portions)</h3>
          <div className="food-stats-card">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={days}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-grid)"
                />
                <XAxis
                  dataKey="date"
                  tick={axisTick}
                  tickFormatter={shortDate}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => shortDate(String(label))}
                />
                <Line
                  type="monotone"
                  dataKey="fruit"
                  stroke="var(--food-fruit)"
                  strokeWidth={1.8}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Weight graph + log form */}
      {hasWeight && (
        <div className="food-stats-section">
          <h3 className="food-section-title">Body weight ({weightUnit})</h3>
          <div className="food-stats-card">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightSeries}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-grid)"
                />
                <XAxis
                  dataKey="date"
                  tick={axisTick}
                  tickFormatter={shortDate}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => shortDate(String(label))}
                  formatter={(v) => [`${v} ${weightUnit}`, 'Body weight']}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--food-accent)"
                  strokeWidth={1.8}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Weight log form */}
      <div className="food-stats-section" style={{ marginTop: '24px' }}>
        <BodyMetricForm onSaved={onSaved} />
      </div>
    </div>
  )
}
