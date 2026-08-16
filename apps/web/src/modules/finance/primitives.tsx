import { useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Dropdown } from '../../components/Dropdown'
import { useDialogFocus } from '../../components/useDialogFocus'
import { JURISDICTIONS } from './navigation'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { FinanceWarning } from './types'

export type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

/**
 * Hardcoded semantic literals — not new colors, reused verbatim from existing
 * app usage (event-editor "saved" state, danger text, feeling-scale amber).
 * See docs/work/plans/second-brain-finance-module/02-ux/specs/design-tokens.json.
 */
const PILL_TONES: Record<PillTone, { fg: string; bg: string }> = {
  success: { fg: '#43c58a', bg: 'rgba(67, 197, 138, 0.12)' },
  warning: { fg: '#d9b13b', bg: 'rgba(217, 177, 59, 0.12)' },
  danger: { fg: '#d9573f', bg: 'rgba(217, 87, 63, 0.12)' },
  info: { fg: 'var(--accent)', bg: 'var(--accent-tint)' },
  neutral: { fg: 'var(--text-secondary)', bg: 'var(--bg-raised)' },
}

export function StatusPill({
  tone,
  children,
}: {
  tone: PillTone
  children: ReactNode
}) {
  const { fg, bg } = PILL_TONES[tone]
  return (
    <span
      className="fin-pill"
      style={{ color: fg, background: bg, borderColor: bg }}
    >
      <span className="fin-pill-dot" style={{ background: fg }} />
      {children}
    </span>
  )
}

