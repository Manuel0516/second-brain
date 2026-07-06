import { useEffect, useState } from 'react'
import { Segmented } from '../../components/Segmented'
import {
  EXERCISE_LIBRARY,
  PREV_PERFORMANCE,
  CategoryBadge,
  type ActiveSession,
} from './exerciseLibrary'
import { newSet } from './LiveSession'
import { SESSION_TYPES, SessionTypeIcon } from './sessionTypes'
import {
  fetchExercises,
  updateSession,
  type Exercise,
  type WorkoutSession,
} from './api'

const TYPE_META: Record<string, { desc: string }> = {
  Push: { desc: 'Chest · Shoulders · Tris' },
  Pull: { desc: 'Back · Biceps · RDL' },
  Legs: { desc: 'Quads · Hamstrings · Glutes' },
  Upper: { desc: 'Full upper body' },
  Cardio: { desc: 'Running · Cycling · Rowing' },
  Custom: { desc: 'Build your own' },
}

interface Props {
  open: boolean
  onClose: () => void
  onStart: (session: ActiveSession, sourceSessionId?: string) => void
  /** Plan/start an existing planned session instead of an ad-hoc one — type
   *  is fixed, exercises pre-fill from `plan`. */
  planningSession?: WorkoutSession | null
  /** Called after "Save plan" (no live session started) so the caller reloads. */
  onPlanned?: () => void
}

