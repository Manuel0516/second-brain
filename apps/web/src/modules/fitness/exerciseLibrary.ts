// Session types → default exercise list
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
  Lower: [
    'Squat',
    'Romanian Deadlift',
    'Leg Press',
    'Leg Curl',
    'Calf Raises',
    'Hip Thrust',
  ],
  'Full Body': [
    'Squat',
    'Bench Press',
    'Deadlift',
    'Pull-ups',
    'Overhead Press',
  ],
}

// Previous performance hints (kg×reps)
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

export interface ActiveSession {
  type: string
  exercises: ActiveExercise[]
}

export interface ActiveExercise {
  name: string
  prev: string
  sets: ActiveSet[]
}

export interface ActiveSet {
  w: string
  r: string
  done: boolean
}
