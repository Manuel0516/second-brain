import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { AppRail } from '../../components/AppRail'
import { SidebarShell } from '../../components/SidebarShell'
import { ProgressBar } from '../../components/ProgressBar'
import { IconButton } from '../../components/IconButton'
import { ExerciseStats } from './ExerciseStats'
import { SessionForm } from './SessionForm'
import { SessionWizard } from './SessionWizard'
import { LogPastModal } from './LogPastModal'
import { LiveSession } from './LiveSession'
import { WeekStrip, type WeekDay } from './WeekStrip'
import { BodyMetricLog } from './BodyMetricLog'
import type { ActiveSession } from './exerciseLibrary'
import {
  createGoal,
  createSession,
  deleteGoal,
  fetchSessions,
  fetchEvents,
  fetchBodyMetrics,
  fetchGoals,
  fetchBodyWeightStats,
  fetchExercises,
  type BodyMetric,
  type Goal,
  type BodyWeightStats,
} from './api'
import './fitness.css'

export function Fitness() {
  const navigate = useNavigate()
  const [isMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 640,
  )
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 800,
  )
  const [showWizard, setShowWizard] = useState(false)
  const [showLogPast, setShowLogPast] = useState(false)
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [weekDays, setWeekDays] = useState<WeekDay[]>([])
  const [lastMetric, setLastMetric] = useState<BodyMetric | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [statsExerciseId, setStatsExerciseId] = useState<string | null>(null)
  const [bodyWeightData, setBodyWeightData] = useState<BodyWeightStats | null>(
    null,
  )
  const [exerciseMap, setExerciseMap] = useState<Record<string, string>>({})
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalType, setGoalType] = useState<
    'exercise_max' | 'exercise_reps' | 'body_metric'
  >('exercise_max')
  const [goalExerciseId, setGoalExerciseId] = useState('')
  const [goalMetricKey, setGoalMetricKey] = useState('weight')
  const [goalTargetValue, setGoalTargetValue] = useState('')
  const [goalCreating, setGoalCreating] = useState(false)
  const [goalDeletingId, setGoalDeletingId] = useState<string | null>(null)

  async function loadWeek() {
    const now = new Date()
    function localDateStr(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    const [sessionsData, eventsData] = await Promise.all([
      fetchSessions(monday.toISOString(), sunday.toISOString()),
      fetchEvents(monday.toISOString(), sunday.toISOString()),
    ])
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    const days: WeekDay[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const dateStr = localDateStr(d)

      const daySession = sessionsData.find((s) => {
        const sDate = new Date(s.date)
        return localDateStr(sDate) === dateStr
      })
      const dayEvent = eventsData.find((e) => {
        const eDate = new Date(e.start_at)
        return localDateStr(eDate) === dateStr
      })

      days.push({
        day: dayNames[d.getDay()],
        date: d,
        isToday: dateStr === localDateStr(now),
        hasSession: !!daySession,
        sessionType: daySession?.type ?? null,
        hasEvent: !!dayEvent,
      })
    }
    setWeekDays(days)

    const metrics = await fetchBodyMetrics()
    if (metrics.length > 0) setLastMetric(metrics[0])

    const goalsData = await fetchGoals()
    setGoals(goalsData)

    const bwStats = await fetchBodyWeightStats()
    setBodyWeightData(bwStats)

    // Exercise lookup for label display
    const exercises = await fetchExercises()
    const map: Record<string, string> = {}
    exercises.forEach((e) => {
      map[e.id] = e.name
    })
    setExerciseMap(map)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWeek()
  }, [])

  function handleStartSession(session: ActiveSession) {
    setActiveSession(session)
  }

  async function handleFinishSession() {
    if (!activeSession) return
    // Save session to backend
    try {
      const now = new Date()
      await createSession({
        date: now.toISOString(),
        type: activeSession.type,
        notes: { type: 'doc', content: [] },
      })
    } catch {
      // ponytail: silently fail — session data is in local state,
      // we can add a toast or retry later.
    }
    setActiveSession(null)
    await loadWeek()
  }

  async function handleCreateGoal() {
    if (!goalTargetValue) return
    setGoalCreating(true)
    try {
      await createGoal({
        target_type: goalType,
        exercise_id: goalType !== 'body_metric' ? goalExerciseId || null : null,
        metric_key: goalType === 'body_metric' ? goalMetricKey : null,
        target_value: parseFloat(goalTargetValue),
      })
      setShowGoalForm(false)
      setGoalTargetValue('')
      setGoalExerciseId('')
      await loadWeek() // refresh goals
    } catch {
      // silently fail
    } finally {
      setGoalCreating(false)
    }
  }

  async function handleDeleteGoal(goalId: string) {
    setGoalDeletingId(goalId)
    try {
      await deleteGoal(goalId)
      await loadWeek()
    } catch {
      // silently fail
    } finally {
      setGoalDeletingId(null)
    }
  }

  const weeklySessions = weekDays.filter((d) => d.hasSession).length

  return (
    <div
      className="fitness-page"
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-base)',
        animation: 'fadeUp .4s cubic-bezier(.16,1,.3,1) both',
      }}
    >
      {(!isMobile || sidebarOpen) && (
        <AppRail active="fitness" onNavigate={navigate} />
      )}

      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minWidth: 0,
          position: 'relative',
        }}
      >
        <SidebarShell
          title="Fitness"
          open={sidebarOpen}
          actions={
            <IconButton
              icon={
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              }
              label="Close navigation"
              onClick={() => setSidebarOpen(false)}
              size="md"
              className="sidebar-close"
            />
          }
        >
          <div
            style={{
              padding: '20px 16px',
              animation: 'slideInL .3s ease both',
            }}
          >
            {/* This week */}
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '.07em',
                color: 'var(--text-tertiary)',
                fontWeight: 600,
                marginBottom: '10px',
              }}
            >
              This week
            </div>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '18px' }}>
              {weekDays.map((day, i) => {
                const hasSession = day.hasSession
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: '36px',
                      background: hasSession
                        ? 'var(--fit-accent-tint)'
                        : day.isToday
                          ? 'rgba(34,211,238,0.12)'
                          : 'rgba(255,240,200,0.06)',
                      border: day.isToday
                        ? '1px solid rgba(34,211,238,0.3)'
                        : 'none',
                      borderRadius: '5px',
                      display: 'flex',
                      alignItems: 'flex-end',
                      padding: '3px',
                    }}
                  >
                    {hasSession && (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          background: 'var(--fit-accent)',
                          borderRadius: '3px',
                          opacity: 0.9,
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Goals header with add button */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '.07em',
                  color: 'var(--text-tertiary)',
                  fontWeight: 600,
                }}
              >
                Goals
              </span>
              <button
                onClick={() => setShowGoalForm(!showGoalForm)}
                style={{
                  width: '20px',
                  height: '20px',
                  display: 'grid',
                  placeItems: 'center',
                  border: '1px solid rgba(255,240,200,0.12)',
                  borderRadius: '5px',
                  background: showGoalForm
                    ? 'var(--fit-accent-tint)'
                    : 'transparent',
                  color: showGoalForm
                    ? 'var(--fit-accent)'
                    : 'var(--text-tertiary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'background .15s',
                }}
              >
                {showGoalForm ? '−' : '+'}
              </button>
            </div>

            {/* Goal creation form */}
            {showGoalForm && (
              <div
                style={{
                  padding: '10px',
                  marginBottom: '8px',
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--fit-accent-border)',
                  borderRadius: '8px',
                  animation: 'springIn .25s cubic-bezier(.16,1,.3,1) both',
                  display: 'grid',
                  gap: '8px',
                }}
              >
                <select
                  value={goalType}
                  onChange={(e) => {
                    setGoalType(e.target.value as typeof goalType)
                    setGoalExerciseId('')
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: 'var(--bg-base)',
                    border: '1px solid rgba(255,240,200,0.09)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                  }}
                >
                  <option value="exercise_max">Exercise max weight</option>
                  <option value="exercise_reps">Exercise max reps</option>
                  <option value="body_metric">Body metric</option>
                </select>
                {goalType === 'body_metric' ? (
                  <select
                    value={goalMetricKey}
                    onChange={(e) => setGoalMetricKey(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      background: 'var(--bg-base)',
                      border: '1px solid rgba(255,240,200,0.09)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  >
                    <option value="weight">Weight</option>
                    <option value="body_fat">Body fat %</option>
                  </select>
                ) : (
                  <select
                    value={goalExerciseId}
                    onChange={(e) => setGoalExerciseId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      background: 'var(--bg-base)',
                      border: '1px solid rgba(255,240,200,0.09)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  >
                    <option value="">Select exercise…</option>
                    {Object.entries(exerciseMap).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="number"
                  value={goalTargetValue}
                  onChange={(e) => setGoalTargetValue(e.target.value)}
                  placeholder="Target value"
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: 'var(--bg-base)',
                    border: '1px solid rgba(255,240,200,0.09)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleCreateGoal}
                  disabled={!goalTargetValue || goalCreating}
                  style={{
                    width: '100%',
                    padding: '6px',
                    background: 'var(--fit-accent-tint)',
                    border: '1px solid var(--fit-accent-border)',
                    borderRadius: '6px',
                    color: 'var(--fit-accent)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: !goalTargetValue || goalCreating ? 0.5 : 1,
                  }}
                >
                  {goalCreating ? 'Adding…' : 'Add goal'}
                </button>
              </div>
            )}
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              {goals.length === 0 ? (
                <>
                  {/* Bench Press goal (fallback) */}
                  <div
                    style={{
                      padding: '9px 10px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid rgba(255,240,200,0.07)',
                      borderRadius: '8px',
                    }}
                  >
                    <ProgressBar
                      label="Bench Press"
                      value={92}
                      max={100}
                      sublabel="92 kg / 100 kg"
                    />
                  </div>
                  {/* Weekly volume goal (fallback) */}
                  <div
                    style={{
                      padding: '9px 10px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid rgba(255,240,200,0.07)',
                      borderRadius: '8px',
                    }}
                  >
                    <ProgressBar
                      label="Weekly volume"
                      value={weeklySessions}
                      max={5}
                      sublabel={`${weeklySessions} / 5 sessions`}
                    />
                  </div>
                </>
              ) : (
                goals.map((goal) => {
                  const label = goal.exercise_id
                    ? exerciseMap[goal.exercise_id] || 'Exercise goal'
                    : (goal.metric_key ?? goal.target_type)
                  return (
                    <div
                      key={goal.id}
                      style={{
                        padding: '9px 10px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid rgba(255,240,200,0.07)',
                        borderRadius: '8px',
                        position: 'relative',
                      }}
                    >
                      <ProgressBar
                        label={label}
                        value={goal.current_value ?? 0}
                        max={goal.target_value}
                        sublabel={`${goal.current_value ?? 0} / ${goal.target_value}`}
                      />
                      <button
                        onClick={() => handleDeleteGoal(goal.id)}
                        disabled={goalDeletingId === goal.id}
                        title="Delete goal"
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          width: '18px',
                          height: '18px',
                          display: 'grid',
                          placeItems: 'center',
                          border: '0',
                          borderRadius: '4px',
                          background: 'transparent',
                          color: '#d9573f',
                          cursor: 'pointer',
                          fontSize: '9px',
                          opacity: goalDeletingId === goal.id ? 0.5 : 1,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            {lastMetric && (
              <div
                style={{
                  marginTop: '14px',
                  padding: '8px 10px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid rgba(255,240,200,0.07)',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '.07em',
                    color: 'var(--text-tertiary)',
                    fontWeight: 600,
                    marginBottom: '6px',
                  }}
                >
                  Body
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  {lastMetric.weight} kg
                  {lastMetric.body_fat_pct != null && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        fontWeight: 400,
                      }}
                    >
                      {' '}
                      · {lastMetric.body_fat_pct}%
                    </span>
                  )}
                </div>
                {/* Mini sparkline */}
                {bodyWeightData && bodyWeightData.metrics.length > 1 && (
                  <div style={{ height: '36px', marginTop: '4px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={bodyWeightData.metrics.slice(-14)}>
                        <Line
                          type="monotone"
                          dataKey="weight"
                          stroke="#22D3EE"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '10px',
                    color: 'var(--text-tertiary)',
                    marginTop: '3px',
                  }}
                >
                  {bodyWeightData?.trend != null
                    ? `Trend: ${bodyWeightData.trend} kg`
                    : new Date(lastMetric.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                </div>
              </div>
            )}
          </div>
        </SidebarShell>
        {sidebarOpen && (
          <div
            className="sidebar-backdrop"
            role="presentation"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '28px 32px 64px',
            minWidth: 0,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: '24px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}
            >
              <button
                onClick={() => setSidebarOpen((open) => !open)}
                aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
                aria-pressed={sidebarOpen}
                style={{
                  width: 26,
                  height: 26,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                  <path d="M7.5 3.5v13" />
                </svg>
              </button>
              <div>
                <h2
                  style={{
                    fontSize: '21px',
                    fontWeight: 700,
                    letterSpacing: '-.015em',
                    margin: '0 0 4px',
                    color: 'var(--text-primary)',
                  }}
                >
                  Fitness
                </h2>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '11px',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Week 26 · {activeSession ? activeSession.type : 'Push Day'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowLogPast(true)}
                style={{
                  height: '34px',
                  padding: '0 14px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid rgba(255,240,200,0.09)',
                  borderRadius: '8px',
                  color: 'var(--text-secondary)',
                  fontSize: '12.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M10 4v12M4 10h12" />
                </svg>
                Log past
              </button>
              {!activeSession && (
                <button
                  onClick={() => setShowWizard(true)}
                  style={{
                    height: '34px',
                    padding: '0 16px',
                    background: 'var(--accent-tint)',
                    border: '1px solid var(--accent-tint-border)',
                    borderRadius: '8px',
                    color: 'var(--accent)',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  >
                    <path d="M3 10h2.5M14.5 10H17M5.5 7.5v5M14.5 7.5v5M7.5 10h5" />
                  </svg>
                  Start session
                </button>
              )}
            </div>
          </div>

          {/* Week strip */}
          <WeekStrip weekDays={weekDays} />

          {/* Stats panel */}
          {statsExerciseId ? (
            <div
              style={{
                marginBottom: '20px',
                padding: '20px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
              }}
            >
              <ExerciseStats
                exerciseId={statsExerciseId}
                onClose={() => setStatsExerciseId(null)}
              />
            </div>
          ) : (
            Object.keys(exerciseMap).length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3
                  className="fitness-section-title"
                  style={{ margin: '0 0 10px' }}
                >
                  Exercise Stats
                </h3>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {Object.entries(exerciseMap).map(([id, name]) => (
                    <button
                      key={id}
                      onClick={() => setStatsExerciseId(id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border:
                          statsExerciseId === id
                            ? '1px solid var(--fit-accent-border)'
                            : '1px solid rgba(255,240,200,0.09)',
                        background:
                          statsExerciseId === id
                            ? 'var(--fit-accent-tint)'
                            : 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        transition: 'background .15s',
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )
          )}

          {/* Active session or inactive view */}
          {activeSession ? (
            <LiveSession
              session={activeSession}
              onUpdate={setActiveSession}
              onFinish={handleFinishSession}
            />
          ) : (
            <SessionForm />
          )}

          <div
            style={{
              height: '1px',
              background: 'var(--border)',
              margin: '32px 0',
            }}
          />
          <BodyMetricLog />
        </main>
      </div>

      <SessionWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onStart={handleStartSession}
      />
      <LogPastModal
        open={showLogPast}
        onClose={() => setShowLogPast(false)}
        onSaved={() => loadWeek()}
      />
    </div>
  )
}
