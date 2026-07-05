import { useEffect, useState } from 'react'
import { Dropdown } from '../../components/Dropdown'
import type { SetEntry, WorkoutSession } from './api'
import {
  createSetEntry,
  deleteSession,
  deleteSetEntry,
  fetchExercises,
  fetchSessions,
  fetchSetEntries,
  updateSession,
  updateSetEntry,
} from './api'
import { CategoryBadge, isCardioName } from './exerciseLibrary'

const FEELING_LABELS = ['Dying', 'Rough', 'OK', 'Good', 'Great']

function noteText(notes: Record<string, unknown>): string {
  const content = Array.isArray(notes.content) ? notes.content : []
  return content
    .flatMap((block) =>
      block && typeof block === 'object' && Array.isArray(block.content)
        ? block.content
        : [],
    )
    .map((node) =>
      node && typeof node === 'object' && typeof node.text === 'string'
        ? node.text
        : '',
    )
    .filter(Boolean)
    .join('\n')
}

function noteDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: text.trim()
      ? [{ type: 'paragraph', content: [{ type: 'text', text: text.trim() }] }]
      : [],
  }
}

export function SessionForm() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editType, setEditType] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editSets, setEditSets] = useState<SetEntry[]>([])
  const [exerciseNames, setExerciseNames] = useState<Record<string, string>>({})
  const [exerciseCategories, setExerciseCategories] = useState<
    Record<string, string>
  >({})
  const [addExerciseId, setAddExerciseId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function reloadSessions() {
    setLoading(true)
    setError(null)
    try {
      setSessions(await fetchSessions())
    } catch {
      setError('Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSessions()
      .then(setSessions)
      .catch(() => setError('Failed to load sessions'))
      .finally(() => setLoading(false))
  }, [])

  async function startEditing(session: WorkoutSession) {
    setEditingId(session.id)
    setEditType(session.type)
    setEditDate(new Date(session.date).toISOString().slice(0, 10))
    setEditNote(noteText(session.notes))
    setAddExerciseId('')
    setError(null)
    try {
      const [sets, exercises] = await Promise.all([
        fetchSetEntries(session.id),
        fetchExercises(),
      ])
      setEditSets(sets)
      setExerciseNames(
        Object.fromEntries(
          exercises.map((exercise) => [exercise.id, exercise.name]),
        ),
      )
      setExerciseCategories(
        Object.fromEntries(
          exercises.map((exercise) => [exercise.id, exercise.category]),
        ),
      )
    } catch {
      setEditSets([])
      setError('Failed to load workout details')
    }
  }

  async function saveSession(sessionId: string) {
    setBusy('session')
    try {
      await updateSession(sessionId, {
        date: new Date(`${editDate}T12:00:00Z`).toISOString(),
        type: editType.trim(),
        notes: noteDoc(editNote),
      })
      setEditingId(null)
      await reloadSessions()
    } catch {
      setError('Failed to save workout')
    } finally {
      setBusy(null)
    }
  }

  async function updateSet(
    setId: string,
    data: Partial<
      Pick<
        SetEntry,
        'reps' | 'weight' | 'distance_km' | 'duration_min' | 'feeling' | 'notes'
      >
    >,
  ) {
    if (!editingId) return
    setBusy(setId)
    try {
      const updated = await updateSetEntry(editingId, setId, data)
      setEditSets((current) =>
        current.map((set) => (set.id === setId ? updated : set)),
      )
    } catch {
      setError('Failed to update set')
    } finally {
      setBusy(null)
    }
  }

  async function removeSet(setId: string) {
    if (!editingId) return
    setBusy(setId)
    try {
      await deleteSetEntry(editingId, setId)
      setEditSets((current) => current.filter((set) => set.id !== setId))
    } catch {
      setError('Failed to delete set')
    } finally {
      setBusy(null)
    }
  }

  async function addSet(exerciseId: string) {
    if (!editingId || !exerciseId) return
    setBusy('add')
    try {
      const existing = editSets.filter((set) => set.exercise_id === exerciseId)
      const last = existing.at(-1)
      const exerciseCategory = exerciseCategories[exerciseId]
      const cardio =
        exerciseCategory === 'cardio' ||
        isCardioName(exerciseNames[exerciseId] || '')
      const created = await createSetEntry(editingId, {
        exercise_id: exerciseId,
        set_number: existing.length
          ? Math.max(...existing.map((set) => set.set_number)) + 1
          : 1,
        ...(cardio
          ? {
              distance_km: last?.distance_km ?? null,
              duration_min: last?.duration_min ?? null,
            }
          : {
              reps: last?.reps ?? 8,
              weight: last?.weight ?? null,
            }),
      })
      setEditSets((current) => [...current, created])
    } catch {
      setError('Failed to add set')
    } finally {
      setBusy(null)
    }
  }

  async function removeSession(sessionId: string) {
    setDeleting(sessionId)
    try {
      await deleteSession(sessionId)
      await reloadSessions()
    } catch {
      setError('Failed to delete session')
    } finally {
      setDeleting(null)
    }
  }

  const groups = Object.entries(
    editSets.reduce<Record<string, SetEntry[]>>((result, set) => {
      ;(result[set.exercise_id] ??= []).push(set)
      return result
    }, {}),
  )
  const visibleSessions = showAll ? sessions : sessions.slice(0, 3)

  return (
    <section className="fit-history" aria-labelledby="workout-history-title">
      <h3 id="workout-history-title" className="fitness-section-title">
        Recent Sessions
      </h3>
      {error && (
        <p className="fit-form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="fit-empty">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="fit-empty">
          No sessions yet. Log your first workout above.
        </p>
      ) : (
        <div className="fit-history-list">
          {visibleSessions.map((session, index) => (
            <article
              key={session.id}
              className={`fit-history-session${editingId === session.id ? ' editing' : ''}`}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              {editingId === session.id ? (
                <div className="fit-history-editor">
                  <div className="fit-history-fields">
                    <label className="cal-field">
                      <span>Date</span>
                      <input
                        type="date"
                        value={editDate}
                        onChange={(event) => setEditDate(event.target.value)}
                      />
                    </label>
                    <label className="cal-field">
                      <span>Workout</span>
                      <input
                        value={editType}
                        onChange={(event) => setEditType(event.target.value)}
                        placeholder="Workout type"
                      />
                    </label>
                  </div>
                  <label className="cal-field">
                    <span>Workout note</span>
                    <textarea
                      value={editNote}
                      onChange={(event) => setEditNote(event.target.value)}
                      placeholder="How did the workout go?"
                      rows={2}
                    />
                  </label>

                  <div className="fit-history-exercises">
                    {groups.map(([exerciseId, sets]) => (
                      <section
                        className="fit-history-exercise"
                        key={exerciseId}
                      >
                        <header>
                          <div>
                            <div className="fit-history-exercise-title">
                              <h4>{exerciseNames[exerciseId] || 'Exercise'}</h4>
                              {(exerciseCategories[exerciseId] === 'cardio' ||
                                isCardioName(
                                  exerciseNames[exerciseId] || '',
                                )) && <CategoryBadge category="cardio" />}
                            </div>
                            <span>
                              {sets.length} {sets.length === 1 ? 'set' : 'sets'}
                            </span>
                          </div>
                          <button
                            className="fit-secondary-button"
                            type="button"
                            onClick={() => void addSet(exerciseId)}
                            disabled={busy === 'add'}
                          >
                            + Set
                          </button>
                        </header>
                        <div className="fit-history-set-list">
                          {sets
                            .sort((a, b) => a.set_number - b.set_number)
                            .map((set) => (
                              <div
                                className="fit-history-set"
                                key={set.id}
                                data-cardio={
                                  exerciseCategories[exerciseId] === 'cardio' ||
                                  isCardioName(exerciseNames[exerciseId] || '')
                                    ? 'true'
                                    : 'false'
                                }
                              >
                                <strong>S{set.set_number}</strong>
                                {exerciseCategories[exerciseId] === 'cardio' ||
                                isCardioName(
                                  exerciseNames[exerciseId] || '',
                                ) ? (
                                  <>
                                    <label>
                                      <span>Distance</span>
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        defaultValue={set.distance_km ?? ''}
                                        min={0}
                                        placeholder="-"
                                        onBlur={(event) => {
                                          const value = event.target.value
                                            ? Number(event.target.value)
                                            : null
                                          if (value !== set.distance_km)
                                            void updateSet(set.id, {
                                              distance_km: value,
                                            })
                                        }}
                                      />
                                    </label>
                                    <label>
                                      <span>Time</span>
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        step="0.1"
                                        defaultValue={set.duration_min ?? ''}
                                        min={0}
                                        placeholder="-"
                                        onBlur={(event) => {
                                          const value = event.target.value
                                            ? Number(event.target.value)
                                            : null
                                          if (value !== set.duration_min)
                                            void updateSet(set.id, {
                                              duration_min: value,
                                            })
                                        }}
                                      />
                                    </label>
                                  </>
                                ) : (
                                  <>
                                    <label>
                                      <span>Reps</span>
                                      <input
                                        type="number"
                                        defaultValue={set.reps ?? ''}
                                        min={0}
                                        onBlur={(event) => {
                                          const value = Number(
                                            event.target.value,
                                          )
                                          if (
                                            Number.isFinite(value) &&
                                            value !== set.reps
                                          )
                                            void updateSet(set.id, {
                                              reps: value,
                                            })
                                        }}
                                      />
                                    </label>
                                    <label>
                                      <span>Weight</span>
                                      <input
                                        type="number"
                                        defaultValue={set.weight ?? ''}
                                        min={0}
                                        step="0.5"
                                        placeholder="-"
                                        onBlur={(event) => {
                                          const value = event.target.value
                                            ? Number(event.target.value)
                                            : null
                                          if (value !== set.weight)
                                            void updateSet(set.id, {
                                              weight: value,
                                            })
                                        }}
                                      />
                                    </label>
                                  </>
                                )}
                                <fieldset
                                  className="fit-feeling"
                                  aria-label={`Set ${set.set_number} feeling`}
                                >
                                  {FEELING_LABELS.map((label, feelingIndex) => {
                                    const feeling = feelingIndex + 1
                                    return (
                                      <button
                                        key={label}
                                        type="button"
                                        className={
                                          set.feeling === feeling
                                            ? 'active'
                                            : ''
                                        }
                                        aria-label={label}
                                        aria-pressed={set.feeling === feeling}
                                        title={label}
                                        onClick={() =>
                                          void updateSet(set.id, {
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
                                <label className="fit-history-set-note">
                                  <span>Set note</span>
                                  <input
                                    defaultValue={set.notes ?? ''}
                                    maxLength={500}
                                    placeholder="Add a note"
                                    onBlur={(event) => {
                                      const value =
                                        event.target.value.trim() || null
                                      if (value !== set.notes)
                                        void updateSet(set.id, { notes: value })
                                    }}
                                  />
                                </label>
                                <button
                                  className="fit-remove-button"
                                  type="button"
                                  aria-label={`Delete set ${set.set_number}`}
                                  onClick={() => void removeSet(set.id)}
                                  disabled={busy === set.id}
                                >
                                  x
                                </button>
                              </div>
                            ))}
                        </div>
                      </section>
                    ))}
                    {!groups.length && (
                      <p className="fit-empty">
                        No sets logged for this workout.
                      </p>
                    )}
                  </div>

                  <div className="fit-history-add">
                    <Dropdown
                      ariaLabel="Exercise to add"
                      value={addExerciseId}
                      onChange={setAddExerciseId}
                      placeholder="Choose exercise"
                      options={Object.entries(exerciseNames).map(
                        ([value, label]) => ({ value, label }),
                      )}
                    />
                    <button
                      className="fit-secondary-button"
                      type="button"
                      onClick={() => void addSet(addExerciseId)}
                      disabled={!addExerciseId || busy === 'add'}
                    >
                      {busy === 'add' ? 'Adding...' : 'Add set'}
                    </button>
                  </div>
                  <div className="fit-history-actions">
                    <button
                      className="fit-primary-button"
                      type="button"
                      onClick={() => void saveSession(session.id)}
                      disabled={!editType.trim() || busy === 'session'}
                    >
                      {busy === 'session' ? 'Saving...' : 'Save workout'}
                    </button>
                    <button
                      className="fit-secondary-button"
                      type="button"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="fit-history-summary">
                  <div>
                    <h4>{session.type}</h4>
                    <time dateTime={session.date}>
                      {new Date(session.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                    {noteText(session.notes) && (
                      <p>{noteText(session.notes)}</p>
                    )}
                  </div>
                  <div className="fit-history-actions">
                    <button
                      className="fit-secondary-button"
                      type="button"
                      onClick={() => void startEditing(session)}
                    >
                      Edit
                    </button>
                    <button
                      className="fit-remove-button text"
                      type="button"
                      onClick={() => void removeSession(session.id)}
                      disabled={deleting === session.id}
                    >
                      {deleting === session.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
          {sessions.length > 3 && (
            <button
              className="fit-show-all"
              type="button"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? 'Show less' : `Show all (${sessions.length})`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
