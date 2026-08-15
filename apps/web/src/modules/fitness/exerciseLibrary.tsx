import type { Exercise } from './api'

// Session types → default exercise list. Keys match SESSION_TYPES
// (sessionTypes.ts) exactly — Custom has no defaults, exercises are typed in.
export const EXERCISE_LIBRARY: Record<string, string[]> = {
  Push: [
    'Bench Press',
    'Overhead Press',
    'Incline DB Press',
    'Cable Flyes',
    'Tricep Pushdowns',
    'Tricep Dips',
    'Lateral Raises',
  ],
  Pull: [
    'Deadlift',
    'Pull-ups',
    'Barbell Row',
    'Cable Row',
    'Face Pulls',
    'Bicep Curls',
    'Hammer Curls',
  ],
  Legs: [
    'Squat',
    'Romanian Deadlift',
    'Leg Press',
    'Leg Curl',
    'Calf Raises',
    'Bulgarian Split Squat',
    'Hip Thrust',
  ],
  Upper: [
    'Bench Press',
    'Overhead Press',
    'Pull-ups',
    'Barbell Row',
    'Lateral Raises',
    'Bicep Curls',
    'Tricep Pushdowns',
  ],
  Cardio: ['Running', 'Swimming', 'Cycling', 'Hiking', 'Rowing', 'Jump Rope'],
  Custom: [],
}

export interface ExerciseCandidate {
  name: string
  category: string
}

/**
 * Keep the plan picker and live-session picker on the same exercise source.
 * Ordered so exercises matching `sessionType`'s curated defaults (e.g. Legs →
 * Squat, Leg Press, ...) come first, and every other known exercise — any
 * category, any session type — follows below rather than being hidden.
 */
export function mergeExerciseCandidates(
  dbExercises: Exercise[],
  sessionType: string,
): ExerciseCandidate[] {
  const seen = new Set<string>()
  const primary: ExerciseCandidate[] = []
  const rest: ExerciseCandidate[] = []
  const libraryCategory = sessionType === 'Cardio' ? 'cardio' : 'strength'
  const libraryNames = new Set(
    (EXERCISE_LIBRARY[sessionType] || []).map((name) => name.toLowerCase()),
  )

  for (const exercise of dbExercises) {
    const key = exercise.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    ;(libraryNames.has(key) ? primary : rest).push({
      name: exercise.name,
      category: exercise.category,
    })
  }
  for (const name of EXERCISE_LIBRARY[sessionType] || []) {
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    primary.push({ name, category: libraryCategory })
  }
  return [...primary, ...rest]
}

// ponytail: PREV_PERFORMANCE hints are fake data, but SessionWizard.tsx still
// reads this export — kept in place to avoid breaking that file. LiveSession
// no longer treats it as a source of truth for cardio/strength categorization.
export const PREV_PERFORMANCE: Record<string, string> = {
  'Bench Press': '90×8, 90×8, 90×6',
  'Overhead Press': '60×8, 60×8',
  'Incline DB Press': '32×10, 32×10',
  'Cable Flyes': '20×15, 20×15',
  'Tricep Pushdowns': '25×12, 25×12',
  'Tricep Dips': 'BW×12, BW×10',
  'Lateral Raises': '12×15, 12×15',
  Deadlift: '120×5, 120×5',
  'Pull-ups': 'BW×8, BW×7',
  'Barbell Row': '80×8, 80×8',
  'Cable Row': '60×10, 60×10',
  'Face Pulls': '15×15, 15×15',
  'Bicep Curls': '16×12, 16×10',
  'Hammer Curls': '16×12, 16×10',
  Squat: '100×5, 100×5',
  'Romanian Deadlift': '90×8, 90×8',
  'Leg Press': '160×10, 160×10',
  'Leg Curl': '45×12, 45×12',
  'Calf Raises': '60×15, 60×15',
  'Bulgarian Split Squat': '30×8, 30×8',
  'Hip Thrust': '100×10, 100×8',
}

const CARDIO_NAMES = new Set(EXERCISE_LIBRARY.Cardio)

/** True when `name` matches the Cardio library — a heuristic for exercises
 * that don't exist in the DB yet (and so have no real `category`). */
export function isCardioName(name: string): boolean {
  return CARDIO_NAMES.has(name)
}

/** Shared 1–5 feeling scale labels — live logging, past logging, and history
 * editing all render the same five-button feeling fieldset. */
export const FEELING_LABELS = ['Dying', 'Rough', 'OK', 'Good', 'Great']

export interface ActiveSession {
  type: string
  exercises: ActiveExercise[]
}

export interface ActiveExercise {
  name: string
  prev: string
  /** Present once the exercise is known to the backend (or inferred locally
   * for library names); drives kg×reps vs km/min rendering in LiveSession. */
  category?: 'strength' | 'cardio' | 'mobility'
  sets: ActiveSet[]
}

export interface ActiveSet {
  w: string
  r: string
  done: boolean
  /** 1–5 subjective rating: 1 = dying, 5 = felt great */
  feeling?: number | null
  /** Free-form per-set note ("left shoulder felt weird", etc.) */
  note?: string
  /** Cardio logging — distance (km) and duration (min), used instead of w/r
   * when the exercise's category is 'cardio'. */
  distance_km?: string
  duration_min?: string
}

/** Visual pill badge showing an exercise's category (strength/cardio/mobility). */
export function CategoryBadge({ category }: { category: string }) {
  const dotClass =
    category === 'cardio'
      ? 'fit-category-badge--cardio'
      : category === 'mobility'
        ? 'fit-category-badge--mobility'
        : 'fit-category-badge--strength'
  return (
    <span className="fit-category-badge">
      <span className={dotClass} />
      {category}
    </span>
  )
}
