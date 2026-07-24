import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { deleteExercise } from './api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useSettings } from '../../context/SettingsContext'
import { toDisplayWeight } from './units'

interface PR {
  reps: number
  max_weight: number
  date: string
}

interface WeekVolume {
  week: string
  total_volume: number
  session_count: number
}

interface ProgressPoint {
  date: string
  max_weight: number
  max_reps: number
}

interface DistancePoint {
  date: string
  distance_km: number
}

interface PacePoint {
  date: string
  pace: number
}

interface CardioWeek {
  week: string
  distance_km: number
  duration_min: number
}

interface Stats {
  category: 'strength' | 'cardio'
  exercise: { id: string; name: string; category: string }
  personal_records: PR[]
  estimated_1rm: number | null
  volume_by_week: WeekVolume[]
  progression: ProgressPoint[]
  total_distance_km: number | null
  total_duration_min: number | null
  best_pace_min_per_km: number | null
  distance_over_time: DistancePoint[]
  pace_over_time: PacePoint[]
  weekly: CardioWeek[]
}

interface Props {
  exerciseId: string
  onClose: () => void
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '12px 8px',
}

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  letterSpacing: '.06em',
  margin: '0 0 10px',
}

const tileStyle: React.CSSProperties = {
  flex: 1,
  padding: '16px 18px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  textAlign: 'center',
}

const tileLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  letterSpacing: '.06em',
  marginBottom: '6px',
}

const tileValueStyle: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 700,
  color: 'var(--fit-accent)',
}

const RANGE_LABELS: Record<number, string> = {
  7: '1 week',
  30: '1 month',
  90: '3 months',
  180: '6 months',
  365: '1 year',
}

function statsRangeLabel(days: number): string {
  return RANGE_LABELS[days] ?? `${days} days`
}

const axisTick = { fontSize: 10, fill: 'var(--text-tertiary)' }
const tooltipStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-strong)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--text-primary)',
}

