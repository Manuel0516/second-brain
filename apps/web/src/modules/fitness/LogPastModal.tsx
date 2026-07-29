import { useId, useRef, useState, useEffect } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Segmented } from '../../components/Segmented'
import { useDialogFocus } from '../../components/useDialogFocus'
import { FEELING_LABELS, isCardioName } from './exerciseData'
import { CategoryBadge } from './exerciseLibrary'
import {
  createSession,
  fetchExercises,
  createExercise,
  createSetEntry,
  type Exercise,
} from './api'
import { SESSION_TYPES } from './sessionTypeData'
import { useSettings } from '../../context/settings'
import { fromDisplayWeight } from './units'

interface SetDraft {
  reps: string
  weight: string
  distance_km: string
  duration_min: string
  feeling: number | null
  notes: string
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
  return {
    reps: '',
    weight: '',
    distance_km: '',
    duration_min: '',
    feeling: null,
    notes: '',
  }
}

interface DraftSnapshot {
  sessionType: string
  date: string
  notes: string
  exercises: ExerciseDraft[]
}

export function LogPastModal({ open, onClose, onSaved }: Props) {
  const { settings } = useSettings()
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
  const [editCategoryIdx, setEditCategoryIdx] = useState<number | null>(null)
  const [baseline, setBaseline] = useState<DraftSnapshot | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      fetchExercises()
        .then(setKnownExercises)
        .catch(() => setKnownExercises([]))
    }
  }, [open])

  // Snapshot whatever the form holds the moment it opens — including a
  // leftover unsaved draft from a previous open — as the "clean" baseline.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBaseline({ sessionType, date, notes, exercises })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function isDirty(): boolean {
    if (!baseline) return false
    return (
      sessionType !== baseline.sessionType ||
      date !== baseline.date ||
      notes !== baseline.notes ||
      JSON.stringify(exercises) !== JSON.stringify(baseline.exercises)
    )
  }

  function requestClose() {
    if (submitting) return
    if (isDirty()) {
      setConfirmDiscard(true)
      return
    }
    onClose()
  }

  useDialogFocus({
    open,
    dialogRef,
    onEscape: requestClose,
  })

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
    field: 'reps' | 'weight' | 'distance_km' | 'duration_min' | 'notes',
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

  function updateSetFeeling(
    exIdx: number,
    setIdx: number,
    feeling: number | null,
  ) {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex
        return {
          ...ex,
          sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, feeling } : s)),
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
          sets: [
            ...ex.sets,
            last ? { ...last, feeling: null, notes: '' } : emptySet(),
          ],
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
              feeling: set.feeling,
              notes: set.notes.trim() || null,
            })
          } else {
            await createSetEntry(session.id, {
              exercise_id: exercise.id,
              set_number: s + 1,
              reps: parseInt(set.reps, 10) || 0,
              weight: set.weight
                ? fromDisplayWeight(
                    parseInt(set.weight, 10),
                    settings.fitness_weight_unit,
                  )
                : null,
              feeling: set.feeling,
              notes: set.notes.trim() || null,
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
        if (e.target === e.currentTarget) requestClose()
      }}
      role="presentation"
    >
      <div
        className="fit-logpast-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
      >
        {/* Header */}
        <div className="fit-logpast-header">
          <div>
            <h3 id={titleId}>Log past workout</h3>
            <p>Record a session you already completed.</p>
          </div>
          <button
            type="button"
            onClick={requestClose}
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
              <Segmented
                value={sessionType}
                options={[...SESSION_TYPES]}
                onChange={setSessionType}
                ariaLabel="Session type"
              />
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
                        {!draft.category || editCategoryIdx === exIdx ? (
                          <Segmented
                            value={draft.category ?? defaultCategory}
                            options={['strength', 'cardio', 'mobility']}
                            onChange={(v) => {
                              setExerciseCategory(
                                exIdx,
                                v as 'strength' | 'cardio' | 'mobility',
                              )
                              setEditCategoryIdx(null)
                            }}
                            labels={{
                              strength: 'Str',
                              cardio: 'Card',
                              mobility: 'Mob',
                            }}
                            ariaLabel={`Category for ${draft.name}`}
                          />
                        ) : (
                          <button
                            type="button"
                            className="fit-category-badge-button"
                            disabled={wasMatched}
                            onClick={() => setEditCategoryIdx(exIdx)}
                            aria-label={
                              wasMatched
                                ? undefined
                                : `Change category for ${draft.name}`
                            }
                          >
                            <CategoryBadge category={draft.category} />
                          </button>
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
                          <button
                            type="button"
                            className="fit-remove-button"
                            aria-label={`Remove set ${setIdx + 1}`}
                            onClick={() => removeSet(exIdx, setIdx)}
                          >
                            ×
                          </button>
                          <div className="fit-history-set-fields">
                            {isCardio ? (
                              <>
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
                                  <span>{settings.fitness_weight_unit}</span>
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
                          </div>
                          <fieldset
                            className="fit-feeling"
                            aria-label={`${draft.name} set ${setIdx + 1} feeling`}
                          >
                            <span aria-hidden="true">Feel</span>
                            {FEELING_LABELS.map((label, feelingIndex) => {
                              const feeling = feelingIndex + 1
                              return (
                                <button
                                  key={label}
                                  type="button"
                                  className={
                                    set.feeling === feeling ? 'active' : ''
                                  }
                                  aria-label={label}
                                  aria-pressed={set.feeling === feeling}
                                  title={label}
                                  onClick={() =>
                                    updateSetFeeling(
                                      exIdx,
                                      setIdx,
                                      set.feeling === feeling ? null : feeling,
                                    )
                                  }
                                >
                                  <span />
                                </button>
                              )
                            })}
                          </fieldset>
                          <label className="fit-history-set-note">
                            <span>Set note</span>
                            <input
                              value={set.notes}
                              maxLength={500}
                              placeholder="Add a note"
                              onChange={(e) =>
                                updateSet(
                                  exIdx,
                                  setIdx,
                                  'notes',
                                  e.target.value,
                                )
                              }
                            />
                          </label>
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
      <ConfirmDialog
        open={confirmDiscard}
        message="Discard changes?"
        detail="This logged workout hasn't been saved yet."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          onClose()
        }}
      />
    </div>
  )
}
