import { useEffect, useState } from 'react'
import type { BodyMetric } from './api'
import { deleteBodyMetric, fetchBodyMetrics } from './api'

export function BodyMetricLog() {
  const [metrics, setMetrics] = useState<BodyMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAllMetrics, setShowAllMetrics] = useState(false)

  useEffect(() => {
    fetchBodyMetrics()
      .then(setMetrics)
      .catch(() => setError('Failed to load body metrics'))
      .finally(() => setLoading(false))
  }, [])

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

  const recentMetrics = showAllMetrics ? metrics : metrics.slice(0, 3)
  const hasMoreMetrics = metrics.length > 3

  return (
    <div className="fitness-section" style={{ display: 'grid', gap: '14px' }}>
      {/* Recent entries */}
      {!loading && recentMetrics.length > 0 && (
        <div>
          <h3
            className="fitness-section-title"
            style={{ margin: '20px 0 14px' }}
          >
            Loged Body Metrics
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
          style={{
            color: 'var(--text-tertiary)',
            fontSize: '13px',
            margin: 0,
          }}
        >
          No body metrics logged yet.
        </p>
      )}
    </div>
  )
}
