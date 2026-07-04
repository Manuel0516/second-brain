import { useEffect, useState } from 'react'
import type { WorkoutSession, SetEntry } from './api'
import {
  deleteSession,
  fetchSessions,
  fetchSetEntries,
  updateSession,
  updateSetEntry,
  deleteSetEntry,
  fetchExercises,
} from './api'

export function SessionForm() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editType, setEditType] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editSets, setEditSets] = useState<SetEntry[]>([])
  const [exerciseNames, setExerciseNames] = useState<Record<string, string>>({})
  const [savingSet, setSavingSet] = useState<string | null>(null)

  async function reloadSessions() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSessions()
      setSessions(data)
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

  async function handleDelete(sessionId: string) {
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

  async function startEditing(session: WorkoutSession) {
    setEditingId(session.id)
    setEditType(session.type)
    setEditDate(new Date(session.date).toISOString().slice(0, 10))
    // Fetch sets for this session
    try {
      const sets = await fetchSetEntries(session.id)
      setEditSets(sets)
      // Also fetch exercise names
      const exercises = await fetchExercises()
      const map: Record<string, string> = {}
      exercises.forEach((e) => {
        map[e.id] = e.name
      })
      setExerciseNames(map)
    } catch {
      setEditSets([])
    }
  }

  async function handleSaveEdit(sessionId: string) {
    try {
      const d = new Date(editDate + 'T12:00:00Z')
      await updateSession(sessionId, {
        date: d.toISOString(),
        type: editType.trim(),
      })
      setEditingId(null)
      await reloadSessions()
    } catch {
      setError('Failed to save')
    }
  }

  async function handleUpdateSet(
    setId: string,
    field: 'reps' | 'weight',
    value: number | null,
  ) {
    if (!editingId) return
    setSavingSet(setId)
    try {
      await updateSetEntry(editingId, setId, { [field]: value })
      // Optimistic update in local state
      setEditSets((prev) =>
        prev.map((s) => (s.id === setId ? { ...s, [field]: value } : s)),
      )
    } catch {
      setError('Failed to update set')
    } finally {
      setSavingSet(null)
    }
  }

  async function handleDeleteSet(setId: string) {
    if (!editingId) return
    try {
      await deleteSetEntry(editingId, setId)
      setEditSets((prev) => prev.filter((s) => s.id !== setId))
    } catch {
      setError('Failed to delete set')
    }
  }

  function formatDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  const visibleSessions = showAll ? sessions : sessions.slice(0, 3)
  const hasMore = sessions.length > 3

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
    <div className="fitness-section" style={{ display: 'grid', gap: '20px' }}>
      {error && (
        <p style={{ color: '#d9573f', fontSize: '12px', margin: 0 }}>{error}</p>
      )}

      {/* Sessions List */}
      <div>
        <h3 className="fitness-section-title" style={{ margin: '0 0 12px' }}>
          Recent Sessions
        </h3>
        {loading ? (
          <p
            style={{
              color: 'var(--text-tertiary)',
              fontSize: '13px',
              margin: 0,
            }}
          >
            Loading…
          </p>
        ) : sessions.length === 0 ? (
          <p
            style={{
              color: 'var(--text-tertiary)',
              fontSize: '13px',
              margin: 0,
            }}
          >
            No sessions yet. Log your first workout above.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '6px' }}>
            {visibleSessions.map((session, i) => (
              <div
                key={session.id}
                style={{
                  display: 'grid',
                  gap: '6px',
                  padding: editingId === session.id ? '8px 14px' : '10px 14px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  animation: 'springUp 0.5s cubic-bezier(.16,1,.3,1) both',
                  animationDelay: `${i * 40}ms`,
                }}
              >
                {editingId === session.id ? (
                  <div style={{ display: 'grid', gap: '6px', padding: '0' }}>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={editType}
                      onChange={(e) => setEditType(e.target.value)}
                      placeholder="Session type"
                      style={inputStyle}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleSaveEdit(session.id)}
                        style={{
                          padding: '5px 12px',
                          background: 'var(--accent-tint)',
                          border: '1px solid var(--accent-tint-border)',
                          borderRadius: '6px',
                          color: 'var(--accent)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        style={{
                          padding: '5px 12px',
                          background: 'transparent',
                          border: '1px solid rgba(255,240,200,0.09)',
                          borderRadius: '6px',
                          color: 'var(--text-tertiary)',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    {/* Sets for this session */}
                    {editSets.length > 0 && (
                      <div
                        style={{
                          marginTop: '10px',
                          borderTop: '1px solid rgba(255,240,200,0.06)',
                          paddingTop: '10px',
                        }}
                      >
                        <div
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '9.5px',
                            textTransform: 'uppercase',
                            letterSpacing: '.07em',
                            color: 'var(--text-tertiary)',
                            marginBottom: '6px',
                          }}
                        >
                          Sets ({editSets.length})
                        </div>
                        <div style={{ display: 'grid', gap: '4px' }}>
                          {/* Header */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 50px 55px 24px',
                              gap: '6px',
                              alignItems: 'center',
                              padding: '0 2px',
                            }}
                          >
                            <span
                              style={{
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '9px',
                                color: 'var(--text-tertiary)',
                              }}
                            >
                              Exercise
                            </span>
                            <span
                              style={{
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '9px',
                                color: 'var(--text-tertiary)',
                                textAlign: 'center',
                              }}
                            >
                              Reps
                            </span>
                            <span
                              style={{
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '9px',
                                color: 'var(--text-tertiary)',
                                textAlign: 'center',
                              }}
                            >
                              Weight
                            </span>
                            <span />
                          </div>
                          {editSets.map((set) => (
                            <div
                              key={set.id}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 50px 55px 24px',
                                gap: '6px',
                                alignItems: 'center',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '12px',
                                  color: 'var(--text-primary)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {exerciseNames[set.exercise_id] || 'Exercise'} ·
                                S{set.set_number}
                              </span>
                              <input
                                type="number"
                                defaultValue={set.reps}
                                onBlur={(e) => {
                                  const v = parseInt(e.target.value, 10)
                                  if (!isNaN(v) && v !== set.reps)
                                    handleUpdateSet(set.id, 'reps', v)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter')
                                    (e.target as HTMLInputElement).blur()
                                }}
                                style={{
                                  ...inputStyle,
                                  textAlign: 'center',
                                  fontFamily: 'JetBrains Mono, monospace',
                                  fontSize: '12px',
                                  padding: '4px 6px',
                                  minHeight: '28px',
                                }}
                              />
                              <input
                                type="number"
                                defaultValue={set.weight ?? ''}
                                placeholder="—"
                                onBlur={(e) => {
                                  const v = e.target.value
                                    ? parseFloat(e.target.value)
                                    : null
                                  if (v !== set.weight)
                                    handleUpdateSet(set.id, 'weight', v)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter')
                                    (e.target as HTMLInputElement).blur()
                                }}
                                style={{
                                  ...inputStyle,
                                  textAlign: 'center',
                                  fontFamily: 'JetBrains Mono, monospace',
                                  fontSize: '12px',
                                  padding: '4px 6px',
                                  minHeight: '28px',
                                }}
                              />
                              <button
                                onClick={() => handleDeleteSet(set.id)}
                                disabled={savingSet === set.id}
                                title="Delete set"
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  display: 'grid',
                                  placeItems: 'center',
                                  border: '0',
                                  borderRadius: '4px',
                                  background: 'transparent',
                                  color: '#d9573f',
                                  cursor: 'pointer',
                                  fontSize: '9px',
                                  opacity: savingSet === set.id ? 0.5 : 1,
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {editSets.length === 0 && (
                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '11px',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        No sets logged for this session.
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          fontWeight: 500,
                        }}
                      >
                        {session.type}
                      </div>
                      <div
                        style={{
                          color: 'var(--text-tertiary)',
                          font: '400 11px var(--font-mono)',
                          marginTop: '2px',
                        }}
                      >
                        {formatDate(session.date)}
                      </div>
                    </div>
                    <button
                      onClick={() => startEditing(session)}
                      title="Edit session"
                      style={{
                        width: '28px',
                        height: '28px',
                        display: 'grid',
                        placeItems: 'center',
                        border: '0',
                        borderRadius: 'var(--r-sm)',
                        background: 'transparent',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        fontSize: '11px',
                        transition: 'background 0.14s ease, color 0.14s ease',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e2) => {
                        e2.currentTarget.style.background = 'var(--bg-raised)'
                      }}
                      onMouseLeave={(e2) => {
                        e2.currentTarget.style.background = 'transparent'
                      }}
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handleDelete(session.id)}
                      disabled={deleting === session.id}
                      title="Delete session"
                      style={{
                        width: '28px',
                        height: '28px',
                        display: 'grid',
                        placeItems: 'center',
                        border: '0',
                        borderRadius: 'var(--r-sm)',
                        background: 'transparent',
                        color:
                          deleting === session.id
                            ? 'var(--text-tertiary)'
                            : '#d9573f',
                        cursor: 'pointer',
                        fontSize: '11px',
                        transition: 'background 0.14s ease, color 0.14s ease',
                        opacity: deleting === session.id ? 0.5 : 1,
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e2) => {
                        e2.currentTarget.style.background = 'var(--bg-raised)'
                      }}
                      onMouseLeave={(e2) => {
                        e2.currentTarget.style.background = 'transparent'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
            {hasMore && (
              <button
                onClick={() => setShowAll(!showAll)}
                style={{
                  width: '100%',
                  padding: '7px',
                  marginTop: '6px',
                  background: 'transparent',
                  border: '1px dashed rgba(255,240,200,0.09)',
                  borderRadius: '7px',
                  color: 'var(--text-tertiary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'border-color .15s, color .15s',
                }}
              >
                {showAll ? 'Show less' : 'Show all (' + sessions.length + ')'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
