import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { AppRail } from '../../components/AppRail'
import { SidebarShell } from '../../components/SidebarShell'
import { ProgressBar } from '../../components/ProgressBar'
import { IconButton } from '../../components/IconButton'
import { Segmented } from '../../components/Segmented'
import { ExerciseStats } from './ExerciseStats'
import { Overview } from './Overview'
import { GoalsSection } from './GoalsSection'
import { SessionForm } from './SessionForm'
import { SessionWizard } from './SessionWizard'
import { LogPastModal } from './LogPastModal'
import { LiveSession } from './LiveSession'
import { WeekStrip, type WeekDay } from './WeekStrip'
import { BodyMetricLog } from './BodyMetricLog'
import { BodyMetricForm } from './BodyMetricForm'
import type { ActiveSession } from './exerciseLibrary'
import {
  PREV_PERFORMANCE,
  isCardioName,
  CategoryBadge,
} from './exerciseLibrary'
import {
  createExercise,
  createSession,
  createSetEntry,
  fetchSessions,
  fetchEvents,
  fetchBodyMetrics,
  fetchGoals,
  fetchBodyWeightStats,
  fetchExercises,
  fetchPlannedSessions,
  updateSession,
  type BodyMetric,
  type Goal,
  type BodyWeightStats,
  type WorkoutSession,
} from './api'
import './fitness.css'

const TABS = ['overview', 'stats', 'history'] as const
type FitnessTab = (typeof TABS)[number]

