import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { BodyWeightCard } from '../../components/BodyWeightCard'
import { useSettings } from '../../context/SettingsContext'
import { toDisplayWeight, fromDisplayWeight } from './units'
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
  fetchSetEntries,
  fetchEvents,
  fetchBodyMetrics,
  fetchGoals,
  updateGoal,
  fetchBodyWeightStats,
  fetchExercises,
  fetchPlannedSessions,
  updateSession,
  type BodyMetric,
  type Goal,
  type BodyWeightStats,
  type SetEntry,
  type WorkoutSession,
} from './api'
import './fitness.css'

const TABS = ['overview', 'stats', 'history'] as const
type FitnessTab = (typeof TABS)[number]

type PreviousLookup = {
  exact: Record<string, string>
  category: Record<'strength' | 'cardio' | 'mobility', string>
}

const EMPTY_PREVIOUS_LOOKUP: PreviousLookup = {
  exact: {},
  category: { strength: '', cardio: '', mobility: '' },
}

function compactNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, '')
}

function formatSetSummary(
  set: SetEntry,
  category: 'strength' | 'cardio' | 'mobility',
): string | null {
  if (category === 'cardio') {
    if (set.distance_km == null || set.duration_min == null) return null
    return `${compactNumber(set.distance_km)} km / ${compactNumber(set.duration_min)} min`
  }
  if (set.weight != null && set.reps != null) {
    return `${compactNumber(set.weight)}×${set.reps}`
  }
  if (set.weight != null) return `${compactNumber(set.weight)}×—`
  if (set.reps != null) return `—×${set.reps}`
  return null
}

function buildPreviousLookup(
  sessions: WorkoutSession[],
  setEntriesBySession: Record<string, SetEntry[]>,
  exerciseMap: Record<string, { name: string; category: string }>,
): PreviousLookup {
  const exact: Record<string, string> = {}
  const category: PreviousLookup['category'] = {
    strength: '',
    cardio: '',
    mobility: '',
  }

  for (const session of [...sessions].sort(
    (a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime() ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )) {
    const grouped = new Map<string, SetEntry[]>()
    for (const set of setEntriesBySession[session.id] ?? []) {
      const list = grouped.get(set.exercise_id)
      if (list) list.push(set)
      else grouped.set(set.exercise_id, [set])
    }

    for (const [exerciseId, sets] of grouped) {
      const exercise = exerciseMap[exerciseId]
      if (!exercise) continue
      const summary = sets
        .map((set) =>
          formatSetSummary(
            set,
            exercise.category as 'strength' | 'cardio' | 'mobility',
          ),
        )
        .filter((value): value is string => !!value)
        .join(', ')
      if (!summary) continue
      if (!exact[exercise.name]) exact[exercise.name] = summary
      if (!category[exercise.category as 'strength' | 'cardio' | 'mobility']) {
        category[exercise.category as 'strength' | 'cardio' | 'mobility'] =
          summary
      }
    }
  }

  return { exact, category }
}

const LIVE_SESSION_KEY = 'sb-fitness-live-session'

type StoredLiveSession = {
  session: ActiveSession
  sessionId: string | null
  note: string
}

function loadStoredLiveSession(): StoredLiveSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LIVE_SESSION_KEY)
    return raw ? (JSON.parse(raw) as StoredLiveSession) : null
  } catch {
    return null
  }
}

