import { useEffect, useState } from 'react'
import { updateMealLog, type MealLog, type FoodSummary } from './api'

interface OverviewProps {
  summary: FoodSummary | null
  weekOffset: number
  onLogMeal: (meal?: MealLog | null, mealType?: string) => void
  onSaved: () => void
}

function mondayFor(offset: number): Date {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offset * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

export function Overview({
  summary,
  weekOffset,
  onLogMeal,
  onSaved,
}: OverviewProps) {
  const monday = mondayFor(weekOffset)
  const todayStr = localDateStr(new Date())

  // Build week days array
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { date: d, dateStr: localDateStr(d), label: DAY_LABELS[i] }
  })

  // Collect all planned meals for the week
  const allPlannedMeals: MealLog[] = []
  if (summary?.days) {
    for (const day of summary.days) {
      for (const meal of day.meals) {
        if (meal.status === 'planned') {
          allPlannedMeals.push(meal)
        }
      }
    }
  }

  // Sort planned meals from sooner to later
  allPlannedMeals.sort((a, b) => {
    const aTime = a.scheduled_at
      ? new Date(a.scheduled_at).getTime()
      : new Date(a.date).getTime()
    const bTime = b.scheduled_at
      ? new Date(b.scheduled_at).getTime()
      : new Date(b.date).getTime()
    return aTime - bTime
  })

  // Collect all logged meals for the week (so past weeks show something
  // other than the "no planned meals" empty state)
  const allLoggedMeals: MealLog[] = []
  if (summary?.days) {
    for (const day of summary.days) {
      for (const meal of day.meals) {
        if (meal.status === 'logged') {
          allLoggedMeals.push(meal)
        }
      }
    }
  }
  allLoggedMeals.sort((a, b) => {
    const aTime = a.logged_at
      ? new Date(a.logged_at).getTime()
      : new Date(a.date).getTime()
    const bTime = b.logged_at
      ? new Date(b.logged_at).getTime()
      : new Date(b.date).getTime()
    return bTime - aTime
  })

  // Per-day counts for the week strip circles
  function getDayMeals(dateStr: string): {
    planned: number
    logged: number
  } {
    const day = summary?.days.find((d) => d.date === dateStr)
    if (!day) return { planned: 0, logged: 0 }
    const planned = day.meals.filter((m) => m.status === 'planned').length
    const logged = day.meals.filter((m) => m.status === 'logged').length
    return { planned, logged }
  }

  // Auto-open calendar-linked meal within ±15 minutes of now
  useEffect(() => {
    const now = new Date()
    const windowMs = 15 * 60 * 1000 // ±15 minutes
    for (const meal of allPlannedMeals) {
      if (!meal.scheduled_at) continue
      const scheduled = new Date(meal.scheduled_at)
      const diff = Math.abs(now.getTime() - scheduled.getTime())
      if (diff <= windowMs) {
        onLogMeal(meal)
        break
      }
    }
    // ponytail: run only on mount — not on planned-meals changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState('')

  async function handleSaveNote(meal: MealLog) {
    try {
      await updateMealLog(meal.id, { notes: editingNote || null })
      setEditingNoteId(null)
      onSaved()
    } catch {
      // silently fail — note stays in local state
    }
  }

  return (
    <div style={{ animation: 'fadeUp .4s cubic-bezier(.16,1,.3,1) both' }}>
      {/* Week strip */}
      <div className="food-overview-weekstrip">
        {weekDays.map((d) => {
          const isToday = d.dateStr === todayStr
          const { planned, logged } = getDayMeals(d.dateStr)
          const totalCircles = Math.max(planned + logged, 1)
          const circles = Array.from({ length: totalCircles }, (_, i) => {
            if (i < logged) return 'logged'
            if (i < logged + planned) return 'planned'
            return 'empty'
          })

          return (
            <div
              key={d.label}
              className={`food-overview-day${isToday ? ' today' : ''}`}
            >
              <span className="food-overview-day-label">{d.label}</span>
              <div className="food-overview-circles">
                {circles.map((status, i) => (
                  <svg key={i} width="20" height="20" viewBox="0 0 20 20">
                    {status === 'logged' ? (
                      <circle
                        cx="10"
                        cy="10"
                        r="10"
                        fill="var(--food-accent)"
                      />
                    ) : status === 'planned' ? (
                      <circle
                        cx="10"
                        cy="10"
                        r="9"
                        fill="none"
                        stroke="var(--food-accent-border)"
                        strokeWidth="2"
                      />
                    ) : (
                      <circle
                        cx="10"
                        cy="10"
                        r="9"
                        fill="none"
                        stroke="var(--border-grid)"
                        strokeWidth="2"
                      />
                    )}
                  </svg>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Planned meals cards */}
      {allPlannedMeals.length > 0 && (
        <div className="food-overview-section">
          <h3 className="food-section-title">Planned meals</h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {allPlannedMeals.map((meal) => {
              const isEditing = editingNoteId === meal.id

              return (
                <div key={meal.id} className="food-planned-card">
                  <div className="food-planned-info">
                    <strong>
                      {meal.meal_type
                        ? meal.meal_type.charAt(0).toUpperCase() +
                          meal.meal_type.slice(1)
                        : 'Meal'}
                    </strong>
                    <span className="food-planned-meta">
                      {formatScheduled(meal.scheduled_at)}
                    </span>
                    {!isEditing && meal.notes && (
                      <p className="food-planned-note">{meal.notes}</p>
                    )}
                  </div>
                  <div className="food-planned-actions">
                    {isEditing ? (
                      <>
                        <input
                          value={editingNote}
                          onChange={(e) => setEditingNote(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveNote(meal)
                            if (e.key === 'Escape') setEditingNoteId(null)
                          }}
                          className="food-planned-note-input"
                          placeholder="Add a note…"
                        />
                        <button
                          type="button"
                          className="food-secondary-button"
                          onClick={() => handleSaveNote(meal)}
                        >
                          Save
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="food-secondary-button"
                          onClick={() => {
                            setEditingNoteId(meal.id)
                            setEditingNote(meal.notes ?? '')
                          }}
                        >
                          Edit note
                        </button>
                        <button
                          type="button"
                          className="food-primary-button"
                          onClick={() => onLogMeal(meal)}
                        >
                          Log meal
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Logged meals cards */}
      {allLoggedMeals.length > 0 && (
        <div className="food-overview-section">
          <h3 className="food-section-title">Logged meals</h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {allLoggedMeals.map((meal) => (
              <div key={meal.id} className="food-planned-card">
                <div className="food-planned-info">
                  <strong>
                    {meal.meal_type
                      ? meal.meal_type.charAt(0).toUpperCase() +
                        meal.meal_type.slice(1)
                      : 'Meal'}
                  </strong>
                  <span className="food-planned-meta">
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
                    {' · '}
                    {formatScheduled(meal.logged_at ?? meal.date)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {allPlannedMeals.length === 0 && allLoggedMeals.length === 0 && (
        <div className="food-overview-empty">
          No planned meals for this week. <br />
          Add meals via your calendar or tap <strong>Log meal</strong> to get
          started.
        </div>
      )}
    </div>
  )
}
