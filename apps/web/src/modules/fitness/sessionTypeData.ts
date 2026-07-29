export const SESSION_TYPES = [
  'Push',
  'Pull',
  'Legs',
  'Upper',
  'Cardio',
  'Custom',
] as const

export type SessionType = (typeof SESSION_TYPES)[number]
