import { useState, useEffect } from 'react'
import { Segmented } from '../../components/Segmented'
import { CategoryBadge, isCardioName } from './exerciseLibrary'
import {
  createSession,
  fetchExercises,
  createExercise,
  createSetEntry,
  type Exercise,
} from './api'
import { SESSION_TYPES } from './sessionTypes'

interface SetDraft {
  reps: string
  weight: string
  distance_km: string
  duration_min: string
}

interface ExerciseDraft {
  name: string
  category: 'strength' | 'cardio' | 'mobility' | null
  sets: SetDraft[]
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

function emptySet(): SetDraft {
  return { reps: '', weight: '', distance_km: '', duration_min: '' }
}

export function LogPastModal({ open, onClose, onSaved }: Props) {
  const [sessionType, setSessionType] = useState('Push')
  const [defaultCategory, setDefaultCategory] = useState<
    'strength' | 'cardio' | 'mobility'
  >('strength')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [knownExercises, setKnownExercises] = useState<Exercise[]>([])
  const [exercises, setExercises] = useState<ExerciseDraft[]>([])
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    if (open) {
      fetchExercises()
        .then(setKnownExercises)
        .catch(() => setKnownExercises([]))
    }
  }, [open])

  const searchTextLower = searchText.trim().toLowerCase()
  const searchHasMatch = Boolean(
    searchTextLower &&
    knownExercises.some((ex) => ex.name.toLowerCase() === searchTextLower),
  )
  const searchIsUnknown = Boolean(searchTextLower && !searchHasMatch)

  function addExercise() {
    const name = searchText.trim()
    if (!name) return

    // ponytail: skip if already in the list
    if (exercises.some((ex) => ex.name.toLowerCase() === name.toLowerCase())) {
      setSearchText('')
      return
    }

    const matched = knownExercises.find(
      (ex) => ex.name.toLowerCase() === name.toLowerCase(),
    )

    const category: ExerciseDraft['category'] = matched
      ? matched.category
      : defaultCategory

    setExercises((prev) => [
      ...prev,
      {
        name,
        category,
        sets: [emptySet()],
      },
    ])
    setSearchText('')
  }

  function removeExercise(idx: number) {
    setExercises((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateSet(
    exIdx: number,
    setIdx: number,
    field: keyof SetDraft,
    value: string,
  ) {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex
        return {
          ...ex,
          sets: ex.sets.map((s, j) =>
            j === setIdx ? { ...s, [field]: value } : s,
          ),
        }
      }),
    )
  }

  function addSet(exIdx: number) {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex
        const last = ex.sets.at(-1)
        return {
          ...ex,
          sets: [...ex.sets, last ? { ...last } : emptySet()],
        }
      }),
    )
  }

  function removeSet(exIdx: number, setIdx: number) {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex
        return { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) }
      }),
    )
  }

  function setExerciseCategory(
    exIdx: number,
    category: 'strength' | 'cardio' | 'mobility',
  ) {
    setExercises((prev) =>
      prev.map((ex, i) => (i === exIdx ? { ...ex, category } : ex)),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const filled = exercises.filter((ex) => ex.name.trim())
    if (filled.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const d = new Date(date + 'T12:00:00Z')
      const session = await createSession({
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

      const existingExercises = await fetchExercises()
      for (const draft of filled) {
        let exercise = existingExercises.find(
          (ex) => ex.name.toLowerCase() === draft.name.trim().toLowerCase(),
        )
        if (!exercise) {
          exercise = await createExercise({
            name: draft.name.trim(),
            category: draft.category || 'strength',
          })
          existingExercises.push(exercise)
        }
        const isCardio =
          exercise.category === 'cardio' || isCardioName(draft.name)

        for (let s = 0; s < draft.sets.length; s++) {
          const set = draft.sets[s]
          if (isCardio) {
            await createSetEntry(session.id, {
              exercise_id: exercise.id,
              set_number: s + 1,
              distance_km: set.distance_km ? parseFloat(set.distance_km) : null,
              duration_min: set.duration_min
                ? parseFloat(set.duration_min)
                : null,
            })
          } else {
            await createSetEntry(session.id, {
              exercise_id: exercise.id,
              set_number: s + 1,
              reps: parseInt(set.reps, 10) || 0,
              weight: set.weight ? parseInt(set.weight, 10) : null,
            })
          }
        }
      }

      // Reset form
      setExercises([])
      setSearchText('')
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

  return (
    <div
      className="fit-logpast-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      role="presentation"
    >
      <div className="fit-logpast-modal" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="fit-logpast-header">
          <div>
            <h3>Log past workout</h3>
            <p>Record a session you already completed.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="fit-logpast-close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          {/* Session meta: type pills + date */}
          <div className="fit-logpast-meta">
            <div>
              <div className="fit-logpast-label">Session type</div>
              <div className="fit-logpast-pills">
                {SESSION_TYPES.map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setSessionType(t)}
                    className={`fit-type-pill${sessionType === t ? ' active' : ''}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <label className="cal-field">
              <span>Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>

          {/* Exercise search + add */}
          <div>
            <div className="fitness-section-title">Exercises</div>
            <div className="fit-logpast-search">
              <input
                list="fit-logpast-datalist"
                placeholder="Search or add exercise…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addExercise()
                  }
                }}
                className="fit-logpast-search-input"
              />
              <datalist id="fit-logpast-datalist">
                {knownExercises.map((ex) => (
                  <option key={ex.id} value={ex.name} />
                ))}
              </datalist>
              <button
                type="button"
                className="fit-secondary-button"
                onClick={addExercise}
                disabled={!searchText.trim()}
              >
                + Add
              </button>
            </div>

            {/* Default category picker — only when typing an unknown name */}
            {searchIsUnknown && (
              <div
                className="fit-category-picker"
                style={{ marginTop: '10px' }}
              >
                <div className="fit-logpast-label">
                  Category for new exercises
                </div>
                <Segmented
                  value={defaultCategory}
                  options={['strength', 'cardio', 'mobility']}
                  onChange={(v) =>
                    setDefaultCategory(v as 'strength' | 'cardio' | 'mobility')
                  }
                  labels={{
                    strength: 'Strength',
                    cardio: 'Cardio',
                    mobility: 'Mobility',
                  }}
                  ariaLabel="Default exercise category"
                />
              </div>
            )}
          </div>

          {/* Exercise cards */}
          {exercises.length > 0 && (
            <div className="fit-history-exercises">
              {exercises.map((draft, exIdx) => {
                const isCardio =
                  draft.category === 'cardio' || isCardioName(draft.name)
                const wasMatched = knownExercises.some(
                  (ex) => ex.name.toLowerCase() === draft.name.toLowerCase(),
                )

                return (
                  <section className="fit-history-exercise" key={exIdx}>
                    <header>
                      <div className="fit-history-exercise-title">
                        <h4>{draft.name}</h4>
                        {draft.category ? (
                          <CategoryBadge category={draft.category} />
                        ) : (
                          <Segmented
                            value={defaultCategory}
                            options={['strength', 'cardio', 'mobility']}
                            onChange={(v) =>
                              setExerciseCategory(
                                exIdx,
                                v as 'strength' | 'cardio' | 'mobility',
                              )
                            }
                            labels={{
                              strength: 'Str',
                              cardio: 'Card',
                              mobility: 'Mob',
                            }}
                            ariaLabel={`Category for ${draft.name}`}
                          />
                        )}
                        {/* Allow changing category for unmatched exercises */}
                        {draft.category && !wasMatched && (
                          <Segmented
                            value={draft.category}
                            options={['strength', 'cardio', 'mobility']}
                            onChange={(v) =>
                              setExerciseCategory(
                                exIdx,
                                v as 'strength' | 'cardio' | 'mobility',
                              )
                            }
                            labels={{
                              strength: 'Str',
                              cardio: 'Card',
                              mobility: 'Mob',
                            }}
                            ariaLabel={`Change category for ${draft.name}`}
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        className="fit-remove-button"
                        aria-label={`Remove ${draft.name}`}
                        onClick={() => removeExercise(exIdx)}
                      >
                        ×
                      </button>
                    </header>

                    <div className="fit-history-set-list">
                      {draft.sets.map((set, setIdx) => (
                        <div className="fit-history-set" key={setIdx}>
                          <strong>S{setIdx + 1}</strong>
                          {isCardio ? (
                            <>
                              <label>
                                <span>Time</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.1"
                                  value={set.duration_min}
                                  onChange={(e) =>
                                    updateSet(
                                      exIdx,
                                      setIdx,
                                      'duration_min',
                                      e.target.value,
                                    )
                                  }
                                  placeholder="—"
                                />
                              </label>
                              <label>
                                <span>Distance</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  value={set.distance_km}
                                  onChange={(e) =>
                                    updateSet(
                                      exIdx,
                                      setIdx,
                                      'distance_km',
                                      e.target.value,
                                    )
                                  }
                                  placeholder="—"
                                />
                              </label>
                            </>
                          ) : (
                            <>
                              <label>
                                <span>Reps</span>
                                <input
                                  type="number"
                                  value={set.reps}
                                  onChange={(e) =>
                                    updateSet(
                                      exIdx,
                                      setIdx,
                                      'reps',
                                      e.target.value,
                                    )
                                  }
                                  placeholder="8"
                                />
                              </label>
                              <label>
                                <span>kg</span>
                                <input
                                  type="number"
                                  value={set.weight}
                                  onChange={(e) =>
                                    updateSet(
                                      exIdx,
                                      setIdx,
                                      'weight',
                                      e.target.value,
                                    )
                                  }
                                  placeholder="—"
                                />
                              </label>
                            </>
                          )}
                          <button
                            type="button"
                            className="fit-remove-button"
                            aria-label={`Remove set ${setIdx + 1}`}
                            onClick={() => removeSet(exIdx, setIdx)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="fit-logpast-add-set">
                      <button
                        type="button"
                        className="fit-secondary-button"
                        onClick={() => addSet(exIdx)}
                      >
                        + Set
                      </button>
                    </div>
                  </section>
                )
              })}
            </div>
          )}

          {/* Notes */}
          <label className="cal-field">
            <span>Notes / PRs</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bench PR 92 kg · felt strong today…"
              style={{
                minHeight: '60px',
                resize: 'vertical',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--r-md)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                font: '400 13px var(--font-ui)',
                padding: '8px 10px',
                boxSizing: 'border-box',
              }}
            />
          </label>

          {error && (
            <p className="fit-form-error" role="alert">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="fit-primary-button"
            disabled={submitting}
            style={{ width: '100%', height: '42px' }}
          >
            {submitting ? 'Logging…' : 'Log workout'}
          </button>
        </form>
      </div>
    </div>
  )
}
