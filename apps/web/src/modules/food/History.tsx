import { useEffect, useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { BodyMetricLog } from '../fitness/BodyMetricLog'
import { fetchMealLogs, deleteMealLog, type MealLog } from './api'

interface HistoryProps {
  onSaved: () => void
  onEditMeal: (meal: MealLog) => void
  refreshKey?: number
  initialShowAll?: boolean
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function History({
  onSaved,
  onEditMeal,
  refreshKey,
  initialShowAll,
}: HistoryProps) {
  const [meals, setMeals] = useState<MealLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(initialShowAll ?? false)
  const [deleteTarget, setDeleteTarget] = useState<MealLog | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function loadMeals() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMealLogs()
      // Only show logged meals
      const logged = data.filter((m) => m.status === 'logged')
      setMeals(logged)
    } catch {
      setError('Failed to load meal history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMeals()
  }, [refreshKey])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteMealLog(deleteTarget.id)
      setDeleteTarget(null)
      await loadMeals()
      onSaved()
    } catch {
      setError('Failed to delete meal')
    } finally {
      setDeleting(false)
    }
  }

  const displayedMeals = showAll ? meals : meals.slice(0, 5)
  const hasMore = meals.length > 5

  return (
    <div style={{ animation: 'fadeUp .4s cubic-bezier(.16,1,.3,1) both' }}>
      {/* Logged meals */}
      <div className="food-history-section">
        <h3 className="food-section-title">
          Logged meals
          {meals.length > 0 && (
            <span className="food-history-count"> ({meals.length})</span>
          )}
        </h3>

        {loading && (
          <p
            style={{
              color: 'var(--text-tertiary)',
              fontSize: '13px',
            }}
          >
            Loading…
          </p>
        )}

        {error && (
          <p
            role="alert"
            style={{
              color: '#d9573f',
              fontSize: '13px',
            }}
          >
            {error}
          </p>
        )}

        {!loading && !error && meals.length === 0 && (
          <p
            style={{
              color: 'var(--text-tertiary)',
              fontSize: '13px',
            }}
          >
            No logged meals yet. Use the <strong>Log meal</strong> button to get
            started.
          </p>
        )}

        {!loading && displayedMeals.length > 0 && (
          <div className="food-history-list">
            {displayedMeals.map((meal, i) => (
              <div
                key={meal.id}
                id={`food-history-row-${meal.id}`}
                className="food-history-row"
                style={{
                  animationDelay: `${i * 40}ms`,
                }}
              >
                {/* Photo thumbnail */}
                <div className="food-history-photo">
                  {meal.photo_file_ids.length > 0 ? (
                    <>
                      <img
                        src={`/api/files/${meal.photo_file_ids[0]}`}
                        alt="Meal"
                        className="food-history-thumb"
                      />
                      {meal.photo_file_ids.length > 1 && (
                        <span className="food-history-photo-count">
                          +{meal.photo_file_ids.length - 1}
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="food-history-no-photo">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-tertiary)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="food-history-info">
                  <span className="food-history-type">
                    {meal.meal_type
                      ? meal.meal_type.charAt(0).toUpperCase() +
                        meal.meal_type.slice(1)
                      : 'Meal'}
                  </span>
                  <span className="food-history-macros">
                    {meal.calories != null && (
                      <>{Math.round(meal.calories)} kcal</>
                    )}
                    {meal.protein_g != null && (
                      <> · {Math.round(meal.protein_g)}g P</>
                    )}
                    {meal.carbs_g != null && (
                      <> · {Math.round(meal.carbs_g)}g C</>
                    )}
                    {meal.fat_g != null && <> · {Math.round(meal.fat_g)}g F</>}
                  </span>
                  <span className="food-history-date">
                    {meal.logged_at
                      ? formatDate(meal.logged_at)
                      : meal.date
                        ? formatDate(meal.date)
                        : ''}
                  </span>
                </div>

                {/* Actions */}
                <div className="food-history-actions">
                  <button
                    type="button"
                    className="food-history-action-btn"
                    onClick={() => onEditMeal(meal)}
                    aria-label="Edit meal"
                    title="Edit"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2l4 4-12 12H2v-4L14 2z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="food-history-action-btn food-history-action-delete"
                    onClick={() => setDeleteTarget(meal)}
                    disabled={deleting}
                    aria-label="Delete meal"
                    title="Delete"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    >
                      <path d="M5 5l10 10M15 5L5 15" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMore && (
          <button
            type="button"
            className="food-history-show-all"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Show less' : `Show all (${meals.length})`}
          </button>
        )}
      </div>

      {/* Body metrics log */}
      <BodyMetricLog />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        message="Delete this meal log?"
        detail="This cannot be undone. All attached photos will also be deleted."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
