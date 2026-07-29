import type { CSSProperties } from 'react'
import { Dropdown } from '../../components/Dropdown'
import { Segmented } from '../../components/Segmented'
import { SettingsCard } from '../../components/SettingsCard'
import {
  FavoriteColorEditor,
  FavoriteCoverEditor,
} from '../../components/FavoritesEditor'
import { type UserSettings, useSettings } from '../../context/settings'
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

/** Nesting-padding for nested preview items so the hierarchy is visible. */
const nestedPad: CSSProperties = {
  paddingLeft: 20,
  marginTop: 4,
  display: 'grid',
  gap: 3,
}

export function NotesSettings() {
  const { settings, patch } = useSettings()

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="settings-header">
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Notes
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            margin: '4px 0 0',
          }}
        >
          Marker styles, favourite colours, and favourite covers for the notes
          editor.
        </p>
      </div>

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
                <li>
                  First item
                  <ul style={nestedPad}>
                    <li>Nested one</li>
                    <li>
                      Nested two
                      <ul style={nestedPad}>
                        <li>Deeper</li>
                      </ul>
                    </li>
                  </ul>
                </li>
                <li>Second item</li>
                <li>Third item</li>
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
                <li>
                  First item
                  <ol style={nestedPad}>
                    <li>Nested one</li>
                    <li>
                      Nested two
                      <ol style={nestedPad}>
                        <li>Deeper</li>
                      </ol>
                    </li>
                  </ol>
                </li>
                <li>Second item</li>
                <li>Third item</li>
              </ol>
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Favourite text colours"
        description="Shown first in the toolbar's text colour picker."
      >
        <FavoriteColorEditor
          colors={settings.favorite_text_colors}
          onChange={(favorite_text_colors) => patch({ favorite_text_colors })}
        />
      </SettingsCard>

      <SettingsCard
        title="Favourite highlight colours"
        description="Shown first in the toolbar's highlight picker."
      >
        <FavoriteColorEditor
          colors={settings.favorite_highlight_colors}
          onChange={(favorite_highlight_colors) =>
            patch({ favorite_highlight_colors })
          }
        />
      </SettingsCard>

      <SettingsCard
        title="Favourite block colours"
        description="Shown first in the toolbar's block colour picker."
      >
        <FavoriteColorEditor
          colors={settings.favorite_block_colors}
          onChange={(favorite_block_colors) => patch({ favorite_block_colors })}
        />
      </SettingsCard>

      <SettingsCard
        title="Favourite covers"
        description="Image URLs shown first in the page cover picker."
      >
        <FavoriteCoverEditor
          covers={settings.favorite_covers}
          onChange={(favorite_covers) => patch({ favorite_covers })}
        />
      </SettingsCard>
    </div>
  )
}