export function ExerciseStats({ exerciseId, onClose }: Props) {
  const { settings } = useSettings()
  const weightUnit = settings.fitness_weight_unit
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const statsDays = settings.fitness_stats_range_days

  useEffect(() => {
    fetch(`/api/fitness/stats/exercise/${exerciseId}?days=${statsDays}`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [exerciseId, statsDays])

  async function confirmDelete() {
    setConfirmOpen(false)
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteExercise(exerciseId)
      onClose()
    } catch (err) {
      // ponytail: backend 409s when the exercise has logged sets — surface
      // whatever detail it sent instead of guessing at a status code.
      setDeleteError(
        err instanceof Error
          ? err.message
          : "Used in logged workouts — can't delete",
      )
    } finally {
      setDeleting(false)
    }
  }

  if (loading)
    return (
      <div
        style={{
          padding: '20px',
          color: 'var(--text-tertiary)',
          fontSize: '13px',
        }}
      >
        Loading stats…
      </div>
    )
  if (!stats)
    return (
      <div
        style={{
          padding: '20px',
          color: 'var(--text-tertiary)',
          fontSize: '13px',
        }}
      >
        No data available.
      </div>
    )

  return (
    <div
      style={{
        animation: 'springIn .3s cubic-bezier(.16,1,.3,1) both',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          gap: '8px',
        }}
      >
        <div>
          <h3
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 4px',
            }}
          >
            {stats.exercise.name}
          </h3>
          <p
            style={{
              fontSize: '12px',
              color: 'var(--text-tertiary)',
              margin: 0,
            }}
          >
            {stats.exercise.category} · Last {statsRangeLabel(statsDays)}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
            title="Delete exercise"
            style={{
              background: 'none',
              border: '1px solid transparent',
              color: '#d9573f',
              cursor: deleting ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              padding: '6px 10px',
              borderRadius: 'var(--r-sm)',
              opacity: deleting ? 0.5 : 1,
            }}
          >
            Delete
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {deleteError && (
        <p
          style={{
            color: '#d9573f',
            fontSize: '12px',
            margin: '0 0 16px',
          }}
        >
          {deleteError}
        </p>
      )}

      {stats.category === 'cardio' ? (
        <>
          {/* Headline tiles */}
          <div
            className="fit-stat-tiles"
            style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}
          >
            <div className="fit-stat-tile" style={tileStyle}>
              <div style={tileLabelStyle}>Total distance</div>
              <div className="fit-stat-tile-value" style={tileValueStyle}>
                {stats.total_distance_km ?? 0}
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 400,
                    color: 'var(--text-tertiary)',
                    marginLeft: '4px',
                  }}
                >
                  km
                </span>
              </div>
            </div>
            <div className="fit-stat-tile" style={tileStyle}>
              <div style={tileLabelStyle}>Total time</div>
              <div className="fit-stat-tile-value" style={tileValueStyle}>
                {stats.total_duration_min ?? 0}
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 400,
                    color: 'var(--text-tertiary)',
                    marginLeft: '4px',
                  }}
                >
                  min
                </span>
              </div>
            </div>
            <div className="fit-stat-tile" style={tileStyle}>
              <div style={tileLabelStyle}>Best pace</div>
              <div
                className="fit-stat-tile-value"
                style={{ ...tileValueStyle, color: 'var(--text-primary)' }}
              >
                {stats.best_pace_min_per_km ?? '—'}
                {stats.best_pace_min_per_km != null && (
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 400,
                      color: 'var(--text-tertiary)',
                      marginLeft: '4px',
                    }}
                  >
                    min/km
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Distance over time */}
          {stats.distance_over_time.length > 1 && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={sectionTitleStyle}>Distance Over Time (km)</h4>
              <div style={cardStyle}>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={stats.distance_over_time}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-grid)"
                    />
                    <XAxis
                      dataKey="date"
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="distance_km"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'var(--accent)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Pace trend */}
          {stats.pace_over_time.length > 1 && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={sectionTitleStyle}>Pace Trend (min/km)</h4>
              <div style={cardStyle}>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={stats.pace_over_time}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-grid)"
                    />
                    <XAxis
                      dataKey="date"
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                      reversed
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="pace"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'var(--accent)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Weekly distance + duration */}
          {stats.weekly.length > 1 && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={sectionTitleStyle}>Weekly Distance & Time</h4>
              <div style={cardStyle}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.weekly}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-grid)"
                    />
                    <XAxis
                      dataKey="week"
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar
                      dataKey="distance_km"
                      fill="var(--accent)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="duration_min"
                      fill="color-mix(in srgb, var(--accent) 35%, transparent)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {stats.distance_over_time.length <= 1 &&
            stats.pace_over_time.length <= 1 &&
            stats.weekly.length <= 1 && (
              <p
                style={{
                  color: 'var(--text-tertiary)',
                  fontSize: '13px',
                  textAlign: 'center',
                  padding: '40px 0',
                }}
              >
                No data for this exercise yet. Log some sets to see stats.
              </p>
            )}
        </>
      ) : (
        <>
          {/* 1RM estimate */}
          {stats.estimated_1rm != null && (
            <div
              className="fit-stat-tiles"
              style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}
            >
              <div className="fit-stat-tile" style={tileStyle}>
                <div style={tileLabelStyle}>Estimated 1RM</div>
                <div className="fit-stat-tile-value" style={tileValueStyle}>
                  {toDisplayWeight(stats.estimated_1rm, weightUnit)}
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 400,
                      color: 'var(--text-tertiary)',
                      marginLeft: '4px',
                    }}
                  >
                    {weightUnit}
                  </span>
                </div>
              </div>
              <div className="fit-stat-tile" style={tileStyle}>
                <div style={tileLabelStyle}>Best Set</div>
                <div
                  className="fit-stat-tile-value"
                  style={{ ...tileValueStyle, color: 'var(--text-primary)' }}
                >
                  {stats.personal_records.length > 0
                    ? `${toDisplayWeight(stats.personal_records[stats.personal_records.length - 1].max_weight, weightUnit)}`
                    : '—'}
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 400,
                      color: 'var(--text-tertiary)',
                      marginLeft: '4px',
                    }}
                  >
                    {stats.personal_records.length > 0
                      ? `×${stats.personal_records[stats.personal_records.length - 1].reps}`
                      : ''}{' '}
                    {weightUnit}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Personal records table */}
          {stats.personal_records.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={sectionTitleStyle}>Personal Records</h4>
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    padding: '8px 14px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '.05em',
                    }}
                  >
                    Reps
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '.05em',
                      textAlign: 'center',
                    }}
                  >
                    Weight
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '.05em',
                      textAlign: 'right',
                    }}
                  >
                    Date
                  </span>
                </div>
                {stats.personal_records.map((pr, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      padding: '7px 14px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {pr.reps}
                    </span>
                    <span
                      style={{
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        textAlign: 'center',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {toDisplayWeight(pr.max_weight, weightUnit)} {weightUnit}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {new Date(pr.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weekly volume chart */}
          {stats.volume_by_week.length > 1 && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={sectionTitleStyle}>Weekly Volume ({weightUnit})</h4>
              <div style={cardStyle}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={stats.volume_by_week.map((w) => ({
                      ...w,
                      total_volume: toDisplayWeight(w.total_volume, weightUnit),
                    }))}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-grid)"
                    />
                    <XAxis
                      dataKey="week"
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: 'var(--border-grid)' }}
                    />
                    <Bar
                      dataKey="total_volume"
                      fill="var(--accent)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Progression chart */}
          {stats.progression.length > 1 && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={sectionTitleStyle}>
                Max Weight Over Time ({weightUnit})
              </h4>
              <div style={cardStyle}>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart
                    data={stats.progression.map((p) => ({
                      ...p,
                      max_weight: toDisplayWeight(p.max_weight, weightUnit),
                    }))}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-grid)"
                    />
                    <XAxis
                      dataKey="date"
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="max_weight"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'var(--accent)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Empty state */}
          {stats.personal_records.length === 0 &&
            stats.volume_by_week.length <= 1 &&
            stats.progression.length <= 1 && (
              <p
                style={{
                  color: 'var(--text-tertiary)',
                  fontSize: '13px',
                  textAlign: 'center',
                  padding: '40px 0',
                }}
              >
                No data for this exercise yet. Log some sets to see stats.
              </p>
            )}
        </>
      )}
      <ConfirmDialog
        open={confirmOpen}
        message="Delete this exercise?"
        detail="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