/** Small trend line — no axes, used inside stat cards. */
export function Sparkline({
  data,
  tone = 'neutral',
}: {
  data: number[]
  tone?: PillTone
}) {
  if (data.length < 2) return null
  const stroke =
    tone === 'neutral' ? 'var(--text-tertiary)' : PILL_TONES[tone].fg
  const points = data.map((value, index) => ({ index, value }))
  return (
    <div className="fin-sparkline" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface TrendPoint {
  label: string
  value: number
}

/** Full trend chart with axes — net worth / passive income / tax readiness / activity. */
export function TrendChart({
  data,
  valueFormatter,
  height = 220,
}: {
  data: TrendPoint[]
  valueFormatter?: (value: number) => string
  height?: number
}) {
  if (data.length === 0) {
    return <div className="fin-chart-empty">No data for this range yet.</div>
  }
  return (
    <div className="fin-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 4, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="finTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--text-primary)"
                stopOpacity={0.16}
              />
              <stop
                offset="100%"
                stopColor="var(--text-primary)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border-grid)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--text-tertiary)"
            tick={{
              fill: 'var(--text-tertiary)',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            minTickGap={24}
          />
          <YAxis
            stroke="var(--text-tertiary)"
            tick={{
              fill: 'var(--text-tertiary)',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={valueFormatter}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-strong)',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'var(--font-ui)',
              color: 'var(--text-primary)',
            }}
            labelStyle={{ color: 'var(--text-tertiary)' }}
            formatter={(value) => [
              valueFormatter ? valueFormatter(Number(value)) : String(value),
              '',
            ]}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--text-primary)"
            strokeWidth={1.75}
            fill="url(#finTrendFill)"
            isAnimationActive={false}
            dot={false}
            activeDot={{
              r: 3,
              fill: 'var(--text-primary)',
              stroke: 'var(--bg-elevated)',
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Circular readiness ring — value is 0-100. */
export function RingProgress({
  value,
  size = 56,
  strokeWidth = 5,
}: {
  value: number
  size?: number
  strokeWidth?: number
}) {
  const clamped = Math.max(0, Math.min(100, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="fin-ring"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--text-primary)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

/** Horizontal percentage meter — source mix, jurisdiction completion, residency days. */
export function BarMeter({
  value,
  tone = 'neutral',
  color,
}: {
  value: number
  tone?: PillTone
  /** Explicit fill (a CSS token) — wins over tone. Used by multi-color source mixes. */
  color?: string
}) {
  const fg =
    color ?? (tone === 'neutral' ? 'var(--text-primary)' : PILL_TONES[tone].fg)
  return (
    <div className="fin-barmeter">
      <div
        className="fin-barmeter-fill"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: fg,
        }}
      />
    </div>
  )
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export function SidebarYearBlock({
  taxYear,
  onChange,
}: {
  taxYear: number
  onChange?: (year: number) => void
}) {
  const years = Array.from({ length: 6 }, (_, i) => taxYear - 4 + i)
  return (
    <div className="fin-sidebar-section fin-sidebar-year">
      <div className="fin-sidebar-year-row">
        <span className="finance-section-label">This year</span>
        {onChange ? (
          <Dropdown
            className="fin-dropdown-plain"
            ariaLabel="Finance year"
            value={taxYear}
            onChange={onChange}
            options={years.map((year) => ({ value: year, label: `${year}` }))}
          />
        ) : (
          <span className="fin-sidebar-year-value">{taxYear}</span>
        )}
      </div>
      <span className="fin-sidebar-year-range">
        {MONTHS[0]} 1 – {MONTHS[11]} 31, {taxYear}
      </span>
    </div>
  )
}

export function JurisdictionList({
  jurisdiction,
  onChange,
  onAdd,
}: {
  jurisdiction: string | undefined
  onChange: (code: string | undefined) => void
  onAdd?: () => void
}) {
  return (
    <div className="fin-sidebar-section">
      <span className="finance-section-label fin-side-label-row">
        Jurisdictions
        {onAdd && (
          <button
            type="button"
            className="fin-side-add"
            aria-label="Add jurisdiction"
            onClick={onAdd}
          >
            <IconPlus />
          </button>
        )}
      </span>
      <div className="fin-sidebar-list">
        {JURISDICTIONS.map((j) => (
          <button
            key={j.code}
            type="button"
            className={`fin-jurisdiction-row${jurisdiction === j.code ? ' active' : ''}`}
            onClick={() =>
              onChange(jurisdiction === j.code ? undefined : j.code)
            }
          >
            <span className="fin-jurisdiction-flag">{j.flag}</span>
            <span className="fin-jurisdiction-text">
              <strong>{j.label}</strong>
              <span>{j.status}</span>
            </span>
            <IconChevronRight />
          </button>
        ))}
      </div>
    </div>
  )
}

export function StatCard({
  icon,
  label,
  value,
  caption,
  sparkline,
  trend,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  caption?: string
  sparkline?: number[]
  trend?: { tone: PillTone; text: string }
}) {
  return (
    <div className="fin-stat-card">
      <div className="fin-stat-head">
        <span className="fin-stat-icon">{icon}</span>
        <span className="fin-stat-label">{label}</span>
      </div>
      <div className="fin-stat-body">
        <div className="fin-stat-value-col">
          <strong className="fin-stat-value">{value}</strong>
          {caption && <span className="fin-stat-caption">{caption}</span>}
        </div>
        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} tone={trend?.tone} />
        )}
      </div>
      {trend && <StatusPill tone={trend.tone}>{trend.text}</StatusPill>}
    </div>
  )
}

const ICON_PROPS = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const IconChevronRight = () => (
  <svg width="14" height="14" {...ICON_PROPS}>
    <path d="M7.5 4.5l6 5.5-6 5.5" />
  </svg>
)
export const IconChevronLeft = () => (
  <svg width="14" height="14" {...ICON_PROPS}>
    <path d="M12.5 4.5l-6 5.5 6 5.5" />
  </svg>
)
export const IconClose = () => (
  <svg width="16" height="16" {...ICON_PROPS}>
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
)
export const IconSparkle = () => (
  <svg width="16" height="16" {...ICON_PROPS}>
    <path d="M10 2.5l1.4 4.6 4.6 1.4-4.6 1.4L10 14.5l-1.4-4.6-4.6-1.4 4.6-1.4L10 2.5z" />
  </svg>
)
export const IconWarning = () => (
  <svg width="16" height="16" {...ICON_PROPS}>
    <path d="M10 2.5l8 14H2l8-14z" />
    <path d="M10 8v3.5M10 14.2v.1" />
  </svg>
)
export const IconCheck = () => (
  <svg width="14" height="14" {...ICON_PROPS}>
    <path d="M4 10.5l4 4 8-8" />
  </svg>
)
export const IconInfo = () => (
  <svg width="14" height="14" {...ICON_PROPS}>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M10 9v4.5M10 6.5v.1" />
  </svg>
)
export const IconFolder = () => (
  <svg width="16" height="16" {...ICON_PROPS}>
    <path d="M2.5 5.5a1 1 0 011-1H8l1.5 2h7a1 1 0 011 1v7a1 1 0 01-1 1h-13a1 1 0 01-1-1v-9z" />
  </svg>
)
export const IconFile = () => (
  <svg width="16" height="16" {...ICON_PROPS}>
    <path d="M5.5 2.5h6l3 3v11a.5.5 0 01-.5.5h-8.5a.5.5 0 01-.5-.5v-13.5z" />
    <path d="M11.5 2.5v3h3" />
  </svg>
)
export const IconDownload = () => (
  <svg width="14" height="14" {...ICON_PROPS}>
    <path d="M10 3v9.5M6 9l4 4 4-4M4 16.5h12" />
  </svg>
)
export const IconUpload = () => (
  <svg width="14" height="14" {...ICON_PROPS}>
    <path d="M10 13V3.5M6 7.5l4-4 4 4M4 16.5h12" />
  </svg>
)
export const IconPlus = () => (
  <svg width="14" height="14" {...ICON_PROPS}>
    <path d="M10 4v12M4 10h12" />
  </svg>
)
export const IconScale = () => (
  <svg width="14" height="14" {...ICON_PROPS}>
    <path d="M10 3v14M6.5 6h7M4 6l-2 5a2.5 2.5 0 005 0l-2-5zM16 6l-2 5a2.5 2.5 0 005 0l-2-5zM6.5 17h7" />
  </svg>
)
export const IconLink = () => (
  <svg width="14" height="14" {...ICON_PROPS}>
    <path d="M8.5 11.5a3 3 0 004.24 0l2-2a3 3 0 00-4.24-4.24l-1 1" />
    <path d="M11.5 8.5a3 3 0 00-4.24 0l-2 2a3 3 0 004.24 4.24l1-1" />
  </svg>
)

function warningTone(severity: FinanceWarning['severity']): PillTone {
  if (severity === 'blocking') return 'danger'
  if (severity === 'warning') return 'warning'
  return 'info'
}

/** Renders Completeness.warnings/blockers consistently wherever a page or item surfaces them. */
export function WarningList({ warnings }: { warnings: FinanceWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="fin-warning-list">
      {warnings.map((warning, index) => (
        <div key={`${warning.code}-${index}`} className="fin-warning-item">
          <StatusPill tone={warningTone(warning.severity)}>
            {warning.severity}
          </StatusPill>
          <span>{warning.message}</span>
        </div>
      ))}
    </div>
  )
}

/** Shared reason-required confirmation dialog — tax-treatment confirm, split/defer reasons. */
export function ReasonModal({
  title,
  description,
  confirmLabel = 'Confirm',
  onCancel,
  onSubmit,
}: {
  title: string
  description?: ReactNode
  confirmLabel?: string
  onCancel: () => void
  onSubmit: (reason: string) => void | Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus({ open: true, dialogRef, onEscape: onCancel })

  async function submit() {
    if (!reason.trim()) {
      setError('A reason is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit(reason)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete action')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="scope-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="scope-card fin-confirm-modal" ref={dialogRef}>
        <h3 id={titleId}>{title}</h3>
        {description && <p className="finance-muted">{description}</p>}
        <label className="cal-field">
          <span>Reason</span>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && <p className="fin-muted-danger">{error}</p>}
        <div className="cal-card-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void submit()}
            disabled={saving}
          >
            {saving ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
