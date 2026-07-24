import { useState } from 'react'
import { ProgressBar } from '../../components/ProgressBar'
import { createGoal, deleteGoal, updateGoal, type Goal } from './api'

/**
 * Goals management for the Stats tab (Phase F3): create/edit/delete goals
 * with progress bars. The read-only, reorderable summary in the sidebar
 * stays in Fitness.tsx; this owns the editing interaction.
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [type, setType] = useState<
    'exercise_max' | 'exercise_reps' | 'body_metric'
  >('exercise_max')
  const [exerciseId, setExerciseId] = useState('')
  const [metricKey, setMetricKey] = useState('weight')
  const [targetValue, setTargetValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function resetForm() {
    setShowForm(false)
    setEditingId(null)
    setTargetValue('')
    setExerciseId('')
    setType('exercise_max')
    setMetricKey('weight')
  }

  function startEdit(goal: Goal) {
    setEditingId(goal.id)
    setType(goal.target_type)
    setExerciseId(goal.exercise_id ?? '')
    setMetricKey(goal.metric_key ?? 'weight')
    setTargetValue(String(goal.target_value))
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!targetValue) return
    setSaving(true)
    try {
      const payload = {
        target_type: type,
        exercise_id: type !== 'body_metric' ? exerciseId || null : null,
        metric_key: type === 'body_metric' ? metricKey : null,
        target_value: parseFloat(targetValue),
      }
      if (editingId) {
        await updateGoal(editingId, payload)
      } else {
        await createGoal(payload)
      }
      resetForm()
      await onChanged()
    } catch {
      // fail gracefully — form stays open for retry
    } finally {
      setSaving(false)
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
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
        >
          {showForm ? 'Cancel' : '+ Add goal'}
        </button>
      </div>

      {showForm && (
        <form className="fit-goal-form" onSubmit={handleSubmit}>
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
          {type === 'body_metric' ? null : (
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
            disabled={!targetValue || saving}
          >
            {saving ? 'Saving…' : editingId ? 'Save goal' : 'Add goal'}
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
                  { '--enter-delay': `${i * 24}ms` } as React.CSSProperties
                }
              >
                <ProgressBar
                  label={label}
                  value={goal.current_value ?? 0}
                  max={goal.target_value}
                  sublabel={`${goal.current_value ?? 0} / ${goal.target_value}`}
                />
                <div className="fit-goal-card-actions">
                  <button
                    type="button"
                    className="fit-goal-edit"
                    onClick={() => startEdit(goal)}
                    aria-label={`Edit goal ${label}`}
                  >
                    ✎
                  </button>
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
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
