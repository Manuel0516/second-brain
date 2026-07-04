import { useState } from 'react'
import {
  EXERCISE_LIBRARY,
  PREV_PERFORMANCE,
  type ActiveSession,
} from './exerciseLibrary'

const SESSION_TYPES = [
  { type: 'Push', icon: '󰙪', desc: 'Chest · Shoulders · Tris' },
  { type: 'Pull', icon: '󰙪', desc: 'Back · Biceps · RDL' },
  { type: 'Legs', icon: '󰙪', desc: 'Quads · Hamstrings · Glutes' },
  { type: 'Upper', icon: '󰙪', desc: 'Full upper body' },
  { type: 'Lower', icon: '󰙪', desc: 'Full lower body' },
  { type: 'Custom', icon: '󰏗', desc: 'Build your own' },
]

interface Props {
  open: boolean
  onClose: () => void
  onStart: (session: ActiveSession) => void
}

export function SessionWizard({ open, onClose, onStart }: Props) {
  const [step, setStep] = useState(1)
  const [sessionType, setSessionType] = useState('')
  const [selectedExercises, setSelectedExercises] = useState<string[]>([])
  const [customEx, setCustomEx] = useState('')

  if (!open) return null

  const library = sessionType ? EXERCISE_LIBRARY[sessionType] || [] : []
  const maxEx =
    sessionType === 'Custom' ? library.length : Math.min(7, library.length)

  function selectType(type: string) {
    setSessionType(type)
    const defaults = (EXERCISE_LIBRARY[type] || []).slice(0, 5)
    setSelectedExercises(defaults)
  }

  function toggleEx(name: string) {
    setSelectedExercises((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name],
    )
  }

  function addCustom() {
    const n = customEx.trim()
    if (!n || selectedExercises.includes(n)) return
    setSelectedExercises((prev) => [...prev, n])
    setCustomEx('')
  }

  function handleStart() {
    const exs = selectedExercises.map((name) => ({
      name,
      prev: PREV_PERFORMANCE[name] || '—',
      sets: [
        { w: '', r: '', done: false },
        { w: '', r: '', done: false },
        { w: '', r: '', done: false },
      ],
    }))
    onStart({ type: sessionType, exercises: exs })
    // Reset
    setStep(1)
    setSessionType('')
    setSelectedExercises([])
    onClose()
  }

  function goToStep2() {
    if (!sessionType) return
    setStep(2)
  }

  function goBack() {
    setStep(1)
  }

  const canProceed = !!sessionType
  const canStart = selectedExercises.length >= 1

  // Shared styles
  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 130,
    background: 'rgba(0,0,0,.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const modalStyle: React.CSSProperties = {
    width: '520px',
    maxWidth: '94vw',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,.6)',
    animation: 'springIn .38s cubic-bezier(.16,1,.3,1) both',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '90vh',
  }

  const stepDotStyle = (active: boolean): React.CSSProperties => ({
    width: '22px',
    height: '3px',
    borderRadius: '99px',
    background: active ? 'var(--accent)' : 'rgba(255,240,200,0.07)',
    transition: 'background .3s',
  })

  const typeBtnStyle = (type: string): React.CSSProperties => {
    const selected = sessionType === type
    return {
      padding: '16px 10px',
      borderRadius: '10px',
      border: `1px solid ${selected ? 'var(--fit-accent-border)' : 'rgba(255,240,200,0.07)'}`,
      background: selected ? 'var(--fit-accent-tint)' : 'var(--bg-elevated)',
      cursor: 'pointer',
      textAlign: 'left' as const,
      transition: 'border-color .2s, background .2s',
      width: '100%',
    }
  }

  const typeLabelStyle = (selected: boolean): React.CSSProperties => ({
    fontSize: '13.5px',
    fontWeight: 700,
    color: selected ? 'var(--fit-accent)' : 'var(--text-primary)',
  })

  const typeIconStyle = (selected: boolean): React.CSSProperties => ({
    fontSize: '20px',
    color: selected ? 'var(--fit-accent)' : 'var(--text-tertiary)',
    display: 'block',
    marginBottom: '8px',
  })

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      role="presentation"
      tabIndex={-1}
      style={backdropStyle}
    >
      <div style={modalStyle}>
        {/* Step indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '18px 24px 0',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <div style={stepDotStyle(true)} />
            <div style={stepDotStyle(step >= 2)} />
          </div>
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--text-tertiary)',
            }}
          >
            Step {step} of 2
          </span>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              width: '26px',
              height: '26px',
              background: 'rgba(255,240,200,0.06)',
              border: 'none',
              borderRadius: '6px',
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px 24px 24px', overflowY: 'auto', flex: 1 }}>
          {/* STEP 1 — session type */}
          {step === 1 && (
            <div style={{ animation: 'fadeUp .22s ease both' }}>
              <h3
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  letterSpacing: '-.015em',
                  margin: '0 0 5px',
                  color: 'var(--text-primary)',
                }}
              >
                What are you training today?
              </h3>
              <p
                style={{
                  fontSize: '12.5px',
                  color: 'var(--text-tertiary)',
                  margin: '0 0 20px',
                }}
              >
                Select a session type to pre-load your usual exercises.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  marginBottom: '20px',
                }}
              >
                {SESSION_TYPES.map((st) => (
                  <button
                    key={st.type}
                    onClick={() => selectType(st.type)}
                    style={typeBtnStyle(st.type)}
                  >
                    <span style={typeIconStyle(sessionType === st.type)}>
                      {st.icon}
                    </span>
                    <div style={typeLabelStyle(sessionType === st.type)}>
                      {st.type}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        marginTop: '2px',
                      }}
                    >
                      {st.desc}
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={goToStep2}
                disabled={!canProceed}
                style={{
                  width: '100%',
                  height: '42px',
                  background: canProceed
                    ? 'var(--accent-tint)'
                    : 'rgba(255,240,200,0.04)',
                  border: `1px solid ${canProceed ? 'var(--accent-tint-border)' : 'rgba(255,240,200,0.07)'}`,
                  borderRadius: '9px',
                  color: canProceed ? 'var(--accent)' : 'var(--text-tertiary)',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  cursor: canProceed ? 'pointer' : 'default',
                  transition: 'background .2s, border-color .2s, color .2s',
                }}
              >
                Choose exercises →
              </button>
            </div>
          )}

          {/* STEP 2 — exercises */}
          {step === 2 && (
            <div style={{ animation: 'fadeUp .22s ease both' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '5px',
                }}
              >
                <button
                  onClick={goBack}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 0,
                  }}
                >
                  ←
                </button>
                <h3
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    letterSpacing: '-.015em',
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  Plan your {sessionType} session
                </h3>
              </div>
              <p
                style={{
                  fontSize: '12.5px',
                  color: 'var(--text-tertiary)',
                  margin: '0 0 16px',
                }}
              >
                Select 3–5 exercises. Toggle to add or remove. Tap Start when
                ready.
              </p>

              {/* Exercise toggles */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  marginBottom: '14px',
                }}
              >
                {library.slice(0, maxEx).map((name) => {
                  const selected = selectedExercises.includes(name)
                  const prev = PREV_PERFORMANCE[name] || '—'
                  return (
                    <button
                      key={name}
                      onClick={() => toggleEx(name)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '11px 14px',
                        borderRadius: '9px',
                        border: `1px solid ${selected ? 'var(--fit-accent-border)' : 'rgba(255,240,200,0.07)'}`,
                        background: selected
                          ? 'var(--fit-accent-tint)'
                          : 'var(--bg-raised)',
                        cursor: 'pointer',
                        textAlign: 'left' as const,
                        transition: 'border-color .18s, background .18s',
                        width: '100%',
                      }}
                    >
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '5px',
                          border: `1.5px solid ${selected ? 'var(--fit-accent)' : 'rgba(255,240,200,0.12)'}`,
                          background: selected
                            ? 'var(--fit-accent)'
                            : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all .15s',
                        }}
                      >
                        {selected && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="white"
                            strokeWidth="2.8"
                            strokeLinecap="round"
                          >
                            <path d="M4 10l4 4L17 6" />
                          </svg>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: selected
                            ? 'var(--fit-accent)'
                            : 'var(--text-primary)',
                        }}
                      >
                        {name}
                      </span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '10px',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        {prev}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Custom exercise input */}
              <div
                style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}
              >
                <input
                  value={customEx}
                  onChange={(e) => setCustomEx(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustom()
                    }
                  }}
                  placeholder="Add custom exercise…"
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    background: 'var(--bg-raised)',
                    border: '1px solid rgba(255,240,200,0.09)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={addCustom}
                  style={{
                    height: '38px',
                    padding: '0 14px',
                    background: 'rgba(255,240,200,0.07)',
                    border: '1px solid rgba(255,240,200,0.09)',
                    borderRadius: '8px',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'background .15s',
                  }}
                >
                  Add
                </button>
              </div>

              {/* Selected summary */}
              <div
                style={{
                  padding: '10px 14px',
                  background: 'var(--bg-raised)',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  minHeight: '36px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  {selectedExercises.length} selected ·{' '}
                </span>
                <span
                  style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
                >
                  {selectedExercises.join(', ') || 'None'}
                </span>
              </div>

              <button
                onClick={handleStart}
                disabled={!canStart}
                style={{
                  width: '100%',
                  height: '42px',
                  background: canStart
                    ? 'var(--accent-tint)'
                    : 'rgba(255,240,200,0.04)',
                  border: `1px solid ${canStart ? 'var(--accent-tint-border)' : 'rgba(255,240,200,0.07)'}`,
                  borderRadius: '9px',
                  color: canStart ? 'var(--accent)' : 'var(--text-tertiary)',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  cursor: canStart ? 'pointer' : 'default',
                  transition: 'background .2s, color .2s, border-color .2s',
                }}
              >
                Start session →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
