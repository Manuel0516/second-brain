// Session types map to default exercises. Custom sessions are entered manually.
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

// ponytail: these hints remain fixture data used by the existing session UI.
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

export function isCardioName(name: string): boolean {
  return CARDIO_NAMES.has(name)
}

export const FEELING_LABELS = ['Dying', 'Rough', 'OK', 'Good', 'Great']

export interface ActiveSession {
  type: string
  exercises: ActiveExercise[]
}

export interface ActiveExercise {
  name: string
  prev: string
  category?: 'strength' | 'cardio' | 'mobility'
  sets: ActiveSet[]
}

export interface ActiveSet {
  w: string
  r: string
  done: boolean
  feeling?: number | null
  note?: string
  distance_km?: string
  duration_min?: string
}

export function newSet(category: ActiveExercise['category']): ActiveSet {
  return category === 'cardio'
    ? { w: '', r: '', done: false, distance_km: '', duration_min: '' }
    : { w: '', r: '', done: false }
}
