import { useState } from 'react'
import { createBodyMetric } from './api'

interface BodyMetricFormProps {
  onSaved: () => void
}

export function BodyMetricForm({ onSaved }: BodyMetricFormProps) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      onSaved()
    } catch {
      setError('Failed to log body metric')
    } finally {
      setSubmitting(false)
    }
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

  return (
    <div className="fitness-section">
      <h3 className="fitness-section-title" style={{ margin: '0 0 10px' }}>
        Log Body Metrics
      </h3>
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid rgba(255,240,200,0.07)',
          borderRadius: 'var(--r-lg)',
          padding: '14px',
        }}
      >
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
          <p
            style={{
              color: '#d9573f',
              fontSize: '12px',
              margin: '10px 0 0',
            }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
