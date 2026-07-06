export interface WeekDay {
  day: string
  date: Date
  isToday: boolean
  hasSession: boolean
  sessionType: string | null
  /** Status of the day's session, if any — drives the WeekStrip badge. */
  sessionStatus: 'completed' | 'planned' | 'active' | null
  hasEvent: boolean
}

interface Props {
  weekDays: WeekDay[]
}

export function WeekStrip({ weekDays }: Props) {
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '28px' }}>
      {weekDays.map((d) => {
        const isToday = d.isToday
        const isDone = d.sessionStatus === 'completed'
        const hasPlanned =
          !isDone &&
          (d.sessionStatus === 'planned' ||
            d.sessionStatus === 'active' ||
            d.hasEvent)

        // Base colors by state
        let bg: string
        let border: string
        let dayColor: string
        let typeColor: string
        let opacity = 1

        if (isDone) {
          bg = 'var(--fit-accent-tint)'
          border = isToday
            ? '2px solid rgba(34,211,238,0.40)'
            : '1px solid var(--fit-accent-border)'
          dayColor = 'var(--fit-accent)'
          typeColor = 'var(--fit-accent)'
        } else if (hasPlanned) {
          bg = 'rgba(34,211,238,0.06)'
          border = isToday
            ? '2px solid rgba(34,211,238,0.35)'
            : '1px solid rgba(34,211,238,0.18)'
          dayColor = isToday ? '#22D3EE' : 'var(--text-secondary)'
          typeColor = isToday ? '#22D3EE' : 'var(--text-secondary)'
          opacity = isToday ? 1 : 0.7
        } else {
          bg = 'rgba(255,240,200,0.04)'
          border = isToday
            ? '2px solid rgba(34,211,238,0.28)'
            : '1px solid rgba(255,240,200,0.07)'
          dayColor = isToday ? '#22D3EE' : 'var(--text-tertiary)'
          typeColor = 'var(--text-tertiary)'
          opacity = isToday ? 1 : 0.45
        }

        const type = isDone
          ? d.sessionType
          : hasPlanned
            ? d.sessionType || 'Planned'
            : 'Rest'

        return (
          <div
            key={d.day}
            style={{
              flex: 1,
              padding: '10px 6px',
              background: bg,
              border,
              borderRadius: '9px',
              textAlign: 'center',
              opacity,
            }}
          >
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '9px',
                color: dayColor,
                fontWeight: 600,
                marginBottom: '5px',
              }}
            >
              {d.day}
            </div>
            {isDone ? (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="var(--fit-accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M4 10l4 4L17 6" />
                </svg>
              </div>
            ) : hasPlanned ? (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="#22D3EE"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <circle cx="10" cy="10" r="7" />
                </svg>
              </div>
            ) : (
              <div style={{ height: '14px' }} />
            )}
            <div
              style={{
                fontSize: '10px',
                color: typeColor,
                marginTop: '4px',
              }}
            >
              {type}
            </div>
          </div>
        )
      })}
    </div>
  )
}
