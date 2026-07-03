import type { CSSProperties } from 'react'
import { Dropdown } from '../../components/Dropdown'
import { Segmented } from '../../components/Segmented'
import { SettingsCard } from '../../components/SettingsCard'
import { useSettings, type UserSettings } from '../../context/SettingsContext'
import '../notes/listMarkers.css'

const BULLET_STYLES: UserSettings['notes_bullet_style'][] = [
  'disc',
  'circle',
  'square',
  'dash',
]

const NUMBERED_OPTIONS: {
  value: UserSettings['notes_numbered_style']
  label: string
}[] = [
  { value: 'decimal', label: 'Decimal' },
  { value: 'lower-alpha', label: 'Lower alpha' },
  { value: 'upper-alpha', label: 'Upper alpha' },
  { value: 'lower-roman', label: 'Lower Roman' },
  { value: 'upper-roman', label: 'Upper Roman' },
]

const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const previewStyle: CSSProperties = {
  margin: 0,
  padding: '10px 14px 10px 34px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  background: 'var(--bg-raised)',
  fontSize: 13,
  color: 'var(--text-secondary)',
  display: 'grid',
  gap: 4,
  minWidth: 170,
}

const PREVIEW_ITEMS = ['First item', 'Second item', 'Third item']

export function NotesSettings() {
  const { settings, patch } = useSettings()

  return (
    <SettingsCard
      title="Lists"
      description="Marker styles for every notes editor. Changing them restyles existing lists without modifying their content."
    >
      <div className="settings-field-row" style={{ display: 'grid', gap: 6 }}>
        <span id="notes-bullet-label" style={labelStyle}>
          Bullet list style
        </span>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div
            role="group"
            aria-labelledby="notes-bullet-label"
            style={{ flex: '1 1 260px' }}
          >
            <Segmented
              value={settings.notes_bullet_style}
              options={BULLET_STYLES}
              labels={{
                disc: 'Disc',
                circle: 'Circle',
                square: 'Square',
                dash: 'Dash',
              }}
              onChange={(value) => patch({ notes_bullet_style: value })}
            />
          </div>
          <div
            data-bullet-style={settings.notes_bullet_style}
            aria-hidden="true"
          >
            <ul style={previewStyle}>
              {PREVIEW_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="settings-field-row" style={{ display: 'grid', gap: 6 }}>
        <span id="notes-numbered-label" style={labelStyle}>
          Numbered list style
        </span>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flex: '1 1 260px' }}>
            <Dropdown<UserSettings['notes_numbered_style']>
              options={NUMBERED_OPTIONS}
              value={settings.notes_numbered_style}
              onChange={(value) => patch({ notes_numbered_style: value })}
              ariaLabel="Numbered list style"
            />
          </div>
          <div
            data-numbered-style={settings.notes_numbered_style}
            aria-hidden="true"
          >
            <ol style={previewStyle}>
              {PREVIEW_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </SettingsCard>
  )
}
