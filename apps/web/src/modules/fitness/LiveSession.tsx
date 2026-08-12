import { useEffect, useRef, useState } from 'react'
import { RestTimer } from './RestTimer'
import { Segmented } from '../../components/Segmented'
import { useSettings } from '../../context/SettingsContext'
import {
  PREV_PERFORMANCE,
  FEELING_LABELS,
  isCardioName,
  CategoryBadge,
  mergeExerciseCandidates,
} from './exerciseLibrary'
import type {
  ActiveExercise,
  ActiveSession,
  ActiveSet,
} from './exerciseLibrary'
import { fetchExercises, type Exercise } from './api'

interface Props {
  session: ActiveSession
  onUpdate: (session: ActiveSession) => void
  onFinish: () => void
  /** Session-level note, edited near the finish action (event workout notes
   * prefill this when a session was started from a planned/linked event). */
  note?: string
  onNoteChange?: (value: string) => void
}

const SET_DELETE_REVEAL = 48

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
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [dbExercises, setDbExercises] = useState<Exercise[]>([])
  const [revealedSet, setRevealedSet] = useState<string | null>(null)
  const [newExerciseCategory, setNewExerciseCategory] = useState<
    'strength' | 'cardio' | 'mobility'
  >('strength')
  const restInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const restEndsAt = useRef<number | null>(null)
  const setSwipeRef = useRef<{
    key: string
    pointerId: number
    startX: number
    startY: number
    baseOffset: number
    offset: number
    swiping: boolean
  } | null>(null)
  const suppressSetClickRef = useRef<string | null>(null)

  function refreshRest() {
    if (!restEndsAt.current) return
    const remaining = Math.max(
      0,
      Math.ceil((restEndsAt.current - Date.now()) / 1000),
    )
    setRestCount(remaining)
    if (remaining === 0) {
      restEndsAt.current = null
      if (restInterval.current) clearInterval(restInterval.current)
      restInterval.current = null
    }
  }

  function startRest() {
    if (restInterval.current) clearInterval(restInterval.current)
    restEndsAt.current = Date.now() + settings.fitness_rest_seconds * 1000
    setRestTotal(settings.fitness_rest_seconds)
    refreshRest()
    restInterval.current = setInterval(refreshRest, 250)
  }

  useEffect(() => {
    if (!addingExercise) return
    fetchExercises()
      .then(setDbExercises)
      .catch(() => setDbExercises([]))
  }, [addingExercise])

  useEffect(() => {
    function handleVisibilityChange() {
      if (!document.hidden) refreshRest()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (restInterval.current) clearInterval(restInterval.current)
    }
  }, [])

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
    setRevealedSet(null)
    updateExercise(exerciseIndex, {
      ...exercise,
      sets: exercise.sets.filter((_, index) => index !== setIndex),
    })
  }

  function startSetSwipe(
    event: React.PointerEvent<HTMLDivElement>,
    key: string,
  ) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const baseOffset = revealedSet === key ? -SET_DELETE_REVEAL : 0
    if (revealedSet && revealedSet !== key) setRevealedSet(null)
    setSwipeRef.current = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseOffset,
      offset: baseOffset,
      swiping: false,
    }
  }

  function moveSetSwipe(
    event: React.PointerEvent<HTMLDivElement>,
    key: string,
  ) {
    const swipe = setSwipeRef.current
    if (!swipe || swipe.key !== key || swipe.pointerId !== event.pointerId)
      return

    const deltaX = event.clientX - swipe.startX
    const deltaY = event.clientY - swipe.startY
    if (!swipe.swiping) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        event.currentTarget.style.transform = 'translateX(0)'
        setRevealedSet(null)
        setSwipeRef.current = null
        return
      }
      swipe.swiping = true
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.classList.add('swiping')
    }

    event.preventDefault()
    swipe.offset = Math.max(
      -SET_DELETE_REVEAL,
      Math.min(0, swipe.baseOffset + deltaX),
    )
    event.currentTarget.style.transform = `translateX(${swipe.offset}px)`
  }

  function finishSetSwipe(
    event: React.PointerEvent<HTMLDivElement>,
    key: string,
  ) {
    const swipe = setSwipeRef.current
    if (!swipe || swipe.key !== key || swipe.pointerId !== event.pointerId)
      return
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)

    if (swipe.swiping) {
      const nextRevealed = swipe.offset <= -SET_DELETE_REVEAL / 2 ? key : null
      event.currentTarget.classList.remove('swiping')
      event.currentTarget.style.transform = `translateX(${
        nextRevealed ? -SET_DELETE_REVEAL : 0
      }px)`
      setRevealedSet(nextRevealed)
      suppressSetClickRef.current = key
      window.setTimeout(() => {
        if (suppressSetClickRef.current === key)
          suppressSetClickRef.current = null
      }, 0)
    } else if (swipe.baseOffset < 0) {
      setRevealedSet(null)
    }
    setSwipeRef.current = null
  }

  function cancelSetSwipe(
    event: React.PointerEvent<HTMLDivElement>,
    key: string,
  ) {
    const swipe = setSwipeRef.current
    if (!swipe || swipe.key !== key || swipe.pointerId !== event.pointerId)
      return
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    event.currentTarget.classList.remove('swiping')
    event.currentTarget.style.transform = `translateX(${swipe.baseOffset}px)`
    setSwipeRef.current = null
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
    setExerciseSearch('')
    setNewExerciseCategory('strength')
    setAddingExercise(false)
  }

  function finish() {
    restEndsAt.current = null
    if (restInterval.current) clearInterval(restInterval.current)
    restInterval.current = null
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
            restEndsAt.current = null
            restInterval.current = null
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
                <div className="fit-live-exercise-copy">
                  <h3>
                    {exercise.name}
                    {exercise.category && (
                      <CategoryBadge category={exercise.category} />
                    )}
                  </h3>
                  <p>Previous: {exercise.prev}</p>
                  <p>Feel: Low → High</p>
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
                    <span>Note</span>
                    <span>Done</span>
                  </div>
                  {exercise.sets.map((set, setIndex) => {
                    const noteKey = `${exerciseIndex}-${setIndex}`
                    const swipeOffset =
                      revealedSet === noteKey ? -SET_DELETE_REVEAL : 0
                    return (
                      <div className="fit-live-row-shell" key={setIndex}>
                        <button
                          className="fit-live-swipe-delete"
                          type="button"
                          aria-label={`Remove set ${setIndex + 1}`}
                          onFocus={() => setRevealedSet(noteKey)}
                          onClick={() => removeSet(exerciseIndex, setIndex)}
                        >
                          ×
                        </button>
                        <div
                          className={`fit-live-row${set.done ? ' done' : ''}`}
                          style={{ transform: `translateX(${swipeOffset}px)` }}
                          onPointerDown={(event) =>
                            startSetSwipe(event, noteKey)
                          }
                          onPointerMove={(event) =>
                            moveSetSwipe(event, noteKey)
                          }
                          onPointerUp={(event) =>
                            finishSetSwipe(event, noteKey)
                          }
                          onPointerCancel={(event) =>
                            cancelSetSwipe(event, noteKey)
                          }
                          onClickCapture={(event) => {
                            if (suppressSetClickRef.current !== noteKey) return
                            event.preventDefault()
                            event.stopPropagation()
                            suppressSetClickRef.current = null
                          }}
                        >
                          <strong className="fit-live-num">
                            {setIndex + 1}
                          </strong>

                          {isCardio ? (
                            <>
                              <div className="fit-live-cell">
                                <input
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
                                <span>km</span>
                              </div>
                              <div className="fit-live-cell">
                                <input
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
                                <span>min</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="fit-live-cell">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  value={set.w}
                                  placeholder="-"
                                  aria-label={`${exercise.name} set ${setIndex + 1} weight`}
                                  onChange={(event) =>
                                    updateSet(exerciseIndex, setIndex, {
                                      w: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="fit-live-cell">
                                <input
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
                              </div>
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
                                        set.feeling === feeling
                                          ? null
                                          : feeling,
                                    })
                                  }
                                >
                                  <span />
                                </button>
                              )
                            })}
                          </fieldset>

                          <button
                            className={`fit-live-icon-btn fit-live-note-button${set.note ? ' active' : ''}`}
                            type="button"
                            aria-label={`${set.note ? 'Edit' : 'Add'} note for set ${setIndex + 1}`}
                            aria-expanded={openNotes.has(noteKey)}
                            onClick={() => toggleNote(exerciseIndex, setIndex)}
                          >
                            <svg
                              width="15"
                              height="15"
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
              <span>Search exercises</span>
              <input
                value={exerciseSearch}
                onChange={(event) => {
                  const val = event.target.value
                  setExerciseSearch(val)
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
          <div className="fit-ex-grid" style={{ margin: '12px 0 16px' }}>
            {mergeExerciseCandidates(dbExercises, session.type)
              .filter((candidate) =>
                candidate.name
                  .toLowerCase()
                  .includes(exerciseSearch.trim().toLowerCase()),
              )
              .map((candidate) => (
                <button
                  key={candidate.name}
                  type="button"
                  className={`fit-ex-card${exerciseName === candidate.name ? ' selected' : ''}`}
                  onClick={() => {
                    setExerciseName(candidate.name)
                    setNewExerciseCategory(
                      candidate.category as 'strength' | 'cardio' | 'mobility',
                    )
                  }}
                >
                  <span className="fit-ex-card-name">{candidate.name}</span>
                  <CategoryBadge category={candidate.category} />
                </button>
              ))}
          </div>
          {exerciseSearch.trim() &&
            !mergeExerciseCandidates(dbExercises, session.type).some(
              (candidate) =>
                candidate.name.toLowerCase() ===
                exerciseSearch.trim().toLowerCase(),
            ) && (
              <button
                type="button"
                className="fit-ex-create"
                onClick={() => setExerciseName(exerciseSearch.trim())}
              >
                + Create “{exerciseSearch.trim()}”
              </button>
            )}
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