export function SessionWizard({
  open,
  onClose,
  onStart,
  planningSession,
  onPlanned,
}: Props) {
  const isPlanning = !!planningSession
  const [step, setStep] = useState(1)
  const [sessionType, setSessionType] = useState('')
  const [selectedExercises, setSelectedExercises] = useState<string[]>([])
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [showCreateFlow, setShowCreateFlow] = useState(false)
  const [customCategory, setCustomCategory] = useState<
    'strength' | 'cardio' | 'mobility'
  >('strength')
  const [exerciseCategories, setExerciseCategories] = useState<
    Record<string, string>
  >({})
  const [dbExercises, setDbExercises] = useState<Exercise[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    fetchExercises()
      .then(setDbExercises)
      .catch(() => setDbExercises([]))
    if (planningSession) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSessionType(planningSession.type)
      setSelectedExercises(
        planningSession.plan && planningSession.plan.length > 0
          ? planningSession.plan
          : [],
      )
      setStep(2)
    } else {
      setStep(1)
      setSessionType('')
      setSelectedExercises([])
    }
    setExerciseSearch('')
    setShowCreateFlow(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planningSession?.id])

  if (!open) return null

  const library = sessionType ? EXERCISE_LIBRARY[sessionType] || [] : []

  // Merge DB exercises + library suggestions, deduped by name (case-insensitive).
  // DB exercises take priority for category info.
  const allCandidates = (() => {
    const seen = new Set<string>()
    const result: { name: string; category: string }[] = []
    for (const ex of dbExercises) {
      const key = ex.name.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ name: ex.name, category: ex.category })
      }
    }
    const libCategory = sessionType === 'Cardio' ? 'cardio' : 'strength'
    for (const name of library) {
      const key = name.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ name, category: libCategory })
      }
    }
    return result
  })()

  const searchTerm = exerciseSearch.trim().toLowerCase()
  const filteredCandidates = searchTerm
    ? allCandidates.filter((c) => c.name.toLowerCase().includes(searchTerm))
    : allCandidates
  const showEmpty = searchTerm.length > 0 && filteredCandidates.length === 0

  function selectType(type: string) {
    setSessionType(type)
    setSelectedExercises([])
    setExerciseCategories({})
  }

  function toggleEx(name: string, category?: string) {
    setSelectedExercises((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name],
    )
    if (category) {
      setExerciseCategories((prev) => {
        if (prev[name]) {
          const next = { ...prev }
          delete next[name]
          return next
        }
        return { ...prev, [name]: category }
      })
    }
  }

  function addCustom(name: string, category: string) {
    if (!name || selectedExercises.includes(name)) return
    setSelectedExercises((prev) => [...prev, name])
    setExerciseCategories((prev) => ({ ...prev, [name]: category }))
    setExerciseSearch('')
    setShowCreateFlow(false)
    setCustomCategory('strength')
  }

  function buildActiveSession(): ActiveSession {
    return {
      type: sessionType,
      exercises: selectedExercises.map((name) => {
        const cat = exerciseCategories[name] as
          | 'strength'
          | 'cardio'
          | 'mobility'
          | undefined
        return {
          name,
          prev: PREV_PERFORMANCE[name] || '—',
          category: cat,
          sets: Array.from({ length: cat === 'cardio' ? 1 : 3 }, () =>
            newSet(cat),
          ),
        }
      }),
    }
  }

  function resetAndClose() {
    setStep(1)
    setSessionType('')
    setSelectedExercises([])
    setExerciseCategories({})
    onClose()
  }

  function handleStart() {
    onStart(buildActiveSession())
    resetAndClose()
  }

  async function handleSavePlan() {
    if (!planningSession) return
    setSaving(true)
    try {
      await updateSession(planningSession.id, { plan: selectedExercises })
      onPlanned?.()
      resetAndClose()
    } catch (err) {
      console.error('Failed to save plan', err)
      window.alert('Could not save the plan — try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleStartPlanned() {
    if (!planningSession) return
    setSaving(true)
    try {
      const updated = await updateSession(planningSession.id, {
        plan: selectedExercises,
        status: 'active',
      })
      onStart(buildActiveSession(), updated.id)
      resetAndClose()
    } catch (err) {
      console.error('Failed to start session', err)
      window.alert('Could not start the session — try again.')
    } finally {
      setSaving(false)
    }
  }

  function goToStep2() {
    if (!sessionType) return
    setStep(2)
  }

  function goBack() {
    if (isPlanning) return
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
          {/* STEP 1 — session type (skipped when planning an existing session) */}
          {step === 1 && !isPlanning && (
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
                {SESSION_TYPES.map((type) => {
                  const meta = TYPE_META[type]
                  return (
                    <button
                      key={type}
                      onClick={() => selectType(type)}
                      style={typeBtnStyle(type)}
                    >
                      <span style={typeIconStyle(sessionType === type)}>
                        <SessionTypeIcon type={type} size={18} />
                      </span>
                      <div style={typeLabelStyle(sessionType === type)}>
                        {type}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-tertiary)',
                          marginTop: '2px',
                        }}
                      >
                        {meta.desc}
                      </div>
                    </button>
                  )
                })}
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
                {!isPlanning && (
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
                )}
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

              {/* Search input */}
              <input
                value={exerciseSearch}
                onChange={(e) => {
                  setExerciseSearch(e.target.value)
                  setShowCreateFlow(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && showEmpty && !showCreateFlow) {
                    e.preventDefault()
                    setShowCreateFlow(true)
                  }
                }}
                placeholder="Search exercises…"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: 'var(--bg-raised)',
                  border: '1px solid rgba(255,240,200,0.09)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: '10px',
                }}
              />

              {/* Card grid or empty state */}
              {showEmpty ? (
                <div
                  className="fit-empty inset"
                  style={{ marginBottom: '16px' }}
                >
                  <p style={{ margin: '0 0 12px' }}>
                    No exercise matches &ldquo;{exerciseSearch.trim()}&rdquo;
                  </p>
                  {!showCreateFlow ? (
                    <button
                      className="fit-ex-create"
                      onClick={() => setShowCreateFlow(true)}
                    >
                      + Create &ldquo;{exerciseSearch.trim()}&rdquo;
                    </button>
                  ) : (
                    <div
                      className="fit-category-picker"
                      style={{ marginTop: '0' }}
                    >
                      <Segmented
                        value={customCategory}
                        options={['strength', 'cardio', 'mobility']}
                        onChange={(v) => {
                          const cat = v as 'strength' | 'cardio' | 'mobility'
                          setCustomCategory(cat)
                          addCustom(exerciseSearch.trim(), cat)
                        }}
                        labels={{
                          strength: 'Strength',
                          cardio: 'Cardio',
                          mobility: 'Mobility',
                        }}
                        ariaLabel="Custom exercise category"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="fit-ex-grid" style={{ marginBottom: '16px' }}>
                  {filteredCandidates.map((c, i) => {
                    const selected = selectedExercises.includes(c.name)
                    return (
                      <button
                        key={c.name}
                        className={`fit-ex-card${selected ? ' selected' : ''}`}
                        onClick={() => toggleEx(c.name, c.category)}
                        style={
                          {
                            '--enter-delay': `${i * 30}ms`,
                          } as React.CSSProperties
                        }
                      >
                        <span className="fit-ex-card-name">{c.name}</span>
                        <CategoryBadge category={c.category} />
                      </button>
                    )
                  })}
                </div>
              )}

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

              {isPlanning ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleSavePlan}
                    disabled={!canStart || saving}
                    style={{
                      flex: 1,
                      height: '42px',
                      background: 'rgba(255,240,200,0.07)',
                      border: '1px solid rgba(255,240,200,0.09)',
                      borderRadius: '9px',
                      color: 'var(--text-secondary)',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      cursor: canStart && !saving ? 'pointer' : 'default',
                      opacity: canStart && !saving ? 1 : 0.5,
                    }}
                  >
                    Save plan
                  </button>
                  <button
                    onClick={handleStartPlanned}
                    disabled={!canStart || saving}
                    style={{
                      flex: 1,
                      height: '42px',
                      background: canStart
                        ? 'var(--accent-tint)'
                        : 'rgba(255,240,200,0.04)',
                      border: `1px solid ${canStart ? 'var(--accent-tint-border)' : 'rgba(255,240,200,0.07)'}`,
                      borderRadius: '9px',
                      color: canStart
                        ? 'var(--accent)'
                        : 'var(--text-tertiary)',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      cursor: canStart && !saving ? 'pointer' : 'default',
                      transition: 'background .2s, color .2s, border-color .2s',
                    }}
                  >
                    Start now →
                  </button>
                </div>
              ) : (
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
