import { useState } from 'react'
import { createSession } from './api'

const SESSION_TYPES = ['Push', 'Pull', 'Legs', 'Upper', 'Cardio', 'Custom']

interface ExerciseRow {
  name: string
  sets: string
  reps: string
  weight: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function LogPastModal({ open, onClose, onSaved }: Props) {
  const [sessionType, setSessionType] = useState('Push')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [duration] = useState('60')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Up to 5 exercise rows
  const [exercises, setExercises] = useState<ExerciseRow[]>([
    { name: '', sets: '3', reps: '8', weight: '' },
  ])

  function updateRow(idx: number, field: keyof ExerciseRow, value: string) {
    setExercises((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    )
  }

  function addRow() {
    if (exercises.length >= 5) return
    setExercises((prev) => [
      ...prev,
      { name: '', sets: '3', reps: '', weight: '' },
    ])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const filled = exercises.filter((ex) => ex.name.trim())
    if (filled.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const d = new Date(date + 'T12:00:00Z')
      await createSession({
        date: d.toISOString(),
        type: sessionType,
        notes: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text:
                    notes ||
                    `${sessionType} session — ${filled.map((e) => e.name).join(', ')}`,
                },
              ],
            },
          ],
        },
      })
      // Reset form
      setExercises([{ name: '', sets: '3', reps: '8', weight: '' }])
      setNotes('')
      onSaved()
      onClose()
    } catch {
      setError('Failed to log workout')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--bg-raised)',
    border: '1px solid rgba(255,240,200,0.09)',
    borderRadius: '7px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const monoInputStyle: React.CSSProperties = {
    ...inputStyle,
    textAlign: 'center' as const,
    fontFamily: 'JetBrains Mono, monospace',
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'rgba(0,0,0,.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: '480px',
          maxWidth: '94vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0,0,0,.6)',
          animation: 'springIn .38s cubic-bezier(.16,1,.3,1) both',
          padding: '24px',
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
                letterSpacing: '-.015em',
                color: 'var(--text-primary)',
                margin: '0 0 4px',
              }}
            >
              Log past workout
            </h3>
            <p
              style={{
                fontSize: '12px',
                color: 'var(--text-tertiary)',
                margin: 0,
              }}
            >
              Record a session you already completed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '28px',
              height: '28px',
              background: 'rgba(255,240,200,0.06)',
              border: 'none',
              borderRadius: '6px',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          {/* Type + Date/Time row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
            }}
          >
            {/* Session type pills */}
            <div>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '.07em',
                  color: 'var(--text-tertiary)',
                  marginBottom: '6px',
                }}
              >
                Session type
              </div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {SESSION_TYPES.map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setSessionType(t)}
                    style={{
                      padding: '5px 11px',
                      borderRadius: '99px',
                      fontSize: '11.5px',
                      cursor: 'pointer',
                      background:
                        sessionType === t
                          ? 'var(--accent-tint)'
                          : 'rgba(255,240,200,0.05)',
                      color:
                        sessionType === t
                          ? 'var(--accent)'
                          : 'var(--text-tertiary)',
                      border:
                        sessionType === t
                          ? '1px solid var(--accent-tint-border)'
                          : '1px solid rgba(255,240,200,0.07)',
                      fontWeight: sessionType === t ? 600 : 400,
                      transition:
                        'background .15s, color .15s, border-color .15s',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {/* Date + Duration */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '.07em',
                    color: 'var(--text-tertiary)',
                    marginBottom: '6px',
                  }}
                >
                  Date
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '.07em',
                    color: 'var(--text-tertiary)',
                    marginBottom: '6px',
                  }}
                >
                  Duration
                </div>
                <input
                  type="number"
                  value={duration}
                  readOnly
                  placeholder="60 min"
                  style={{ ...inputStyle, opacity: 0.5 }}
                />
              </div>
            </div>
          </div>

          {/* Exercises grid header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 48px 48px 60px',
              gap: '6px',
              alignItems: 'center',
              padding: '0 2px',
            }}
          >
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '9.5px',
                textTransform: 'uppercase',
                letterSpacing: '.07em',
                color: 'var(--text-tertiary)',
              }}
            >
              Exercise
            </div>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '9.5px',
                textTransform: 'uppercase',
                letterSpacing: '.07em',
                color: 'var(--text-tertiary)',
                textAlign: 'center',
              }}
            >
              Sets
            </div>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '9.5px',
                textTransform: 'uppercase',
                letterSpacing: '.07em',
                color: 'var(--text-tertiary)',
                textAlign: 'center',
              }}
            >
              Reps
            </div>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '9.5px',
                textTransform: 'uppercase',
                letterSpacing: '.07em',
                color: 'var(--text-tertiary)',
                textAlign: 'center',
              }}
            >
              Weight
            </div>
          </div>

          {/* Exercise rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {exercises.map((row, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 48px 48px 60px',
                  gap: '6px',
                  alignItems: 'center',
                }}
              >
                <input
                  value={row.name}
                  onChange={(e) => updateRow(idx, 'name', e.target.value)}
                  placeholder="Exercise…"
                  style={inputStyle}
                />
                <input
                  type="number"
                  value={row.sets}
                  onChange={(e) => updateRow(idx, 'sets', e.target.value)}
                  style={monoInputStyle}
                />
                <input
                  type="number"
                  value={row.reps}
                  onChange={(e) => updateRow(idx, 'reps', e.target.value)}
                  placeholder="8"
                  style={monoInputStyle}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '8px 8px',
                    background: 'var(--bg-raised)',
                    border: '1px solid rgba(255,240,200,0.09)',
                    borderRadius: '7px',
                  }}
                >
                  <input
                    type="number"
                    value={row.weight}
                    onChange={(e) => updateRow(idx, 'weight', e.target.value)}
                    placeholder="—"
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--fit-accent)',
                      fontSize: '13px',
                      textAlign: 'center',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '9px',
                      color: 'var(--text-tertiary) ',
                    }}
                  >
                    kg
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Add exercise button */}
          {exercises.length < 5 && (
            <button
              type="button"
              onClick={addRow}
              style={{
                width: '100%',
                padding: '8px',
                background: 'transparent',
                border: '1px dashed rgba(255,240,200,0.09)',
                borderRadius: '7px',
                color: 'var(--text-tertiary)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                marginTop: '4px',
              }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <path d="M10 4v12M4 10h12" />
              </svg>
              Add exercise
            </button>
          )}

          {/* Notes */}
          <div>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '.07em',
                color: 'var(--text-tertiary)',
                marginBottom: '6px',
              }}
            >
              Notes / PRs
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bench PR 92 kg · felt strong today…"
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ color: '#d9573f', fontSize: '12px', margin: 0 }}>
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              height: '42px',
              background: 'var(--accent-tint)',
              border: '1px solid var(--accent-tint-border)',
              borderRadius: '9px',
              color: 'var(--accent)',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Logging…' : 'Log workout'}
          </button>
        </form>
      </div>
    </div>
  )
}