export function Fitness() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: FitnessTab = TABS.includes(tabParam as FitnessTab)
    ? (tabParam as FitnessTab)
    : 'overview'

  function setTab(next: FitnessTab) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === 'overview') params.delete('tab')
        else params.set('tab', next)
        return params
      },
      { replace: true },
    )
  }

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 640,
  )
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 800,
  )
  const [showWizard, setShowWizard] = useState(false)
  const [showLogPast, setShowLogPast] = useState(false)
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  // DB id of the session backing the live session, when it originated from a
  // planned/active one — set so Finish PATCHes it instead of POSTing a new row.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeSessionNote, setActiveSessionNote] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekDays, setWeekDays] = useState<WeekDay[]>([])
  const [currentWeekDays, setCurrentWeekDays] = useState<WeekDay[]>([])
  const [plannedSessions, setPlannedSessions] = useState<WorkoutSession[]>([])
  const [planningSession, setPlanningSession] = useState<WorkoutSession | null>(
    null,
  )
  const [highlightSessionId, setHighlightSessionId] = useState<string | null>(
    null,
  )
  const [lastMetric, setLastMetric] = useState<BodyMetric | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [statsExerciseId, setStatsExerciseId] = useState<string | null>(null)
  const [bodyWeightData, setBodyWeightData] = useState<BodyWeightStats | null>(
    null,
  )
  const [exerciseMap, setExerciseMap] = useState<
    Record<string, { name: string; category: string }>
  >({})

  function localDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function mondayFor(offset: number): Date {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offset * 7)
    monday.setHours(0, 0, 0, 0)
    return monday
  }

  function buildWeekDays(
    monday: Date,
    sessionsData: WorkoutSession[],
    eventsData: { start_at: string }[],
  ): WeekDay[] {
    const now = new Date()
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    const days: WeekDay[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const dateStr = localDateStr(d)

      const daySession = sessionsData.find(
        (s) => localDateStr(new Date(s.date)) === dateStr,
      )
      const dayEvent = eventsData.find(
        (e) => localDateStr(new Date(e.start_at)) === dateStr,
      )

      days.push({
        day: dayNames[d.getDay()],
        date: d,
        isToday: dateStr === localDateStr(now),
        hasSession: !!daySession,
        sessionType: daySession?.type ?? null,
        sessionStatus: daySession?.status ?? null,
        hasEvent: !!dayEvent,
      })
    }
    return days
  }

  async function loadWeek(offset = weekOffset) {
    try {
      await loadWeekInner(offset)
    } catch (err) {
      // Never let a failed fetch blank the page — log and keep what we have.
      console.error('Failed to load fitness data', err)
    }
  }

  async function loadWeekInner(offset: number) {
    const monday = mondayFor(offset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    const [sessionsData, eventsData] = await Promise.all([
      fetchSessions(monday.toISOString(), sunday.toISOString()),
      fetchEvents(monday.toISOString(), sunday.toISOString()),
    ])
    setWeekDays(buildWeekDays(monday, sessionsData, eventsData))

    if (offset === 0) {
      setCurrentWeekDays(buildWeekDays(monday, sessionsData, eventsData))
    } else {
      const cMonday = mondayFor(0)
      const cSunday = new Date(cMonday)
      cSunday.setDate(cMonday.getDate() + 6)
      cSunday.setHours(23, 59, 59, 999)
      const [cSessions, cEvents] = await Promise.all([
        fetchSessions(cMonday.toISOString(), cSunday.toISOString()),
        fetchEvents(cMonday.toISOString(), cSunday.toISOString()),
      ])
      setCurrentWeekDays(buildWeekDays(cMonday, cSessions, cEvents))
    }

    const metrics = await fetchBodyMetrics()
    if (metrics.length > 0) setLastMetric(metrics[0])

    const goalsData = await fetchGoals()
    setGoals(goalsData)

    const bwStats = await fetchBodyWeightStats()
    setBodyWeightData(bwStats)

    // Exercise lookup for label display
    const exercises = await fetchExercises()
    const map: Record<string, { name: string; category: string }> = {}
    exercises.forEach((e) => {
      map[e.id] = { name: e.name, category: e.category }
    })
    setExerciseMap(map)

    const [planned, active] = await Promise.all([
      fetchPlannedSessions('planned'),
      fetchPlannedSessions('active'),
    ])
    setPlannedSessions([...planned, ...active])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWeek(weekOffset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  function handleStartSession(
    session: ActiveSession,
    sourceSessionId?: string,
  ) {
    setActiveSession(session)
    setActiveSessionId(sourceSessionId ?? null)
    setActiveSessionNote('')
  }

  /** Plain text (from a planned session's ProseMirror notes) → a minimal doc. */
  function textToDoc(text: string): Record<string, unknown> {
    const trimmed = text.trim()
    return {
      type: 'doc',
      content: trimmed
        ? [{ type: 'paragraph', content: [{ type: 'text', text: trimmed }] }]
        : [],
    }
  }

  function docToText(doc: Record<string, unknown> | null | undefined): string {
    const content = (doc as { content?: unknown[] } | undefined)?.content
    if (!Array.isArray(content)) return ''
    const parts: string[] = []
    for (const node of content) {
      const inline = (node as { content?: { text?: string }[] }).content
      if (Array.isArray(inline)) {
        for (const leaf of inline) if (leaf.text) parts.push(leaf.text)
      }
    }
    return parts.join(' ').trim()
  }

  /** Builds an in-memory ActiveSession from a planned session's `plan` names. */
  function planToActiveSession(session: WorkoutSession): ActiveSession {
    return {
      type: session.type,
      exercises: (session.plan ?? []).map((name) => {
        const cardio = isCardioName(name)
        const emptySet = cardio
          ? { w: '', r: '', done: false, distance_km: '', duration_min: '' }
          : { w: '', r: '', done: false }
        return {
          name,
          prev: PREV_PERFORMANCE[name] || '—',
          category: cardio ? ('cardio' as const) : undefined,
          sets: Array.from({ length: cardio ? 1 : 3 }, () => ({ ...emptySet })),
        }
      }),
    }
  }

  function enterLive(session: WorkoutSession) {
    setActiveSessionId(session.id)
    setActiveSessionNote(docToText(session.notes))
    setActiveSession(planToActiveSession(session))
  }

  async function handleStartPlanned(session: WorkoutSession) {
    if (!session.plan || session.plan.length === 0) {
      setPlanningSession(session)
      setShowWizard(true)
      return
    }
    try {
      const updated = await updateSession(session.id, { status: 'active' })
      enterLive(updated)
    } catch (err) {
      console.error('Failed to start planned session', err)
      window.alert('Could not start this session — try again.')
    }
  }

  function handlePlanSession(session: WorkoutSession) {
    setPlanningSession(session)
    setShowWizard(true)
  }

  async function handleFinishSession() {
    if (!activeSession) return
    try {
      const now = new Date()
      const noteDoc = textToDoc(activeSessionNote)
      const session = activeSessionId
        ? await updateSession(activeSessionId, {
            status: 'completed',
            date: now.toISOString(),
            notes: noteDoc,
          })
        : await createSession({
            date: now.toISOString(),
            type: activeSession.type,
            notes: noteDoc,
          })

      // Save all exercise sets as SetEntry records
      const existingExercises = await fetchExercises()
      for (const ex of activeSession.exercises) {
        const filledSets = ex.sets.filter(
          (s) =>
            s.done ||
            s.w.trim() !== '' ||
            s.r.trim() !== '' ||
            !!s.distance_km ||
            !!s.duration_min,
        )
        if (filledSets.length === 0) continue

        let exercise = existingExercises.find(
          (e) => e.name.toLowerCase() === ex.name.trim().toLowerCase(),
        )
        if (!exercise) {
          exercise = await createExercise({
            name: ex.name.trim(),
            category: ex.category,
          })
          existingExercises.push(exercise)
        }

        for (let idx = 0; idx < filledSets.length; idx++) {
          const set = filledSets[idx]
          await createSetEntry(session.id, {
            exercise_id: exercise.id,
            set_number: idx + 1,
            reps: set.r ? parseInt(set.r, 10) || 0 : null,
            weight: set.w ? parseFloat(set.w) : null,
            distance_km: set.distance_km ? parseFloat(set.distance_km) : null,
            duration_min: set.duration_min
              ? parseFloat(set.duration_min)
              : null,
            feeling: set.feeling ?? null,
            notes: set.note?.trim() ? set.note.trim() : null,
          })
        }
      }
    } catch (err) {
      // Keep the session alive so no data is lost — the user can retry Finish.
      console.error('Failed to save workout session', err)
      window.alert(
        'Could not save your workout — your sets are still here. Check your connection and press Finish again.',
      )
      return
    }
    setActiveSession(null)
    setActiveSessionId(null)
    setActiveSessionNote('')
    await loadWeek()
  }

  const weeklySessions = currentWeekDays.filter((d) => d.hasSession).length

  // ISO week number of the Monday currently being viewed.
  function isoWeek(date: Date): number {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    )
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  }

  const viewedMonday = mondayFor(weekOffset)
  const weekNumber = isoWeek(viewedMonday)
  const nextPlanned = [...plannedSessions]
    .filter((s) => s.scheduled_at)
    .sort(
      (a, b) =>
        new Date(a.scheduled_at as string).getTime() -
        new Date(b.scheduled_at as string).getTime(),
    )[0]
  const headerSubtitle = activeSession
    ? activeSession.type
    : nextPlanned
      ? nextPlanned.type
      : ''

  // Deep link: ?session=<id> — jump to overview and highlight/open that session.
  useEffect(() => {
    const sessionParam = searchParams.get('session')
    if (!sessionParam) return
    if (tab !== 'overview') setTab('overview')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlightSessionId(sessionParam)
    const el = document.getElementById(`planned-session-${sessionParam}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, plannedSessions])

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
              {currentWeekDays.map((day, i) => {
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

            {/* Goals summary (read-only — managed in the Stats tab) */}
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
              Goals
            </div>
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
                    ? exerciseMap[goal.exercise_id]?.name || 'Exercise goal'
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
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <div className="fit-topbar">
            <div className="fit-topbar-row">
              <div className="fit-topbar-nav">
                <button
                  onClick={() => setSidebarOpen((open) => !open)}
                  aria-label={
                    sidebarOpen ? 'Hide navigation' : 'Show navigation'
                  }
                  aria-pressed={sidebarOpen}
                  className="fit-topbar-nav-btn"
                  style={{
                    position: isMobile ? 'absolute' : undefined,
                    left: isMobile ? 0 : undefined,
                    top: isMobile ? 2 : undefined,
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
                <h2 className="fit-topbar-title">Fitness</h2>
                <div className="fit-topbar-nav-buttons">
                  <button
                    onClick={() => setWeekOffset((o) => o - 1)}
                    aria-label="Previous week"
                    className="fit-topbar-nav-btn"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setWeekOffset((o) => o + 1)}
                    aria-label="Next week"
                    className="fit-topbar-nav-btn"
                  >
                    ›
                  </button>
                </div>
                <button
                  onClick={() => setWeekOffset(0)}
                  disabled={weekOffset === 0}
                  className="fit-topbar-today"
                >
                  Today
                </button>
                <span className="fit-topbar-sub">
                  Week {weekNumber}
                  {headerSubtitle ? ` · ${headerSubtitle}` : ''}
                </span>
              </div>
              <div
                className="fitness-tabs"
                style={{ margin: isMobile ? '0 auto' : undefined }}
              >
                <Segmented
                  value={tab}
                  options={[...TABS]}
                  onChange={setTab}
                  labels={{
                    overview: 'Overview',
                    stats: 'Stats',
                    history: 'History',
                  }}
                  ariaLabel="Fitness sections"
                />
              </div>
              <div className="fit-topbar-actions">
                <button
                  onClick={() => setShowLogPast(true)}
                  className="fit-topbar-secondary-btn"
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
                    className="fit-primary-button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
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
          </div>
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '28px 32px 64px',
              minWidth: 0,
            }}
          >
            {tab === 'overview' && (
              <>
                {/* Week strip */}
                <WeekStrip weekDays={weekDays} />

                {/* Highlight graphs — hidden while a session is live */}
                {activeSession ? (
                  <LiveSession
                    session={activeSession}
                    onUpdate={setActiveSession}
                    onFinish={handleFinishSession}
                    note={activeSessionNote}
                    onNoteChange={setActiveSessionNote}
                  />
                ) : (
                  <Overview
                    plannedSessions={plannedSessions}
                    onStartSession={handleStartPlanned}
                    onPlanSession={handlePlanSession}
                    highlightSessionId={highlightSessionId}
                  />
                )}
              </>
            )}

            {tab === 'stats' && (
              <>
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
                    <>
                      {(() => {
                        const entries = Object.entries(exerciseMap)
                        const cardio = entries.filter(
                          ([, ex]) => ex.category === 'cardio',
                        )
                        const strength = entries.filter(
                          ([, ex]) => ex.category !== 'cardio',
                        )
                        return (
                          <>
                            {cardio.length > 0 && (
                              <div style={{ marginBottom: '24px' }}>
                                <h3 className="fitness-section-title">
                                  Cardio
                                </h3>
                                <div className="fit-ex-grid">
                                  {cardio.map(([id, ex]) => (
                                    <button
                                      key={id}
                                      className={`fit-ex-card${statsExerciseId === id ? ' selected' : ''}`}
                                      onClick={() => setStatsExerciseId(id)}
                                    >
                                      <span className="fit-ex-card-name">
                                        {ex.name}
                                      </span>
                                      <CategoryBadge category={ex.category} />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {strength.length > 0 && (
                              <div style={{ marginBottom: '24px' }}>
                                <h3 className="fitness-section-title">
                                  Strength
                                </h3>
                                <div className="fit-ex-grid">
                                  {strength.map(([id, ex]) => (
                                    <button
                                      key={id}
                                      className={`fit-ex-card${statsExerciseId === id ? ' selected' : ''}`}
                                      onClick={() => setStatsExerciseId(id)}
                                    >
                                      <span className="fit-ex-card-name">
                                        {ex.name}
                                      </span>
                                      <CategoryBadge category={ex.category} />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </>
                  )
                )}
                <GoalsSection
                  goals={goals}
                  exerciseMap={exerciseMap}
                  onChanged={loadWeek}
                />
                <BodyMetricForm onSaved={loadWeek} />
              </>
            )}

            {tab === 'history' && (
              <>
                <SessionForm />
                <BodyMetricLog />
              </>
            )}
          </div>
        </main>
      </div>

      <SessionWizard
        open={showWizard}
        onClose={() => {
          setShowWizard(false)
          setPlanningSession(null)
        }}
        onStart={handleStartSession}
        planningSession={planningSession}
        onPlanned={() => loadWeek()}
      />
      <LogPastModal
        open={showLogPast}
        onClose={() => setShowLogPast(false)}
        onSaved={() => loadWeek()}
      />
    </div>
  )
}
