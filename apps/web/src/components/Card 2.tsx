import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  /** Animate entry with popIn — default true */
  animate?: boolean
}

/**
 * Card container — the `.cal-card` pattern.
 * Renders the warm-elevated card used for forms, menus, and floating panels.
 */
export function Card({ children, className = '', animate = true }: CardProps) {
  return (
    <div
      className={`cal-card${animate ? '' : ' no-animate'}${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  )
}
