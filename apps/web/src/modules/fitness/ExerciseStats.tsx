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

interface Stats {
  exercise: { id: string; name: string; category: string }
  personal_records: PR[]
  estimated_1rm: number | null
  volume_by_week: WeekVolume[]
  progression: ProgressPoint[]
}

interface Props {
  exerciseId: string
  onClose: () => void
}

export function ExerciseStats({ exerciseId, onClose }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/fitness/stats/exercise/${exerciseId}`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [exerciseId])

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
            {stats.exercise.category} · Last 90 days
          </p>
        </div>
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

      {/* 1RM estimate */}
      {stats.estimated_1rm != null && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <div
            style={{
              flex: 1,
              padding: '16px 18px',
              background: 'var(--bg-elevated)',
              border: '1px solid rgba(255,240,200,0.07)',
              borderRadius: '12px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '10px',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
                letterSpacing: '.06em',
                marginBottom: '6px',
              }}
            >
              Estimated 1RM
            </div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 700,
                color: 'var(--fit-accent)',
              }}
            >
              {stats.estimated_1rm}
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 400,
                  color: 'var(--text-tertiary)',
                  marginLeft: '4px',
                }}
              >
                kg
              </span>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              padding: '16px 18px',
              background: 'var(--bg-elevated)',
              border: '1px solid rgba(255,240,200,0.07)',
              borderRadius: '12px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '10px',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
                letterSpacing: '.06em',
                marginBottom: '6px',
              }}
            >
              Best Set
            </div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              {stats.personal_records.length > 0
                ? `${stats.personal_records[stats.personal_records.length - 1].max_weight}`
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
                kg
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Personal records table */}
      {stats.personal_records.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h4
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '10px',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              letterSpacing: '.06em',
              margin: '0 0 10px',
            }}
          >
            Personal Records
          </h4>
          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid rgba(255,240,200,0.07)',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                padding: '8px 14px',
                borderBottom: '1px solid rgba(255,240,200,0.06)',
              }}
            >
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '9.5px',
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '.05em',
                }}
              >
                Reps
              </span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '9.5px',
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
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '9.5px',
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
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {pr.max_weight} kg
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-tertiary)',
                    textAlign: 'right',
                    fontFamily: 'JetBrains Mono, monospace',
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
          <h4
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '10px',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              letterSpacing: '.06em',
              margin: '0 0 10px',
            }}
          >
            Weekly Volume (kg)
          </h4>
          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid rgba(255,240,200,0.07)',
              borderRadius: '10px',
              padding: '12px 8px',
            }}
          >
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.volume_by_week}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,240,200,0.06)"
                />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10, fill: '#6B6761' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6B6761' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1C1B17',
                    border: '1px solid rgba(255,240,200,0.12)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#F0EDE5',
                  }}
                />
                <Bar
                  dataKey="total_volume"
                  fill="#22D3EE"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Progression chart */}
      {stats.progression.length > 2 && (
        <div style={{ marginBottom: '24px' }}>
          <h4
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '10px',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              letterSpacing: '.06em',
              margin: '0 0 10px',
            }}
          >
            Max Weight Over Time
          </h4>
          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid rgba(255,240,200,0.07)',
              borderRadius: '10px',
              padding: '12px 8px',
            }}
          >
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={stats.progression}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,240,200,0.06)"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#6B6761' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6B6761' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1C1B17',
                    border: '1px solid rgba(255,240,200,0.12)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#F0EDE5',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="max_weight"
                  stroke="#22D3EE"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#22D3EE' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Empty state */}
      {stats.personal_records.length === 0 &&
        stats.volume_by_week.length === 0 && (
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
    </div>
  )
}