export function Fitness() {
  const { settings } = useSettings()
  const weightUnit = settings.fitness_weight_unit
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
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    () => loadStoredLiveSession()?.session ?? null,
  )
  // DB id of the session backing the live session, when it originated from a
  // planned/active one — set so Finish PATCHes it instead of POSTing a new row.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    () => loadStoredLiveSession()?.sessionId ?? null,
  )
  const [activeSessionNote, setActiveSessionNote] = useState(
    () => loadStoredLiveSession()?.note ?? '',
  )

  // Persist the live session so it survives navigation, reload, or logout —
  // restored via the lazy useState initializers above.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return
    if (!activeSession) {
      window.localStorage.removeItem(LIVE_SESSION_KEY)
      return
    }
    const stored: StoredLiveSession = {
      session: activeSession,
      sessionId: activeSessionId,
      note: activeSessionNote,
    }
    window.localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify(stored))
  }, [activeSession, activeSessionId, activeSessionNote])
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
  const [previousLookup, setPreviousLookup] = useState<PreviousLookup>(
    EMPTY_PREVIOUS_LOOKUP,
  )
  const [exerciseMap, setExerciseMap] = useState<
    Record<string, { name: string; category: string }>
  >({})
  const [dragGoalId, setDragGoalId] = useState<string | null>(null)

  // ponytail: Pointer Events (not HTML5 drag-and-drop) so reordering works
  // with touch on phones, not just mouse.
  function handleGoalPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    goalId: string,
  ) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragGoalId(goalId)
  }

  function handleGoalPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragGoalId) return
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest('[data-goal-id]')
    const overId = target?.getAttribute('data-goal-id')
    if (!overId || overId === dragGoalId) return
    setGoals((prev) => {
      const from = prev.findIndex((g) => g.id === dragGoalId)
      const to = prev.findIndex((g) => g.id === overId)
      if (from === -1 || to === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function handleGoalPointerUp() {
    if (!dragGoalId) return
    setDragGoalId(null)
    setGoals((current) => {
      current.forEach((g, i) => {
        if (g.order_index !== i) {
          updateGoal(g.id, { order_index: i }).catch(() => {})
        }
      })
      return current.map((g, i) => ({ ...g, order_index: i }))
    })
  }

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

    const completedSessions = await fetchSessions(
      new Date(0).toISOString(),
      undefined,
    )
    const completedSets = await Promise.all(
      completedSessions.map(async (session) => [
        session.id,
        await fetchSetEntries(session.id),
      ]),
    )
    setPreviousLookup(
      buildPreviousLookup(
        completedSessions,
        Object.fromEntries(completedSets),
        map,
      ),
    )

    const [planned, active] = await Promise.all([
      fetchPlannedSessions('planned'),
      fetchPlannedSessions('active'),
    ])
    setPlannedSessions([...planned, ...active])
  }

  useEffect(() => {
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

  function applyPreviousLookup(session: ActiveSession): ActiveSession {
    return {
      ...session,
      exercises: session.exercises.map((exercise) => {
        const exact = previousLookup.exact[exercise.name]
        const category = exercise.category
          ? previousLookup.category[exercise.category]
          : undefined
        return {
          ...exercise,
          prev: exact ?? category ?? PREV_PERFORMANCE[exercise.name] ?? '—',
        }
      }),
    }
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
            weight: set.w
              ? fromDisplayWeight(parseFloat(set.w), weightUnit)
              : null,
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
  const activeSessionView = activeSession
    ? applyPreviousLookup(activeSession)
    : null
  const headerSubtitle = activeSession
    ? activeSession.type
    : nextPlanned
      ? nextPlanned.type
      : ''

  // Deep link: ?edit_session=<id> — jump to history and auto-edit that session.
  const [editSessionId, setEditSessionId] = useState<string | null>(null)
  const handledEditSessionRef = useRef<string | null>(null)
  useEffect(() => {
    const sessionParam = searchParams.get('edit_session')
    if (!sessionParam || sessionParam === handledEditSessionRef.current) return
    handledEditSessionRef.current = sessionParam
    if (tab !== 'history') setTab('history')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditSessionId(sessionParam)
  }) // intentional: no deps — reads fresh searchParams on every render, ref prevents re-processing

  // Deep link: ?session=<id> — jump to overview and highlight/open that session.
  const handledSessionRef = useRef<string | null>(null)
  useEffect(() => {
    const sessionParam = searchParams.get('session')
    if (!sessionParam || sessionParam === handledSessionRef.current) return
    handledSessionRef.current = sessionParam
    if (tab !== 'overview') setTab('overview')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlightSessionId(sessionParam)
  }) // intentional: no deps

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
                fontFamily: 'var(--font-mono)',
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

            {settings.fitness_weekly_session_target != null && (
              <div
                style={{
                  padding: '9px 10px',
                  marginBottom: '18px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid rgba(255,240,200,0.07)',
                  borderRadius: '8px',
                }}
              >
                <ProgressBar
                  label="Weekly sessions"
                  value={weeklySessions}
                  max={settings.fitness_weekly_session_target}
                  sublabel={`${weeklySessions} / ${settings.fitness_weekly_session_target} this week`}
                />
              </div>
            )}

            {/* Goals summary (read-only — managed in the Stats tab) */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
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
                      data-goal-id={goal.id}
                      onPointerDown={(e) => handleGoalPointerDown(e, goal.id)}
                      onPointerMove={handleGoalPointerMove}
                      onPointerUp={handleGoalPointerUp}
                      onPointerCancel={handleGoalPointerUp}
                      aria-label={`Reorder ${label}`}
                      className={`fit-goal-sidebar-card${dragGoalId === goal.id ? ' is-dragging' : ''}`}
                      style={{
                        padding: '9px 10px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid rgba(255,240,200,0.07)',
                        borderRadius: '8px',
                        position: 'relative',
                        cursor: 'grab',
                        touchAction: 'none',
                        opacity: dragGoalId === goal.id ? 0.6 : 1,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <ProgressBar
                          label={label}
                          value={goal.current_value ?? 0}
                          max={goal.target_value}
                          sublabel={`${goal.current_value ?? 0} / ${goal.target_value}`}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {lastMetric && (
              <BodyWeightCard
                lastWeight={
                  lastMetric.weight != null
                    ? toDisplayWeight(lastMetric.weight, weightUnit)
                    : null
                }
                weightUnit={weightUnit}
                metrics={bodyWeightData?.metrics ?? []}
                trend={
                  bodyWeightData?.trend != null
                    ? toDisplayWeight(bodyWeightData.trend, weightUnit)
                    : null
                }
                onOpenLog={() => {
                  setTab('stats')
                  setTimeout(() => {
                    document
                      .querySelector('.fitness-section-title')
                      ?.scrollIntoView({ behavior: 'smooth' })
                  }, 100)
                }}
              />
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
                {activeSessionView ? (
                  <LiveSession
                    session={activeSessionView}
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
                <SessionForm
                  editSessionId={editSessionId}
                  onEditConsumed={() => setEditSessionId(null)}
                  initialShowAll={!!editSessionId}
                />
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
