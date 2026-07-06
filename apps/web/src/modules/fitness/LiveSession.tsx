import { useRef, useState } from 'react'
import { RestTimer } from './RestTimer'
import { Segmented } from '../../components/Segmented'
import { useSettings } from '../../context/SettingsContext'
import {
  PREV_PERFORMANCE,
  isCardioName,
  CategoryBadge,
} from './exerciseLibrary'
import type {
  ActiveExercise,
  ActiveSession,
  ActiveSet,
} from './exerciseLibrary'

interface Props {
  session: ActiveSession
  onUpdate: (session: ActiveSession) => void
  onFinish: () => void
  /** Session-level note, edited near the finish action (event workout notes
   * prefill this when a session was started from a planned/linked event). */
  note?: string
  onNoteChange?: (value: string) => void
}

const FEELING_LABELS = ['Dying', 'Rough', 'OK', 'Good', 'Great']

export function newSet(category: ActiveExercise['category']): ActiveSet {
  return category === 'cardio'
    ? { w: '', r: '', done: false, distance_km: '', duration_min: '' }
    : { w: '', r: '', done: false }
}

export function LiveSession({
  session,
  onUpdate,
  onFinish,
  note = '',
  onNoteChange,
}: Props) {
  const { settings } = useSettings()
  const [restCount, setRestCount] = useState(0)
  const [restTotal, setRestTotal] = useState(settings.fitness_rest_seconds)
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set())
  const [addingExercise, setAddingExercise] = useState(false)
  const [exerciseName, setExerciseName] = useState('')
  const [newExerciseCategory, setNewExerciseCategory] = useState<
    'strength' | 'cardio' | 'mobility'
  >('strength')
  const restInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  function startRest() {
    if (restInterval.current) clearInterval(restInterval.current)
    setRestCount(settings.fitness_rest_seconds)
    setRestTotal(settings.fitness_rest_seconds)
    restInterval.current = setInterval(() => {
      setRestCount((count) => {
        if (count <= 1) {
          if (restInterval.current) clearInterval(restInterval.current)
          return 0
        }
        return count - 1
      })
    }, 1000)
  }

  function updateExercise(exerciseIndex: number, update: ActiveExercise) {
    onUpdate({
      ...session,
      exercises: session.exercises.map((exercise, index) =>
        index === exerciseIndex ? update : exercise,
      ),
    })
  }

  function updateSet(
    exerciseIndex: number,
    setIndex: number,
    data: Partial<ActiveSet>,
  ) {
    const exercise = session.exercises[exerciseIndex]
    updateExercise(exerciseIndex, {
      ...exercise,
      sets: exercise.sets.map((set, index) =>
        index === setIndex ? { ...set, ...data } : set,
      ),
    })
  }

  function toggleDone(exerciseIndex: number, setIndex: number) {
    const exercise = session.exercises[exerciseIndex]
    const set = exercise.sets[setIndex]
    updateSet(exerciseIndex, setIndex, { done: !set.done })
    if (
      !set.done &&
      exercise.category !== 'cardio' &&
      settings.fitness_auto_start_rest
    )
      startRest()
  }

  function addSet(exerciseIndex: number) {
    const exercise = session.exercises[exerciseIndex]
    updateExercise(exerciseIndex, {
      ...exercise,
      sets: [...exercise.sets, newSet(exercise.category)],
    })
  }

  function removeSet(exerciseIndex: number, setIndex: number) {
    const exercise = session.exercises[exerciseIndex]
    updateExercise(exerciseIndex, {
      ...exercise,
      sets: exercise.sets.filter((_, index) => index !== setIndex),
    })
  }

  function toggleNote(exerciseIndex: number, setIndex: number) {
    const key = `${exerciseIndex}-${setIndex}`
    setOpenNotes((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function addExercise() {
    const name = exerciseName.trim()
    if (!name) return
    const category = newExerciseCategory
    onUpdate({
      ...session,
      exercises: [
        ...session.exercises,
        {
          name,
          prev: PREV_PERFORMANCE[name] || '-',
          category,
          sets: Array.from({ length: category === 'cardio' ? 1 : 3 }, () =>
            newSet(category),
          ),
        },
      ],
    })
    setExerciseName('')
    setNewExerciseCategory('strength')
    setAddingExercise(false)
  }

  function finish() {
    if (restInterval.current) clearInterval(restInterval.current)
    onFinish()
  }

  return (
    <section className="fit-live" aria-labelledby="live-session-title">
      <header className="fit-live-header">
        <div className="fit-live-status">
          <span aria-hidden="true" />
          <strong id="live-session-title">Session live</strong>
        </div>
        <button className="fit-primary-button" type="button" onClick={finish}>
          Finish workout
        </button>
      </header>

      {restCount > 0 ? (
        <RestTimer
          restCount={restCount}
          restTotal={restTotal}
          onSkip={() => {
            if (restInterval.current) clearInterval(restInterval.current)
            setRestCount(0)
          }}
        />
      ) : (
        !settings.fitness_auto_start_rest && (
          <button
            type="button"
            className="fit-secondary-button"
            onClick={startRest}
            style={{ marginBottom: 16 }}
          >
            Start rest timer
          </button>
        )
      )}

      <div className="fit-live-exercises">
        {session.exercises.map((exercise, exerciseIndex) => {
          const isCardio = exercise.category === 'cardio'
          return (
            <article
              className="fit-live-exercise"
              key={`${exercise.name}-${exerciseIndex}`}
            >
              <header>
                <div>
                  <h3
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {exercise.name}
                    {exercise.category && (
                      <CategoryBadge category={exercise.category} />
                    )}
                  </h3>
                  <p>Previous: {exercise.prev}</p>
                </div>
                <button
                  className="fit-secondary-button"
                  type="button"
                  onClick={() => addSet(exerciseIndex)}
                >
                  + Set
                </button>
              </header>

              {exercise.sets.length === 0 ? (
                <p className="fit-empty inset">
                  No sets logged yet. Add a set to continue.
                </p>
              ) : (
                <div className="fit-live-table">
                  <div className="fit-live-row head" aria-hidden="true">
                    <span>Set</span>
                    <span>
                      {isCardio ? 'Distance' : settings.fitness_weight_unit}
                    </span>
                    <span>{isCardio ? 'Time' : 'reps'}</span>
                    <span>Feel</span>
                    <span>Done</span>
                    <span />
                  </div>
                  {exercise.sets.map((set, setIndex) => {
                    const noteKey = `${exerciseIndex}-${setIndex}`
                    return (
                      <div
                        className={`fit-live-row${set.done ? ' done' : ''}`}
                        key={setIndex}
                      >
                        <strong className="fit-live-num">{setIndex + 1}</strong>

                        {isCardio ? (
                          <>
                            <input
                              className="fit-live-cell"
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              value={set.distance_km ?? ''}
                              placeholder="-"
                              aria-label={`${exercise.name} set ${setIndex + 1} distance`}
                              onChange={(event) =>
                                updateSet(exerciseIndex, setIndex, {
                                  distance_km: event.target.value,
                                })
                              }
                            />
                            <input
                              className="fit-live-cell"
                              type="number"
                              inputMode="decimal"
                              step="0.1"
                              value={set.duration_min ?? ''}
                              placeholder="0"
                              aria-label={`${exercise.name} set ${setIndex + 1} duration`}
                              onChange={(event) =>
                                updateSet(exerciseIndex, setIndex, {
                                  duration_min: event.target.value,
                                })
                              }
                            />
                          </>
                        ) : (
                          <>
                            <input
                              className="fit-live-cell"
                              type="number"
                              inputMode="decimal"
                              value={set.w}
                              placeholder="-"
                              aria-label={`${exercise.name} set ${setIndex + 1} weight`}
                              onChange={(event) =>
                                updateSet(exerciseIndex, setIndex, {
                                  w: event.target.value,
                                })
                              }
                            />
                            <input
                              className="fit-live-cell"
                              type="number"
                              inputMode="numeric"
                              value={set.r}
                              placeholder="0"
                              aria-label={`${exercise.name} set ${setIndex + 1} reps`}
                              onChange={(event) =>
                                updateSet(exerciseIndex, setIndex, {
                                  r: event.target.value,
                                })
                              }
                            />
                          </>
                        )}

                        <fieldset
                          className="fit-feeling"
                          aria-label={`${exercise.name} set ${setIndex + 1} feeling`}
                        >
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
                                  updateSet(exerciseIndex, setIndex, {
                                    feeling:
                                      set.feeling === feeling ? null : feeling,
                                  })
                                }
                              >
                                <span />
                              </button>
                            )
                          })}
                        </fieldset>

                        <button
                          className="fit-live-check"
                          type="button"
                          aria-label={`Mark set ${setIndex + 1} ${set.done ? 'not done' : 'done'}`}
                          aria-pressed={set.done}
                          onClick={() => toggleDone(exerciseIndex, setIndex)}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M2.5 8.5l3.5 3.5 7.5-8" />
                          </svg>
                        </button>

                        <div className="fit-live-tools">
                          <button
                            className={`fit-live-icon-btn${set.note ? ' active' : ''}`}
                            type="button"
                            aria-label={`${set.note ? 'Edit' : 'Add'} note for set ${setIndex + 1}`}
                            aria-expanded={openNotes.has(noteKey)}
                            onClick={() => toggleNote(exerciseIndex, setIndex)}
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M3 2.5h10v8H8l-3.5 3v-3H3z" />
                            </svg>
                          </button>
                          <button
                            className="fit-live-icon-btn danger"
                            type="button"
                            aria-label={`Remove set ${setIndex + 1}`}
                            onClick={() => removeSet(exerciseIndex, setIndex)}
                          >
                            ×
                          </button>
                        </div>

                        {openNotes.has(noteKey) && (
                          <label className="fit-live-note">
                            <input
                              value={set.note ?? ''}
                              maxLength={500}
                              aria-label={`Set ${setIndex + 1} note`}
                              placeholder="Technique, pain, or anything worth remembering"
                              onChange={(event) =>
                                updateSet(exerciseIndex, setIndex, {
                                  note: event.target.value,
                                })
                              }
                            />
                          </label>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </article>
          )
        })}
      </div>

      {addingExercise ? (
        <form
          className="fit-add-exercise"
          onSubmit={(event) => {
            event.preventDefault()
            addExercise()
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="cal-field">
              <span>Exercise name</span>
              <input
                value={exerciseName}
                onChange={(event) => {
                  const val = event.target.value
                  setExerciseName(val)
                  // Smart-default: if typed name matches cardio library, switch picker
                  if (isCardioName(val.trim())) {
                    setNewExerciseCategory('cardio')
                  }
                }}
                placeholder="e.g. Incline bench press"
              />
            </label>
            <button
              className="fit-primary-button"
              type="submit"
              disabled={!exerciseName.trim()}
            >
              Add
            </button>
            <button
              className="fit-secondary-button"
              type="button"
              onClick={() => setAddingExercise(false)}
            >
              Cancel
            </button>
          </div>
          <div
            className="fit-category-picker"
            style={{ alignSelf: 'flex-start', maxWidth: '280px' }}
          >
            <Segmented
              value={newExerciseCategory}
              options={['strength', 'cardio', 'mobility']}
              onChange={(v) =>
                setNewExerciseCategory(v as 'strength' | 'cardio' | 'mobility')
              }
              labels={{
                strength: 'Strength',
                cardio: 'Cardio',
                mobility: 'Mobility',
              }}
              ariaLabel="Exercise category"
            />
          </div>
        </form>
      ) : (
        <button
          className="fit-add-exercise-trigger"
          type="button"
          onClick={() => setAddingExercise(true)}
        >
          + Add exercise
        </button>
      )}

      <label className="fit-live-note-section cal-field">
        <span>Workout note</span>
        <textarea
          value={note}
          maxLength={2000}
          placeholder="How did it feel? Anything worth remembering for next time."
          onChange={(event) => onNoteChange?.(event.target.value)}
        />
      </label>
    </section>
  )
}
