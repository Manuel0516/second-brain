import { useEffect, useRef, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  fetchStatsOverview,
  fetchExercises,
  fetchExerciseStats,
  fetchBodyWeightStats,
  type OverviewStats,
  type ExerciseStats as ExerciseStatsResp,
  type BodyWeightStats,
  type WorkoutSession,
} from './api'
import { useSettings } from '../../context/SettingsContext'
import { toDisplayWeight } from './units'

const tooltipStyle = {
  background: '#1C1B17',
  border: '1px solid rgba(255,240,200,0.12)',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#F0EDE5',
}

const axisTick = { fontSize: 10, fill: '#6B6761' }

const FEELING_LABELS = ['', 'Dying', 'Rough', 'OK', 'Good', 'Great']

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** Extracts plain text from a Tiptap/ProseMirror-style doc (paragraphs of text nodes). */
function plainTextFromDoc(
  doc: Record<string, unknown> | null | undefined,
): string {
  const content = (doc as { content?: unknown[] } | undefined)?.content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const node of content) {
    const inline = (node as { content?: { text?: string }[] }).content
    if (Array.isArray(inline)) {
      for (const leaf of inline) {
        if (leaf.text) parts.push(leaf.text)
      }
    }
  }
  return parts.join(' ').trim()
}

function formatScheduled(iso: string | null): string {
  if (!iso) return 'Unscheduled'
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface Props {
  plannedSessions: WorkoutSession[]
  onStartSession: (session: WorkoutSession) => void
  onPlanSession: (session: WorkoutSession) => void
  highlightSessionId?: string | null
}

/**
 * Overview landing: planned-workouts strip (Wave 2) + body weight, top-exercise
 * progression, feeling trend graphs (Phase F3) — the exercise and body-metric
 * graphs are swappable via ‹ › arrows. Rendered on the Overview tab only while
 * no live session is active — the parent unmounts this when a session starts.
 */
export function Overview({
  plannedSessions,
  onStartSession,
  onPlanSession,
  highlightSessionId,
}: Props) {
  const { settings } = useSettings()
  const weightUnit = settings.fitness_weight_unit
  const [data, setData] = useState<OverviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [statsError, setStatsError] = useState(false)

  const [exerciseList, setExerciseList] = useState<
    { id: string; name: string }[]
  >([])
  const [exerciseIdx, setExerciseIdx] = useState(0)
  const [currentExerciseStats, setCurrentExerciseStats] =
    useState<ExerciseStatsResp | null>(null)
  const exerciseStatsCache = useRef<Map<string, ExerciseStatsResp>>(new Map())

  const [bwMetrics, setBwMetrics] = useState<BodyWeightStats['metrics']>([])

  useEffect(() => {
    let cancelled = false
    fetchStatsOverview()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        // fail gracefully — graphs don't render, but the page stays alive
        if (!cancelled) setStatsError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    fetchExercises()
      .then((list) => {
        if (!cancelled)
          setExerciseList(list.map((e) => ({ id: e.id, name: e.name })))
      })
      .catch(() => {})
    fetchBodyWeightStats()
      .then((bw) => {
        if (!cancelled) setBwMetrics(bw.metrics ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Default the exercise graph to the overview's "most trained" pick once both load.
  useEffect(() => {
    if (data?.top_exercise && exerciseList.length > 0) {
      const idx = exerciseList.findIndex(
        (e) => e.id === data.top_exercise!.exercise.id,
      )
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (idx >= 0) setExerciseIdx(idx)
    }
  }, [data, exerciseList])

  const currentExercise = exerciseList[exerciseIdx]

  useEffect(() => {
    if (!currentExercise) return
    const cached = exerciseStatsCache.current.get(currentExercise.id)
    if (cached) {
      setCurrentExerciseStats(cached)
      return
    }
    let cancelled = false
    fetchExerciseStats(currentExercise.id)
      .then((stats) => {
        if (cancelled) return
        exerciseStatsCache.current.set(currentExercise.id, stats)
        setCurrentExerciseStats(stats)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [currentExercise])

  function cycleExercise(dir: 1 | -1) {
    if (exerciseList.length === 0) return
    setExerciseIdx((i) => (i + dir + exerciseList.length) % exerciseList.length)
  }

  if (loading) {
    return (
      <div className="fit-overview-grid" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="fit-overview-card fit-overview-skeleton"
            style={{ '--enter-delay': `${i * 60}ms` } as React.CSSProperties}
          />
        ))}
      </div>
    )
  }

  const metricSeries = bwMetrics
    .filter((m) => m.weight != null)
    .map((m) => ({
      date: m.date,
      value: toDisplayWeight(m.weight as number, weightUnit),
    }))
  const hasMetric = metricSeries.length > 1

  const isCardio = currentExerciseStats?.category === 'cardio'
  const exerciseSeries = isCardio
    ? (currentExerciseStats?.distance_over_time ?? [])
    : (currentExerciseStats?.progression ?? []).map((p) => ({
        ...p,
        max_weight: toDisplayWeight(p.max_weight, weightUnit),
      }))
  const hasTop = !!currentExercise && exerciseSeries.length > 1

  const hasFeeling = (data?.feeling_series?.length ?? 0) > 1
  const sortedPlanned = [...plannedSessions].sort((a, b) => {
    if (!a.scheduled_at && !b.scheduled_at) return 0
    if (!a.scheduled_at) return 1
    if (!b.scheduled_at) return -1
    return (
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    )
  })

  if (!hasMetric && !hasTop && !hasFeeling && sortedPlanned.length === 0) {
    return (
      <div
        className="fit-overview-empty"
        role={statsError ? 'alert' : undefined}
      >
        {statsError
          ? 'Could not load your fitness stats — check that the API is running and reload.'
          : 'Log sessions and body weight to see your highlights here.'}
      </div>
    )
  }

  let delay = 0
  const nextDelay = () => `${delay++ * 60}ms`

  return (
    <>
      {sortedPlanned.length > 0 && (
        <div className="fit-planned-list">
          <h3 className="fitness-section-title" style={{ margin: '0 0 10px' }}>
            Planned workouts
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sortedPlanned.map((session) => {
              const note = plainTextFromDoc(session.notes)
              const exCount = session.plan?.length ?? 0
              return (
                <div
                  key={session.id}
                  id={`planned-session-${session.id}`}
                  className={`fit-planned-card${
                    highlightSessionId === session.id ? ' highlight' : ''
                  }`}
                >
                  <div className="fit-planned-info">
                    <strong>{session.type}</strong>
                    <span className="fit-planned-meta">
                      {formatScheduled(session.scheduled_at)}
                    </span>
                    <span className="fit-planned-meta">
                      {exCount > 0
                        ? `${exCount} exercise${exCount === 1 ? '' : 's'} planned`
                        : 'No exercises planned yet'}
                    </span>
                    {note && <p className="fit-planned-note">{note}</p>}
                  </div>
                  <div className="fit-planned-actions">
                    <button
                      className="fit-secondary-button"
                      type="button"
                      onClick={() => onPlanSession(session)}
                    >
                      {exCount > 0 ? 'Edit plan' : 'Plan'}
                    </button>
                    <button
                      className="fit-primary-button"
                      type="button"
                      onClick={() => onStartSession(session)}
                    >
                      Start now
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="fit-overview-grid">
        {hasMetric && (
          <section
            className="fit-overview-card"
            style={{ '--enter-delay': nextDelay() } as React.CSSProperties}
            aria-label="Body weight trend"
          >
            <div className="fit-overview-card-head">
              <h4 className="fitness-section-title" style={{ margin: 0 }}>
                Body weight
              </h4>
              <span className="fit-overview-meta">
                {metricSeries[metricSeries.length - 1].value} {weightUnit}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={metricSeries}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,240,200,0.06)"
                />
                <XAxis
                  dataKey="date"
                  tick={axisTick}
                  tickFormatter={shortDate}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => shortDate(String(label))}
                  formatter={(v) => [`${v} ${weightUnit}`, 'Body weight']}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#22D3EE"
                  strokeWidth={1.8}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>
        )}

        {hasTop && currentExercise && (
          <section
            className="fit-overview-card"
            style={{ '--enter-delay': nextDelay() } as React.CSSProperties}
            aria-label={`${currentExercise.name} progression`}
          >
            <div className="fit-overview-card-head">
              <h4 className="fitness-section-title" style={{ margin: 0 }}>
                {currentExercise.name}
              </h4>
              <div className="fit-overview-arrows">
                <button
                  className="fit-week-nav"
                  type="button"
                  onClick={() => cycleExercise(-1)}
                  aria-label="Previous exercise"
                  disabled={exerciseList.length <= 1}
                >
                  ‹
                </button>
                <span className="fit-overview-meta">
                  {currentExercise.name}
                </span>
                <button
                  className="fit-week-nav"
                  type="button"
                  onClick={() => cycleExercise(1)}
                  aria-label="Next exercise"
                  disabled={exerciseList.length <= 1}
                >
                  ›
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={exerciseSeries as { date: string }[]}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,240,200,0.06)"
                />
                <XAxis
                  dataKey="date"
                  tick={axisTick}
                  tickFormatter={shortDate}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => shortDate(String(label))}
                  formatter={(v, name) =>
                    isCardio
                      ? [`${v} km`, 'Distance']
                      : [
                          name === 'max_weight' ? `${v} ${weightUnit}` : v,
                          name === 'max_weight' ? 'Max weight' : 'Max reps',
                        ]
                  }
                />
                <Line
                  type="monotone"
                  dataKey={isCardio ? 'distance_km' : 'max_weight'}
                  stroke="#22D3EE"
                  strokeWidth={1.8}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>
        )}

        {hasFeeling && data && (
          <section
            className="fit-overview-card"
            style={{ '--enter-delay': nextDelay() } as React.CSSProperties}
            aria-label="Training feeling trend"
          >
            <div className="fit-overview-card-head">
              <h4 className="fitness-section-title" style={{ margin: 0 }}>
                Feeling trend
              </h4>
              <span className="fit-overview-meta">
                {data.sessions_last_30_days} sessions / 30d
              </span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={data.feeling_series}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,240,200,0.06)"
                />
                <XAxis
                  dataKey="date"
                  tick={axisTick}
                  tickFormatter={shortDate}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[1, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => shortDate(String(label))}
                  formatter={(v) => [
                    `${v} · ${FEELING_LABELS[Math.round(Number(v))] ?? ''}`,
                    'Feeling',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="feeling"
                  stroke="#22D3EE"
                  strokeWidth={1.8}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>
        )}
      </div>
    </>
  )
}
