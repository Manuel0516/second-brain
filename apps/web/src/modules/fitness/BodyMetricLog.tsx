import { useEffect, useState } from 'react'
import type { BodyMetric } from './api'
import { createBodyMetric, deleteBodyMetric, fetchBodyMetrics } from './api'

export function BodyMetricLog() {
  const [metrics, setMetrics] = useState<BodyMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAllMetrics, setShowAllMetrics] = useState(false)

  useEffect(() => {
    fetchBodyMetrics()
      .then(setMetrics)
      .catch(() => setError('Failed to load body metrics'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!weight) return
    setSubmitting(true)
    setError(null)
    try {
      const d = new Date(date + 'T12:00:00Z')
      await createBodyMetric({
        date: d.toISOString(),
        weight: parseFloat(weight),
        body_fat_pct: bodyFat ? parseFloat(bodyFat) : null,
        measurements: {},
      })
      setWeight('')
      setBodyFat('')
      const data = await fetchBodyMetrics()
      setMetrics(data)
    } catch {
      setError('Failed to log body metric')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(metricId: string) {
    setDeleting(metricId)
    try {
      await deleteBodyMetric(metricId)
      const data = await fetchBodyMetrics()
      setMetrics(data)
    } catch {
      setError('Failed to delete entry')
    } finally {
      setDeleting(null)
    }
  }

  function formatDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '34px',
    border: '1px solid rgba(255,240,200,0.09)',
    borderRadius: 'var(--r-sm)',
    background: 'var(--bg-raised)',
    color: 'var(--text-primary)',
    font: '400 13px var(--font-ui)',
    padding: '6px 8px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const recentMetrics = showAllMetrics ? metrics : metrics.slice(0, 3)
  const hasMoreMetrics = metrics.length > 3

  return (
    <div className="fitness-section" style={{ display: 'grid', gap: '14px' }}>
      {/* Compact quick-log card */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid rgba(255,240,200,0.07)',
          borderRadius: 'var(--r-lg)',
          padding: '14px',
        }}
      >
        <h3 className="fitness-section-title" style={{ margin: '0 0 10px' }}>
          Body Metrics
        </h3>
        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr auto',
              gap: '8px',
              alignItems: 'end',
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '.05em',
                  color: 'var(--text-tertiary)',
                  marginBottom: '4px',
                }}
              >
                Date
              </div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '.05em',
                  color: 'var(--text-tertiary)',
                  marginBottom: '4px',
                }}
              >
                Weight
              </div>
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                min="0"
                step="0.1"
                placeholder="kg"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '.05em',
                  color: 'var(--text-tertiary)',
                  marginBottom: '4px',
                }}
              >
                BF %
              </div>
              <input
                type="number"
                value={bodyFat}
                onChange={(e) => setBodyFat(e.target.value)}
                min="0"
                max="60"
                step="0.1"
                placeholder="—"
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !weight}
              style={{
                height: '34px',
                padding: '0 14px',
                background: 'var(--accent-tint)',
                border: '1px solid var(--accent-tint-border)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--accent)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: submitting || !weight ? 'not-allowed' : 'pointer',
                opacity: submitting || !weight ? 0.6 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {submitting ? '…' : 'Log'}
            </button>
          </div>
        </form>
        {error && (
          <p style={{ color: '#d9573f', fontSize: '12px', margin: '10px 0 0' }}>
            {error}
          </p>
        )}
      </div>

      {/* Recent entries */}
      {!loading && recentMetrics.length > 0 && (
        <div>
          <h3 className="fitness-section-title" style={{ margin: '0 0 6px' }}>
            Recent
          </h3>
          <div style={{ display: 'grid', gap: '2px' }}>
            {recentMetrics.map((metric, i) => (
              <div
                key={metric.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '5px 10px',
                  borderRadius: 'var(--r-sm)',
                  animation: `springUp 0.5s cubic-bezier(.16,1,.3,1) both`,
                  animationDelay: `${i * 30}ms`,
                }}
              >
                <span
                  style={{
                    color: 'var(--text-tertiary)',
                    font: '400 11px var(--font-mono)',
                    width: '44px',
                    flexShrink: 0,
                  }}
                >
                  {formatDate(metric.date)}
                </span>
                <span
                  style={{
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: 500,
                    flex: 1,
                  }}
                >
                  {metric.weight ? `${metric.weight} kg` : '—'}
                  {metric.body_fat_pct != null && ` · ${metric.body_fat_pct}%`}
                </span>
                <button
                  onClick={() => handleDelete(metric.id)}
                  disabled={deleting === metric.id}
                  title="Delete"
                  style={{
                    width: '20px',
                    height: '20px',
                    display: 'grid',
                    placeItems: 'center',
                    border: '0',
                    borderRadius: 'var(--r-sm)',
                    background: 'transparent',
                    color: '#d9573f',
                    cursor: 'pointer',
                    fontSize: '10px',
                    opacity: deleting === metric.id ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          {hasMoreMetrics && (
            <button
              onClick={() => setShowAllMetrics(!showAllMetrics)}
              style={{
                width: '100%',
                padding: '7px',
                marginTop: '6px',
                background: 'transparent',
                border: '1px dashed rgba(255,240,200,0.09)',
                borderRadius: '7px',
                color: 'var(--text-tertiary)',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'border-color .15s, color .15s',
              }}
            >
              {showAllMetrics
                ? 'Show less'
                : 'Show all (' + metrics.length + ')'}
            </button>
          )}
        </div>
      )}
      {!loading && metrics.length === 0 && !error && (
        <p
          style={{ color: 'var(--text-tertiary)', fontSize: '13px', margin: 0 }}
        >
          No body metrics logged yet.
        </p>
      )}
    </div>
  )
}
