import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface BodyWeightCardProps {
  lastWeight: number | null
  weightUnit: string
  metrics: { date: string; weight: number | null }[]
  trend: number | null
  onOpenLog: () => void
}

/**
 * Shared body weight card — extracted from Fitness.tsx sidebar.
 * Used by both Fitness and Food modules.
 */
export function BodyWeightCard({
  lastWeight,
  weightUnit,
  metrics,
  trend,
  onOpenLog,
}: BodyWeightCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenLog}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenLog()
        }
      }}
      style={{
        marginTop: '14px',
        padding: '8px 10px',
        background: 'var(--bg-elevated)',
        border: '1px solid rgba(255,240,200,0.07)',
        borderRadius: '8px',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--text-tertiary)',
          fontWeight: 600,
          marginBottom: '6px',
        }}
      >
        Body
      </div>
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '4px',
        }}
      >
        {lastWeight != null ? `${lastWeight} ${weightUnit}` : '—'}
      </div>
      {/* Mini sparkline */}
      {metrics.length > 1 && (
        <div style={{ height: '36px', marginTop: '4px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metrics.slice(-14)}>
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#22D3EE"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-tertiary)',
          marginTop: '3px',
        }}
      >
        {trend != null ? `Trend: ${trend} ${weightUnit}` : '—'}
      </div>
    </div>
  )
}
