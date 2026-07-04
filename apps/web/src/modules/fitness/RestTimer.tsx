interface Props {
  restCount: number
  restTotal: number
  onSkip: () => void
}

export function RestTimer({ restCount, restTotal, onSkip }: Props) {
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - restCount / restTotal)

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid rgba(34,211,238,0.2)',
        borderRadius: '12px',
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        marginBottom: '16px',
        animation: 'springIn .3s cubic-bezier(.16,1,.3,1) both',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '64px',
          height: '64px',
          flexShrink: 0,
        }}
      >
        <svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          style={{ transform: 'rotate(-90deg)' }}
        >
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="rgba(34,211,238,0.12)"
            strokeWidth="5"
          />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="#22D3EE"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '17px',
            fontWeight: 700,
            color: '#22D3EE',
          }}
        >
          {restCount}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: '13.5px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '4px',
          }}
        >
          Rest timer
        </div>
        <div
          style={{
            fontSize: '12px',
            color: 'var(--text-tertiary)',
            marginBottom: '10px',
          }}
        >
          90 seconds · breathe, reset
        </div>
        <button
          onClick={onSkip}
          style={{
            height: '28px',
            padding: '0 12px',
            background: 'rgba(255,240,200,0.07)',
            border: '1px solid rgba(255,240,200,0.09)',
            borderRadius: '6px',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Skip rest →
        </button>
      </div>
    </div>
  )
}
