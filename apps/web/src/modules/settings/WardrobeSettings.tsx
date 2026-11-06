import { useEffect, useState, type FormEvent } from 'react'
import { ToggleRow } from '../../components/ToggleRow'
import { SettingsCard } from '../../components/SettingsCard'
import { Field } from '../../components/Field'
import { Dropdown } from '../../components/Dropdown'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import {
  fetchWardrobeCalendars,
  wardrobeRequest,
  type WardrobePreferences,
  type WardrobeCalendar,
} from '../wardrobe/api'
import '../wardrobe/wardrobe.css'

export function WardrobeSettings() {
  const [prefs, setPrefs] = useState<WardrobePreferences | null>(null)
  const [calendars, setCalendars] = useState<WardrobeCalendar[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [rename, setRename] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      wardrobeRequest<WardrobePreferences>('preferences'),
      fetchWardrobeCalendars(),
    ])
      .then(([data, rows]) => {
        if (active) {
          setPrefs(data)
          setCalendars(
            rows.filter(
              (item) =>
                item.source === 'local' && item.effective_role === 'owner',
            ),
          )
        }
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load wardrobe settings',
          )
      })
    return () => {
      active = false
    }
  }, [])

  async function save(action: () => Promise<WardrobePreferences>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setPrefs(await action())
      setNotice('Wardrobe settings saved.')
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings')
    } finally {
      setBusy(false)
    }
  }
  function addCategory(event: FormEvent) {
    event.preventDefault()
    if (!prefs || !newCategory.trim()) return
    void save(async () => {
      const result = await wardrobeRequest<WardrobePreferences>(
        'preferences',
        'PUT',
        { ...prefs, categories: [...prefs.categories, newCategory.trim()] },
      )
      setNewCategory('')
      return result
    })
  }

  return (
    <div className="wardrobe-settings">
      <div className="settings-header">
        <h1>Wardrobe</h1>
        <p>Manage garment categories and your default outfit calendar.</p>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!prefs ? (
        <p>Loading wardrobe settings…</p>
      ) : (
        <>
          <SettingsCard
            title="Scheduling"
            description="Choose where new outfit plans are added. You can choose another calendar when scheduling."
          >
            <fieldset
              disabled={busy}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <Field label="Default calendar">
                <Dropdown
                  ariaLabel="Default wardrobe calendar"
                  value={prefs.default_calendar_id ?? ''}
                  options={[
                    { value: '', label: 'Use app default' },
                    ...calendars.map((item) => ({
                      value: item.id,
                      label: item.name,
                    })),
                  ]}
                  onChange={(value) =>
                    void save(() =>
                      wardrobeRequest<WardrobePreferences>(
                        'preferences',
                        'PUT',
                        { ...prefs, default_calendar_id: value || null },
                      ),
                    )
                  }
                />
              </Field>
            </fieldset>
            {!calendars.length && (
              <p>Create a local calendar to schedule outfits.</p>
            )}
          </SettingsCard>
          <SettingsCard
            title="AI outfit assistant"
            description="Use your configured AI provider to suggest outfits. Nothing is saved or scheduled until you choose a suggestion."
          >
            <fieldset disabled={busy} className="wardrobe-settings-fields">
              <ToggleRow
                label="Enable AI outfit creation"
                checked={prefs.ai_outfits_enabled}
                onChange={(value) =>
                  void save(() =>
                    wardrobeRequest<WardrobePreferences>('preferences', 'PUT', {
                      ...prefs,
                      ai_outfits_enabled: value,
                    }),
                  )
                }
              />
              <ToggleRow
                label="Enable weather-based outfit planning"
                checked={prefs.weather_planning_enabled}
                onChange={(value) =>
                  void save(() =>
                    wardrobeRequest<WardrobePreferences>('preferences', 'PUT', {
                      ...prefs,
                      weather_planning_enabled: value,
                    }),
                  )
                }
              />
              <Field label="Weather city">
                <input
                  maxLength={200}
                  value={prefs.weather_city}
                  onChange={(event) =>
                    setPrefs({ ...prefs, weather_city: event.target.value })
                  }
                  onBlur={() =>
                    void save(() =>
                      wardrobeRequest<WardrobePreferences>(
                        'preferences',
                        'PUT',
                        prefs,
                      ),
                    )
                  }
                  placeholder="e.g. Lund, Sweden"
                />
              </Field>
              <p>
                Weather planning uses the forecast for your selected day, up to
                15 days ahead. Your city is sent to Open-Meteo; garment details,
                your calendar events for that day, and the forecast are sent to
                your configured AI provider.
              </p>
            </fieldset>
          </SettingsCard>
          <SettingsCard
            title="Categories"
            description="Renaming a category updates its garments. To remove a category, move its active and archived garments to another category first."
          >
            <fieldset
              disabled={busy}
              style={{
                border: 0,
                padding: 0,
                margin: 0,
                display: 'grid',
                gap: 14,
              }}
            >
              <div className="wardrobe-settings-list">
                {prefs.categories.map((category) => (
                  <div className="wardrobe-settings-row" key={category}>
                    {editing === category ? (
                      <form
                        className="wardrobe-settings-row"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void save(() =>
                            wardrobeRequest<WardrobePreferences>(
                              'categories/rename',
                              'POST',
                              { name: category, new_name: rename },
                            ),
                          )
                        }}
                      >
                        <Field label="Category name">
                          <input
                            required
                            maxLength={100}
                            value={rename}
                            onChange={(event) => setRename(event.target.value)}
                          />
                        </Field>
                        <div className="cal-card-actions">
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </button>
                          <button type="submit" className="primary">
                            Save name
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <span style={{ flex: 1, color: 'var(--text-primary)' }}>
                          {category}
                        </span>
                        <div className="cal-card-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(category)
                              setRename(category)
                            }}
                            aria-label={`Rename ${category}`}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => setRemoving(category)}
                            aria-label={`Remove ${category}`}
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <form className="wardrobe-settings-row" onSubmit={addCategory}>
                <Field label="New category">
                  <input
                    required
                    maxLength={100}
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                    placeholder="e.g. Swimwear"
                  />
                </Field>
                <div className="cal-card-actions">
                  <button type="submit" disabled={!newCategory.trim()}>
                    Add category
                  </button>
                </div>
              </form>
            </fieldset>
          </SettingsCard>
        </>
      )}
      <ConfirmDialog
        open={removing !== null}
        message={`Remove ${removing ?? ''}?`}
        detail="Categories with garments cannot be removed. Existing outfits and photos are preserved."
        confirmLabel="Remove category"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (prefs && removing) {
            const category = removing
            setRemoving(null)
            void save(() =>
              wardrobeRequest<WardrobePreferences>('preferences', 'PUT', {
                ...prefs,
                categories: prefs.categories.filter(
                  (item) => item !== category,
                ),
              }),
            )
          }
        }}
      />
    </div>
  )
}
