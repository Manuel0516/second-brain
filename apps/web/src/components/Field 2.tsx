import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  children: ReactNode
  className?: string
}

/**
 * Labelled form field — the `.cal-field` pattern.
 * Renders a label with uppercase-mono label text above the input children.
 */
export function Field({ label, children, className = '' }: FieldProps) {
  return (
    <label className={`cal-field${className ? ` ${className}` : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}
