/** Line icon for a workout session type. Shared by the calendar event editor
 * and the fitness module so the two surfaces stay visually in sync. Renders
 * a real SVG — never rely on Nerd Font glyphs (they show up as CJK tofu on
 * machines without the font patched in). */
export function SessionTypeIcon({
  type,
  size = 13,
}: {
  type: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {type === 'Push' && (
        <>
          <path d="M4 12h16" />
          <path d="m15 7 5 5-5 5" />
        </>
      )}
      {type === 'Pull' && (
        <>
          <path d="M20 12H4" />
          <path d="m9 7-5 5 5 5" />
        </>
      )}
      {type === 'Legs' && (
        <>
          <path d="M9 4v7l-3 7h4" />
          <path d="M15 4v7l3 7h-4" />
        </>
      )}
      {type === 'Upper' && (
        <>
          <circle cx="12" cy="5" r="2" />
          <path d="M5 19v-3c0-3.5 3-6 7-6s7 2.5 7 6v3" />
        </>
      )}
      {type === 'Cardio' && <path d="M3 12h4l2-4 3 8 2-4h7" />}
      {(type === 'Custom' ||
        !['Push', 'Pull', 'Legs', 'Upper', 'Cardio'].includes(type)) && (
        <>
          <path d="M4 7h16M4 17h16" />
          <circle cx="9" cy="7" r="2" />
          <circle cx="15" cy="17" r="2" />
        </>
      )}
    </svg>
  )
}
