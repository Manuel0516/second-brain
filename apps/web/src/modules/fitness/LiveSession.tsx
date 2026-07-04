import { useState, useRef, useCallback } from 'react'
import { RestTimer } from './RestTimer'
import { PREV_PERFORMANCE } from './exerciseLibrary'
import type { ActiveSession } from './exerciseLibrary'

interface Props {
  session: ActiveSession
  onUpdate: (session: ActiveSession) => void
  onFinish: () => void
}

export function LiveSession({ session, onUpdate, onFinish }: Props) {
  const [restCount, setRestCount] = useState(0)
  const [restTotal, setRestTotal] = useState(90)
  const restInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  function startRest() {
    if (restInterval.current) clearInterval(restInterval.current)
    setRestCount(90)
    setRestTotal(90)
    restInterval.current = setInterval(() => {
      setRestCount((c) => {
        if (c <= 1) {
          if (restInterval.current) clearInterval(restInterval.current)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  function skipRest() {
    if (restInterval.current) clearInterval(restInterval.current)
    setRestCount(0)
  }

  // Cleanup interval on unmount
  const cleanupRest = useCallback(() => {
    if (restInterval.current) clearInterval(restInterval.current)
  }, [])

  function toggleSetDone(exIdx: number, setIdx: number) {
    const exs = session.exercises.map((ex, i) => {
      if (i !== exIdx) return ex
      return {
        ...ex,
        sets: ex.sets.map((s, j) =>
          j === setIdx ? { ...s, done: !s.done } : s,
        ),
      }
    })
    const set = session.exercises[exIdx].sets[setIdx]
    if (!set.done) {
      // Was unchecked → now checked
      startRest()
    }
    onUpdate({ ...session, exercises: exs })
  }

  function updateSetValue(
    exIdx: number,
    setIdx: number,
    field: 'w' | 'r',
    value: string,
  ) {
    const exs = session.exercises.map((ex, i) => {
      if (i !== exIdx) return ex
      return {
        ...ex,
        sets: ex.sets.map((s, j) =>
          j === setIdx ? { ...s, [field]: value } : s,
        ),
      }
    })
    onUpdate({ ...session, exercises: exs })
  }

  function addSet(exIdx: number) {
    const exs = session.exercises.map((ex, i) =>
      i === exIdx
        ? { ...ex, sets: [...ex.sets, { w: '', r: '', done: false }] }
        : ex,
    )
    onUpdate({ ...session, exercises: exs })
  }

  function removeSet(exIdx: number, setIdx: number) {
    const exs = session.exercises.map((ex, i) =>
      i === exIdx
        ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) }
        : ex,
    )
    onUpdate({ ...session, exercises: exs })
  }

  function addExercise(name: string) {
    onUpdate({
      ...session,
      exercises: [
        ...session.exercises,
        {
          name,
          prev: PREV_PERFORMANCE[name] || '—',
          sets: [
            { w: '', r: '', done: false },
            { w: '', r: '', done: false },
            { w: '', r: '', done: false },
          ],
        },
      ],
    })
  }

  const setLabel = (n: number) => `S${n}`

  return (
    <div style={{ animation: 'springIn .4s cubic-bezier(.16,1,.3,1) both' }}>
      {/* Live session header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              background: 'var(--fit-accent)',
              borderRadius: '50%',
              animation: 'breathe 1.4s ease-in-out infinite',
            }}
          />
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--fit-accent)',
              letterSpacing: '.05em',
              textTransform: 'uppercase',
            }}
          >
            Session live
          </span>
        </div>
        <button
          onClick={() => {
            cleanupRest()
            onFinish()
          }}
          style={{
            height: '32px',
            padding: '0 14px',
            background: 'var(--accent-tint)',
            border: '1px solid var(--accent-tint-border)',
            borderRadius: '7px',
            color: 'var(--accent)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Finish workout ✓
        </button>
      </div>

      {/* Rest timer overlay */}
      {restCount > 0 && (
        <RestTimer
          restCount={restCount}
          restTotal={restTotal}
          onSkip={skipRest}
        />
      )}

      {/* Exercise cards */}
      {session.exercises.map((exercise, exIdx) => (
        <div
          key={exercise.name}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid rgba(255,240,200,0.07)',
            borderRadius: '12px',
            padding: '18px 20px',
            marginBottom: '10px',
          }}
        >
          {/* Exercise header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '16px', color: 'var(--fit-accent)' }}>
                {/* ponytail: use text icon instead of nerd font for compatibility */}
                ▩
              </span>
              <div>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {exercise.name}
                </div>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '10px',
                    color: 'var(--text-tertiary)',
                    marginTop: '1px',
                  }}
                >
                  Prev: {exercise.prev}
                </div>
              </div>
            </div>
            <button
              onClick={() => addSet(exIdx)}
              style={{
                height: '28px',
                padding: '0 11px',
                background: 'var(--accent-tint)',
                border: '1px solid var(--accent-tint-border)',
                borderRadius: '6px',
                color: 'var(--accent)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Set
            </button>
          </div>

          {/* Set rows */}
          {exercise.sets.length === 0 ? (
            <div
              style={{
                padding: '12px',
                background: 'var(--bg-raised)',
                borderRadius: '8px',
                fontSize: '12.5px',
                color: 'var(--text-tertiary)',
                textAlign: 'center',
                border: '1px dashed rgba(255,240,200,0.07)',
              }}
            >
              No sets logged yet — tap + Set to start
            </div>
          ) : (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}
            >
              {exercise.sets.map((set, setIdx) => (
                <div
                  key={setIdx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 1fr 1fr 36px 24px',
                    gap: '8px',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '10px',
                      color: 'var(--text-tertiary)',
                      textAlign: 'center',
                    }}
                  >
                    {setLabel(setIdx + 1)}
                  </span>
                  {/* Weight input */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 10px',
                      background: 'var(--bg-raised)',
                      borderRadius: '7px',
                      border: '1px solid rgba(255,240,200,0.07)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '10px',
                        color: 'var(--text-tertiary)',
                        flexShrink: 0,
                      }}
                    >
                      kg
                    </span>
                    <input
                      type="number"
                      value={set.w}
                      onChange={(e) =>
                        updateSetValue(exIdx, setIdx, 'w', e.target.value)
                      }
                      placeholder="—"
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontSize: '13.5px',
                        fontWeight: 600,
                        fontFamily: 'JetBrains Mono, monospace',
                        outline: 'none',
                      }}
                    />
                  </div>
                  {/* Reps input */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 10px',
                      background: 'var(--bg-raised)',
                      borderRadius: '7px',
                      border: '1px solid rgba(255,240,200,0.07)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '10px',
                        color: 'var(--text-tertiary)',
                        flexShrink: 0,
                      }}
                    >
                      reps
                    </span>
                    <input
                      type="number"
                      value={set.r}
                      onChange={(e) =>
                        updateSetValue(exIdx, setIdx, 'r', e.target.value)
                      }
                      placeholder="0"
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontSize: '13.5px',
                        fontWeight: 600,
                        fontFamily: 'JetBrains Mono, monospace',
                        outline: 'none',
                      }}
                    />
                  </div>
                  {/* Done checkmark */}
                  <button
                    onClick={() => toggleSetDone(exIdx, setIdx)}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '7px',
                      border: set.done
                        ? '1px solid var(--fit-accent-border)'
                        : '1px solid rgba(255,240,200,0.09)',
                      background: set.done
                        ? 'var(--fit-accent-tint-deep)'
                        : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'background .15s',
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke={
                        set.done ? 'var(--fit-accent)' : 'var(--text-tertiary)'
                      }
                      strokeWidth={set.done ? '2.5' : '2'}
                      strokeLinecap="round"
                    >
                      <path d="M4 10l4 4L17 6" />
                    </svg>
                  </button>
                  {/* Delete set */}
                  <button
                    onClick={() => removeSet(exIdx, setIdx)}
                    title="Remove set"
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '5px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      fontSize: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      justifySelf: 'center',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Add exercise button */}
      <button
        onClick={() => {
          const name = prompt('Exercise name:')
          if (name?.trim()) addExercise(name.trim())
        }}
        style={{
          width: '100%',
          padding: '13px',
          background: 'rgba(255,240,200,0.04)',
          border: '1px dashed rgba(255,240,200,0.1)',
          borderRadius: '10px',
          color: 'var(--text-tertiary)',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          cursor: 'pointer',
          transition: 'background .15s, border-color .15s, color .15s',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M10 4v12M4 10h12" />
        </svg>
        Add exercise
      </button>
    </div>
  )
}
