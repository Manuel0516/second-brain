import { useEffect, useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
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
import { CategoryBadge, FEELING_LABELS, isCardioName } from './exerciseLibrary'

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

function formatSessionDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

type SessionSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function SessionForm({
  editSessionId,
  onEditConsumed,
  initialShowAll,
}: {
  editSessionId?: string | null
  onEditConsumed?: () => void
  initialShowAll?: boolean
}) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(initialShowAll ?? false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editType, setEditType] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editNote, setEditNote] = useState('')
  const [savedType, setSavedType] = useState('')
  const [savedDate, setSavedDate] = useState('')
  const [savedNote, setSavedNote] = useState('')
  const [sessionSaveStatus, setSessionSaveStatus] =
    useState<SessionSaveStatus>('idle')
  const [confirmDelete, setConfirmDelete] = useState<WorkoutSession | null>(
    null,
  )
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

  // Auto-open edit for a session from deep link — force "show all" so the
  // row renders even if the session is hidden behind the top-3 collapse.
  useEffect(() => {
    if (!editSessionId || sessions.length === 0) return
    const session = sessions.find((s) => s.id === editSessionId)
    if (!session) return
    startEditing(session)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowAll(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSessionId, sessions])

  // Scroll to the session row once "show all" has rendered it into the DOM.
  useEffect(() => {
    if (!editSessionId) return
    const session = sessions.find((s) => s.id === editSessionId)
    if (!session) return
    const el = document.getElementById(`session-row-${session.id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    onEditConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSessionId, sessions, showAll])

  async function startEditing(session: WorkoutSession) {
    setEditingId(session.id)
    const type = session.type
    const date = new Date(session.date).toISOString().slice(0, 10)
    const note = noteText(session.notes)
    setEditType(type)
    setEditDate(date)
    setEditNote(note)
    setSavedType(type)
    setSavedDate(date)
    setSavedNote(note)
    setSessionSaveStatus('idle')
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

  async function saveSessionField(
    sessionId: string,
    data: { date?: string; type?: string; notes?: Record<string, unknown> },
  ): Promise<WorkoutSession | null> {
    setSessionSaveStatus('saving')
    try {
      const updated = await updateSession(sessionId, data)
      setSessions((current) =>
        current.map((s) => (s.id === sessionId ? updated : s)),
      )
      setSessionSaveStatus('saved')
      return updated
    } catch {
      setError('Failed to save workout')
      setSessionSaveStatus('error')
      return null
    }
  }

  async function handleDateBlur(session: WorkoutSession, value: string) {
    if (!value || value === savedDate) return
    const updated = await saveSessionField(session.id, {
      date: new Date(`${value}T12:00:00Z`).toISOString(),
    })
    if (updated) setSavedDate(value)
  }

  async function handleTypeBlur(session: WorkoutSession, value: string) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === savedType) return
    const updated = await saveSessionField(session.id, { type: trimmed })
    if (updated) setSavedType(trimmed)
  }

  async function handleNoteBlur(session: WorkoutSession, value: string) {
    if (value === savedNote) return
    const updated = await saveSessionField(session.id, {
      notes: noteDoc(value),
    })
    if (updated) setSavedNote(value)
  }

  function closeEditor() {
    if (sessionSaveStatus === 'saving' || sessionSaveStatus === 'error') return
    setEditingId(null)
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
              id={`session-row-${session.id}`}
              className={`fit-history-session${editingId === session.id ? ' editing' : ''}`}
              style={{ animationDelay: `${index * 24}ms` }}
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
                        onBlur={(event) =>
                          void handleDateBlur(session, event.target.value)
                        }
                      />
                    </label>
                    <label className="cal-field">
                      <span>Workout</span>
                      <input
                        value={editType}
                        onChange={(event) => setEditType(event.target.value)}
                        onBlur={(event) =>
                          void handleTypeBlur(session, event.target.value)
                        }
                        placeholder="Workout type"
                      />
                    </label>
                  </div>
                  <label className="cal-field">
                    <span>Workout note</span>
                    <textarea
                      value={editNote}
                      onChange={(event) => setEditNote(event.target.value)}
                      onBlur={(event) =>
                        void handleNoteBlur(session, event.target.value)
                      }
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
                    <p
                      className="fit-save-status"
                      role="status"
                      aria-live="polite"
                    >
                      {sessionSaveStatus === 'saving'
                        ? 'Saving…'
                        : sessionSaveStatus === 'saved'
                          ? 'Saved'
                          : ''}
                    </p>
                    <button
                      className="fit-primary-button"
                      type="button"
                      onClick={closeEditor}
                      disabled={
                        sessionSaveStatus === 'saving' ||
                        sessionSaveStatus === 'error'
                      }
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="fit-history-summary">
                  <div>
                    <h4>{session.type}</h4>
                    <time dateTime={session.date}>
                      {formatSessionDate(session.date)}
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
                      onClick={() => setConfirmDelete(session)}
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
      <ConfirmDialog
        open={confirmDelete != null}
        message={`Delete "${confirmDelete?.type}"?`}
        detail={
          confirmDelete
            ? `${formatSessionDate(confirmDelete.date)} — this permanently removes the workout and its sets.`
            : undefined
        }
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const session = confirmDelete
          setConfirmDelete(null)
          if (session) void removeSession(session.id)
        }}
      />
    </section>
  )
}
