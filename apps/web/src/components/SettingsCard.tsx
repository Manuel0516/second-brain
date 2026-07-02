import type { ReactNode } from 'react'

interface SettingsCardProps {
  title: string
  description?: string
  children: ReactNode
  onSave?: () => void
  hasChanges?: boolean
  saving?: boolean
}

export function SettingsCard({
  title,
  description,
  children,
  onSave,
  hasChanges = false,
  saving = false,
}: SettingsCardProps) {
  return (
    <section className="settings-card">
      <header className="settings-card-head">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      <div className="settings-card-body">{children}</div>
      {onSave && (
        <footer className="settings-card-actions">
          {saving && <span>Saving...</span>}
          <button
            type="button"
            onClick={onSave}
            disabled={!hasChanges || saving}
            className="settings-card-save"
          >
            Save
          </button>
        </footer>
      )}
    </section>
  )
}
