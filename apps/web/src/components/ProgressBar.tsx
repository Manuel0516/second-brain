interface Props {
  value: number
  max: number
  label?: string
  sublabel?: string
  color?: string
  height?: number
  showLabel?: boolean
}

export function ProgressBar({
  value,
  max,
  label,
  sublabel,
  color = 'var(--fit-accent)',
  height = 4,
  showLabel = true,
}: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0

  return (
    <div style={{ width: '100%' }}>
      {showLabel && label && (
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '6px',
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          height: `${height}px`,
          background: 'rgba(255,240,200,0.07)',
          borderRadius: '99px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: '99px',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      {sublabel && (
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '10px',
            color: 'var(--text-tertiary)',
            marginTop: '5px',
          }}
        >
          {sublabel}
        </div>
      )}
    </div>
  )
}
