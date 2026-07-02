import type { ReactNode } from 'react'

interface SidebarShellProps {
  title: string
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
  open?: boolean
  className?: string
  as?: 'aside' | 'nav'
  ariaLabel?: string
}

export function SidebarShell({
  title,
  actions,
  children,
  footer,
  open = true,
  className = '',
  as: Element = 'aside',
  ariaLabel,
}: SidebarShellProps) {
  return (
    <Element
      className={`app-sidebar${className ? ` ${className}` : ''}${open ? '' : ' closed'}`}
      aria-label={ariaLabel}
    >
      <div className="sidebar-title">
        <span>{title}</span>
        {actions && <div className="sidebar-title-actions">{actions}</div>}
      </div>
      {children}
      {footer}
    </Element>
  )
}
