import { useSettings } from '../context/SettingsContext'
import { logoAssetFor } from '../lib/appearance'

export type ActiveRail = 'calendar' | 'notes' | 'fitness' | 'food' | 'settings'

const IconCalendar = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3.5" width="14" height="13" rx="2" />
    <path d="M3 7.5h14M7 2v3M13 2v3" />
  </svg>
)
const IconNotes = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 2.5h7.5l3 3v12a.5.5 0 01-.5.5H5a.5.5 0 01-.5-.5v-15A.5.5 0 015 2.5z" />
    <path d="M12.5 2.5v3h3M7.5 9.5h5M7.5 12.5h5" />
  </svg>
)
const IconFinance = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="10" cy="10" r="7.2" />
    <path d="M10 6.5v7M12.3 8.3c0-1.1-1.1-1.8-2.3-1.8s-2.3.6-2.3 1.6c0 2.1 4.6 1 4.6 3.1 0 1.1-1.1 1.8-2.3 1.8s-2.4-.7-2.4-1.8" />
  </svg>
)
const IconFood = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5.5 2.5v15" />
    <path d="M3.8 2.5v5.2" />
    <path d="M7.2 2.5v5.2" />
    <path d="M3.8 7.7h3.4" />

    <path d="M13.5 2.5v15" />
    <path d="M13.5 2.5c1.8 1.4 2.6 3.1 2.4 5.2-.1 1.5-.9 2.7-2.4 3.5" />
  </svg>
)
const IconFitness = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 10h2.5M14.5 10H17M5.5 7.5v5M14.5 7.5v5M7.5 10h5" />
  </svg>
)
const IconSettings = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
)

function RailBtn({
  active,
  onClick,
  title,
  children,
  color,
}: {
  active?: boolean
  onClick?: () => void
  title: string
  children: React.ReactNode
  color?: string
}) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.currentTarget.style.animation = 'none'
        void e.currentTarget.offsetWidth
        e.currentTarget.style.animation =
          'railPop .35s cubic-bezier(.16,1,.3,1) both'
        onClick?.()
      }}
      style={{
        width: 40,
        height: 40,
        border: 'none',
        borderRadius: 8,
        background: active
          ? 'color-mix(in srgb, var(--text-primary) 8%, transparent)'
          : 'transparent',
        color: active ? (color ?? 'var(--accent)') : 'var(--text-tertiary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background .2s, color .2s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.color = 'var(--text-primary)'
          e.currentTarget.style.background =
            'color-mix(in srgb, var(--text-primary) 6%, transparent)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = 'var(--text-tertiary)'
          e.currentTarget.style.background = 'transparent'
        }
      }}
    >
      {children}
    </button>
  )
}

interface Props {
  active: ActiveRail
  onNavigate?: (route: string) => void
}

export function AppRail({ active, onNavigate }: Props) {
  const nav = (route: string) => onNavigate?.(route)
  const { settings } = useSettings()
  const logoSrc = logoAssetFor(settings.visual_style)

  return (
    <div
      className="app-rail"
      style={{
        width: 64,
        flexShrink: 0,
        background: 'var(--bg-base)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '14px 0 16px',
        gap: 5,
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          marginBottom: 14,
          cursor: 'pointer',
          animation: 'glow 4s ease-in-out infinite',
          flexShrink: 0,
        }}
      >
        <img
          src={logoSrc}
          className="brand-logo"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          alt="Second Brain"
        />
      </div>

      <RailBtn
        active={active === 'calendar'}
        title="Calendar"
        onClick={() => nav('/calendar')}
      >
        <IconCalendar />
      </RailBtn>
      <RailBtn
        active={active === 'notes'}
        title="Notes"
        onClick={() => nav('/notes')}
      >
        <IconNotes />
      </RailBtn>
      <RailBtn
        active={active === 'fitness'}
        title="Fitness"
        onClick={() => nav('/fitness')}
      >
        <IconFitness />
      </RailBtn>
      <RailBtn
        active={active === 'food'}
        title="Food"
        onClick={() => nav('/food')}
      >
        <IconFood />
      </RailBtn>

      <RailBtn title="Finance">
        <IconFinance />
      </RailBtn>

      <div style={{ flex: 1 }} />

      <RailBtn
        active={active === 'settings'}
        title="Settings"
        onClick={() => nav('/settings')}
      >
        <IconSettings />
      </RailBtn>
    </div>
  )
}
