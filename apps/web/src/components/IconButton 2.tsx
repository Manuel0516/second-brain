import type { ReactNode } from 'react'

interface IconButtonProps {
  icon: ReactNode | string
  label: string
  onClick: () => void
  size?: 'sm' | 'md'
  variant?: 'ghost' | 'raised'
  disabled?: boolean
  className?: string
}

const SIZE_MAP = { sm: 26, md: 30 } as const
const RADIUS_MAP = { sm: 6, md: 7 } as const

/**
 * Small square icon button — used in sidebars, card headers, action rows.
 *
 * Renders a 26px (sm) or 30px (md) button with a single icon character,
 * emoji, or inline SVG.
 */
export function IconButton({
  icon,
  label,
  onClick,
  size = 'sm',
  variant = 'ghost',
  disabled = false,
  className = '',
}: IconButtonProps) {
  const px = SIZE_MAP[size]
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={`${className}`}
      onClick={onClick}
      style={{
        width: px,
        height: px,
        display: 'grid',
        placeItems: 'center',
        border: variant === 'raised' ? '1px solid var(--border)' : '0',
        borderRadius: RADIUS_MAP[size],
        background: variant === 'raised' ? 'var(--bg-elevated)' : 'transparent',
        color: 'var(--text-secondary)',
        fontSize: size === 'sm' ? 16 : 18,
        lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : undefined,
      }}
    >
      {icon}
    </button>
  )
}
