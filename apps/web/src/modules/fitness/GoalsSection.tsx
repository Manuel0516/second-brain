import { useState } from 'react'
import { ProgressBar } from '../../components/ProgressBar'
import { createGoal, deleteGoal, type Goal } from './api'

/**
 * Goals management for the Stats tab (Phase F3): create/delete goals with
 * progress bars. The read-only summary in the sidebar stays in Fitness.tsx;
 * this owns the editing interaction.
 */
export function GoalsSection({
  goals,
  exerciseMap,
  onChanged,
}: {
  goals: Goal[]
  exerciseMap: Record<string, { name: string; category: string }>
  onChanged: () => Promise<void> | void
}) {
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<
    'exercise_max' | 'exercise_reps' | 'body_metric'
  >('exercise_max')
  const [exerciseId, setExerciseId] = useState('')
  const [metricKey, setMetricKey] = useState('weight')
  const [targetValue, setTargetValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!targetValue) return
    setCreating(true)
    try {
      await createGoal({
        target_type: type,
        exercise_id: type !== 'body_metric' ? exerciseId || null : null,
        metric_key: type === 'body_metric' ? metricKey : null,
        target_value: parseFloat(targetValue),
      })
      setShowForm(false)
      setTargetValue('')
      setExerciseId('')
      await onChanged()
    } catch {
      // fail gracefully — form stays open for retry
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(goalId: string) {
    setDeletingId(goalId)
    try {
      await deleteGoal(goalId)
      await onChanged()
    } catch {
      // fail gracefully
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="fitness-section" aria-label="Goals">
      <div className="fit-goals-head">
        <h3 className="fitness-section-title" style={{ margin: 0 }}>
          Goals
        </h3>
        <button
          type="button"
          className="fit-goals-toggle"
          aria-expanded={showForm}
          onClick={() => setShowForm((open) => !open)}
        >
          {showForm ? 'Cancel' : '+ Add goal'}
        </button>
      </div>

      {showForm && (
        <form className="fit-goal-form" onSubmit={handleCreate}>
          <label className="fit-goal-field">
            <span className="fit-goal-label">Type</span>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as typeof type)
                setExerciseId('')
              }}
            >
              <option value="exercise_max">Exercise max weight</option>
              <option value="exercise_reps">Exercise max reps</option>
              <option value="body_metric">Body metric</option>
            </select>
          </label>
          {type === 'body_metric' ? (
            <label className="fit-goal-field">
              <span className="fit-goal-label">Metric</span>
              <select
                value={metricKey}
                onChange={(e) => setMetricKey(e.target.value)}
              >
                <option value="weight">Weight</option>
                <option value="body_fat">Body fat %</option>
              </select>
            </label>
          ) : (
            <label className="fit-goal-field">
              <span className="fit-goal-label">Exercise</span>
              <select
                value={exerciseId}
                onChange={(e) => setExerciseId(e.target.value)}
              >
                <option value="">Select exercise…</option>
                {Object.entries(exerciseMap).map(([id, ex]) => (
                  <option key={id} value={id}>
                    {ex.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="fit-goal-field">
            <span className="fit-goal-label">Target</span>
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="Target value"
              min="0"
              step="0.5"
              required
            />
          </label>
          <button
            type="submit"
            className="fit-goal-submit"
            disabled={!targetValue || creating}
          >
            {creating ? 'Adding…' : 'Add goal'}
          </button>
        </form>
      )}

      {goals.length === 0 && !showForm ? (
        <p className="fit-goals-empty">
          No goals yet. Add one to track progress against your training.
        </p>
      ) : (
        <div className="fit-goals-grid">
          {goals.map((goal, i) => {
            const label = goal.exercise_id
              ? exerciseMap[goal.exercise_id]?.name || 'Exercise goal'
              : (goal.metric_key ?? goal.target_type)
            return (
              <div
                key={goal.id}
                className="fit-goal-card"
                style={
                  { '--enter-delay': `${i * 40}ms` } as React.CSSProperties
                }
              >
                <ProgressBar
                  label={label}
                  value={goal.current_value ?? 0}
                  max={goal.target_value}
                  sublabel={`${goal.current_value ?? 0} / ${goal.target_value}`}
                />
                <button
                  type="button"
                  className="fit-goal-delete"
                  onClick={() => handleDelete(goal.id)}
                  disabled={deletingId === goal.id}
                  aria-label={`Delete goal ${label}`}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
