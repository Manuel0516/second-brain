import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AppRail } from '../../components/AppRail'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { SidebarShell } from '../../components/SidebarShell'
import { IconButton } from '../../components/IconButton'
import { Field } from '../../components/Field'
import { Dropdown } from '../../components/Dropdown'
import { Segmented } from '../../components/Segmented'
import { useSettings } from '../../context/SettingsContext'
import { uploadFile } from '../../lib/files'
import {
  fetchWardrobeCalendars,
  wardrobeRequest,
  type Garment,
  type Outfit,
  type Schedule,
  type WardrobeCalendar,
  type WardrobePreferences,
} from './api'
import { OutfitAssistant } from './OutfitAssistant'
import './wardrobe.css'

type Tab = 'clothes' | 'outfits' | 'schedule'
const tabs: Tab[] = ['clothes', 'outfits', 'schedule']
const emptyGarment: Omit<Garment, 'id'> = {
  name: '',
  category: 'Tops',
  brand: '',
  size: '',
  color: '',
  notes: '',
  archived: false,
  photo_file_id: null,
}
const categories = [
  'Tops',
  'Bottoms',
  'Dresses',
  'Outerwear',
  'Shoes',
  'Accessories',
  'Activewear',
  'Other',
]

export function Wardrobe() {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const [params, setParams] = useSearchParams()
  const tab: Tab = tabs.includes(params.get('tab') as Tab)
    ? (params.get('tab') as Tab)
    : 'clothes'
  const [preferences, setPreferences] = useState<WardrobePreferences | null>(
    null,
  )
  const [garments, setGarments] = useState<Garment[]>([])
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [schedule, setSchedule] = useState<Schedule[]>([])
  const [calendars, setCalendars] = useState<WardrobeCalendar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [garmentDraft, setGarmentDraft] = useState<
    (Omit<Garment, 'id'> & { id?: string }) | null
  >(null)
  const [outfitDraft, setOutfitDraft] = useState<
    (Omit<Outfit, 'id'> & { id?: string }) | null
  >(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [remove, setRemove] = useState<{
    path: string
    title: string
    detail?: string
  } | null>(null)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 800)
  const [navOpen, setNavOpen] = useState(() => window.innerWidth > 800)
  useEffect(() => {
    const resize = () => {
      const mobile = window.innerWidth <= 800
      if (mobile !== isMobile) {
        setIsMobile(mobile)
        setNavOpen(!mobile)
      }
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [isMobile])
  const [outfitId, setOutfitId] = useState('')
  const [calendarId, setCalendarId] = useState('')
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: settings.timezone }).format(
      new Date(),
    ),
  )

  async function load() {
    const [clothes, looks, plans, calendarRows, prefs] = await Promise.all([
      wardrobeRequest<Garment[]>('garments'),
      wardrobeRequest<Outfit[]>('outfits'),
      wardrobeRequest<Schedule[]>('schedule'),
      fetchWardrobeCalendars(),
      wardrobeRequest<WardrobePreferences>('preferences'),
    ])
    setPreferences(prefs)
    setGarments(clothes)
    setOutfits(looks)
    setSchedule(plans)
    setCalendars(
      calendarRows.filter(
        (item) => item.source === 'local' && item.effective_role === 'owner',
      ),
    )
  }

  useEffect(() => {
    let active = true
    Promise.all([
      wardrobeRequest<Garment[]>('garments'),
      wardrobeRequest<Outfit[]>('outfits'),
      wardrobeRequest<Schedule[]>('schedule'),
      fetchWardrobeCalendars(),
      wardrobeRequest<WardrobePreferences>('preferences'),
    ])
      .then(([clothes, looks, plans, calendarRows, prefs]) => {
        if (!active) return
        setPreferences(prefs)
        setGarments(clothes)
        setOutfits(looks)
        setSchedule(plans)
        setCalendars(
          calendarRows.filter(
            (item) =>
              item.source === 'local' && item.effective_role === 'owner',
          ),
        )
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : 'Could not load wardrobe',
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function act(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes')
    } finally {
      setBusy(false)
    }
  }

  function setTab(next: Tab) {
    setParams(next === 'clothes' ? {} : { tab: next })
    setSearch('')
    setGarmentDraft(null)
    setOutfitDraft(null)
    setPhoto(null)
  }

  function saveGarment(event: FormEvent) {
    event.preventDefault()
    if (!garmentDraft) return
    if (!garmentDraft.category.trim()) {
      setError('Enter a category name')
      return
    }
    void act(async () => {
      const { id, ...data } = garmentDraft
      if (photo) {
        const uploaded = await uploadFile(photo)
        data.photo_file_id = uploaded.id
        setGarmentDraft({ ...garmentDraft, photo_file_id: uploaded.id })
        setPhoto(null)
      }
      await wardrobeRequest(
        `garments${id ? `/${id}` : ''}`,
        id ? 'PUT' : 'POST',
        data,
      )
      setGarmentDraft(null)
    })
  }

  function saveOutfit(event: FormEvent) {
    event.preventDefault()
    if (!outfitDraft) return
    void act(async () => {
      const { id, ...data } = outfitDraft
      await wardrobeRequest(
        `outfits${id ? `/${id}` : ''}`,
        id ? 'PUT' : 'POST',
        data,
      )
      setOutfitDraft(null)
    })
  }

  const categoryNames = Array.from(
    new Set([
      ...(preferences?.categories ?? categories),
      ...garments.map((item) => item.category),
    ]),
  ).sort()
  function browseCategory(next: string, archived = false) {
    setTab('clothes')
    setCategory(next)
    setShowArchived(archived)
    if (isMobile) setNavOpen(false)
  }
  function openEditor() {
    if (tab === 'clothes') {
      setGarmentDraft({ ...emptyGarment, category: category || 'Tops' })
      setPhoto(null)
    } else setOutfitDraft({ name: '', notes: '', garment_ids: [] })
  }
  const filteredGarments = garments.filter(
    (item) =>
      item.archived === showArchived &&
      (!category || item.category === category) &&
      [item.name, item.brand, item.color, item.category]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  const filteredOutfits = outfits.filter((item) =>
    `${item.name} ${item.notes}`.toLowerCase().includes(search.toLowerCase()),
  )
  const selectedCalendar =
    (calendars.some((item) => item.id === calendarId) ? calendarId : '') ||
    (calendars.some((item) => item.id === preferences?.default_calendar_id)
      ? preferences?.default_calendar_id
      : '') ||
    calendars.find((item) => item.id === settings.default_calendar_id)?.id ||
    calendars[0]?.id ||
    ''
  const selectedOutfit =
    (outfits.some((item) => item.id === outfitId) ? outfitId : '') ||
    outfits[0]?.id ||
    ''

  return (
    <div className="wardrobe-page">
      {(!isMobile || navOpen) && (
        <AppRail
          active="wardrobe"
          onNavigate={(route) => {
            if (isMobile) setNavOpen(false)
            navigate(route)
          }}
        />
      )}
      <SidebarShell
        title="Wardrobe"
        open={navOpen}
        ariaLabel="Wardrobe navigation"
        actions={
          <IconButton
            icon="×"
            label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="sidebar-close"
          />
        }
      >
        <div className="wardrobe-sidebar-content" inert={!navOpen}>
          <div className="wardrobe-section-label">Collection</div>
          <nav aria-label="Collections" className="wardrobe-sidebar-list">
            <button
              className="wardrobe-nav-row"
              aria-pressed={tab === 'clothes' && !showArchived && !category}
              onClick={() => browseCategory('')}
            >
              <span>All clothes</span>
              <span className="wardrobe-nav-count">
                {garments.filter((item) => !item.archived).length}
              </span>
            </button>
            <button
              className="wardrobe-nav-row"
              aria-pressed={tab === 'outfits'}
              onClick={() => {
                setTab('outfits')
                if (isMobile) setNavOpen(false)
              }}
            >
              <span>Saved outfits</span>
              <span className="wardrobe-nav-count">{outfits.length}</span>
            </button>
            <button
              className="wardrobe-nav-row"
              aria-pressed={tab === 'schedule'}
              onClick={() => {
                setTab('schedule')
                if (isMobile) setNavOpen(false)
              }}
            >
              <span>Outfit schedule</span>
              <span className="wardrobe-nav-count">{schedule.length}</span>
            </button>
          </nav>
          <div className="wardrobe-section-label">Categories</div>
          <nav
            aria-label="Garment categories"
            className="wardrobe-sidebar-list"
          >
            {categoryNames.map((name) => (
              <button
                key={name}
                className="wardrobe-nav-row"
                aria-label={`Category: ${name}`}
                aria-pressed={
                  tab === 'clothes' && !showArchived && category === name
                }
                onClick={() => browseCategory(name)}
              >
                <span>{name}</span>
                <span className="wardrobe-nav-count">
                  {
                    garments.filter(
                      (item) => !item.archived && item.category === name,
                    ).length
                  }
                </span>
              </button>
            ))}
          </nav>
          <div className="wardrobe-section-label">Storage</div>
          <button
            className="wardrobe-nav-row"
            aria-label="Archived"
            aria-pressed={tab === 'clothes' && showArchived}
            onClick={() => browseCategory('', true)}
          >
            <span>Archived clothes</span>
            <span className="wardrobe-nav-count">
              {garments.filter((item) => item.archived).length}
            </span>
          </button>
        </div>
      </SidebarShell>
      {navOpen && isMobile && (
        <div
          className="sidebar-backdrop"
          role="presentation"
          onClick={() => setNavOpen(false)}
        />
      )}
      <main className="wardrobe-main">
        <header className="wardrobe-topbar">
          <div className="wardrobe-heading">
            <IconButton
              icon={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                  <path d="M7.5 3.5v13" />
                </svg>
              }
              label={navOpen ? 'Hide navigation' : 'Show navigation'}
              pressed={navOpen}
              onClick={() => setNavOpen(!navOpen)}
              variant="raised"
              className="wardrobe-nav-toggle"
            />
            <h1>Wardrobe</h1>
          </div>
          <div className="wardrobe-tabs">
            <Segmented
              value={tab}
              options={tabs}
              onChange={setTab}
              labels={{
                clothes: 'Clothes',
                outfits: 'Outfits',
                schedule: 'Schedule',
              }}
              ariaLabel="Wardrobe view"
            />
          </div>
          {tab !== 'schedule' && (
            <div className="cal-card-actions wardrobe-topbar-actions">
              <button
                className="primary"
                disabled={busy || loading}
                onClick={openEditor}
              >
                {tab === 'clothes' ? '+ Add garment' : '+ Create outfit'}
              </button>
            </div>
          )}
        </header>
        <div className="wardrobe-content">
          {error && (
            <div className="cal-card wardrobe-error" role="alert">
              <p>{error}</p>
              <button disabled={busy} onClick={() => void act(async () => {})}>
                Retry loading
              </button>
            </div>
          )}
          {loading ? (
            <p role="status">Loading your wardrobe…</p>
          ) : (
            <>
              {tab === 'outfits' && preferences?.ai_outfits_enabled && (
                <OutfitAssistant
                  mode="outfits"
                  date={date}
                  onDateChange={setDate}
                  calendarId={selectedCalendar}
                  timezone={settings.timezone}
                  garments={garments}
                  onSaved={load}
                />
              )}
              {tab !== 'schedule' && (
                <div className="wardrobe-toolbar">
                  <div>
                    <h2>
                      {tab === 'outfits'
                        ? 'Saved outfits'
                        : showArchived
                          ? 'Archived clothes'
                          : category || 'All clothes'}
                    </h2>
                    <p>
                      {tab === 'outfits'
                        ? 'Put together a look, then plan when to wear it.'
                        : showArchived
                          ? 'Keep past pieces without losing your saved looks.'
                          : 'Your collection, ready for your next outfit.'}
                    </p>
                  </div>
                  <label className="cal-field wardrobe-search">
                    <span className="wardrobe-visually-hidden">
                      Search {tab}
                    </span>
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={
                        tab === 'outfits'
                          ? 'Search outfits…'
                          : 'Search clothes…'
                      }
                    />
                  </label>
                </div>
              )}

              {tab === 'clothes' && garmentDraft && (
                <form className="cal-card wardrobe-form" onSubmit={saveGarment}>
                  <h2>{garmentDraft.id ? 'Edit garment' : 'Add garment'}</h2>
                  <fieldset disabled={busy}>
                    <div className="wardrobe-fields">
                      {(['name', 'brand', 'size', 'color'] as const).map(
                        (field) => (
                          <label className="cal-field" key={field}>
                            <span>{field}</span>
                            <input
                              required={field === 'name'}
                              maxLength={
                                field === 'name'
                                  ? 255
                                  : field === 'size'
                                    ? 50
                                    : 100
                              }
                              value={garmentDraft[field]}
                              onChange={(e) =>
                                setGarmentDraft({
                                  ...garmentDraft,
                                  [field]: e.target.value,
                                })
                              }
                            />
                          </label>
                        ),
                      )}
                    </div>
                    <div className="wardrobe-fields">
                      <Field label="Category">
                        <Dropdown
                          ariaLabel="Category"
                          options={[
                            ...categoryNames.map((value) => ({
                              value,
                              label: value,
                            })),
                            { value: '__custom__', label: '+ New category…' },
                          ]}
                          value={
                            categoryNames.includes(garmentDraft.category)
                              ? garmentDraft.category
                              : '__custom__'
                          }
                          onChange={(value) =>
                            setGarmentDraft({
                              ...garmentDraft,
                              category: value === '__custom__' ? '' : value,
                            })
                          }
                        />
                      </Field>
                      {!categoryNames.includes(garmentDraft.category) && (
                        <label className="cal-field">
                          <span>Custom category</span>
                          <input
                            required
                            maxLength={100}
                            value={garmentDraft.category}
                            onChange={(event) =>
                              setGarmentDraft({
                                ...garmentDraft,
                                category: event.target.value,
                              })
                            }
                            placeholder="e.g. Swimwear"
                          />
                        </label>
                      )}
                    </div>
                    <label className="cal-field">
                      <span>Notes</span>
                      <textarea
                        maxLength={10000}
                        value={garmentDraft.notes}
                        onChange={(e) =>
                          setGarmentDraft({
                            ...garmentDraft,
                            notes: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="cal-field">
                      <span>Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    {garmentDraft.photo_file_id && !photo && (
                      <div className="wardrobe-photo-edit">
                        <img
                          src={`/api/files/${garmentDraft.photo_file_id}`}
                          alt={garmentDraft.name || 'Garment photo'}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setGarmentDraft({
                              ...garmentDraft,
                              photo_file_id: null,
                            })
                          }
                        >
                          Remove photo
                        </button>
                      </div>
                    )}
                    <label className="wardrobe-check">
                      <input
                        type="checkbox"
                        checked={garmentDraft.archived}
                        onChange={(e) =>
                          setGarmentDraft({
                            ...garmentDraft,
                            archived: e.target.checked,
                          })
                        }
                      />
                      Archive garment
                    </label>
                    <div className="cal-card-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setGarmentDraft(null)
                          setPhoto(null)
                        }}
                      >
                        Cancel
                      </button>
                      <button className="primary" type="submit">
                        {busy ? 'Saving…' : 'Save garment'}
                      </button>
                    </div>
                  </fieldset>
                </form>
              )}

              {tab === 'outfits' && outfitDraft && (
                <form className="cal-card wardrobe-form" onSubmit={saveOutfit}>
                  <h2>{outfitDraft.id ? 'Edit outfit' : 'Create outfit'}</h2>
                  <fieldset disabled={busy}>
                    <label className="cal-field">
                      <span>Name</span>
                      <input
                        required
                        maxLength={255}
                        value={outfitDraft.name}
                        onChange={(e) =>
                          setOutfitDraft({
                            ...outfitDraft,
                            name: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="cal-field">
                      <span>Notes</span>
                      <textarea
                        maxLength={10000}
                        value={outfitDraft.notes}
                        onChange={(e) =>
                          setOutfitDraft({
                            ...outfitDraft,
                            notes: e.target.value,
                          })
                        }
                      />
                    </label>
                    <fieldset className="wardrobe-selection">
                      <legend>Choose garments</legend>
                      {garments
                        .filter(
                          (item) =>
                            !item.archived ||
                            outfitDraft.garment_ids.includes(item.id),
                        )
                        .map((item) => (
                          <label className="wardrobe-check" key={item.id}>
                            <input
                              type="checkbox"
                              checked={outfitDraft.garment_ids.includes(
                                item.id,
                              )}
                              onChange={(e) =>
                                setOutfitDraft({
                                  ...outfitDraft,
                                  garment_ids: e.target.checked
                                    ? [...outfitDraft.garment_ids, item.id]
                                    : outfitDraft.garment_ids.filter(
                                        (id) => id !== item.id,
                                      ),
                                })
                              }
                            />
                            {item.name}
                            {item.archived ? ' (archived)' : ''}
                          </label>
                        ))}
                      {!garments.some((item) => !item.archived) && (
                        <p>
                          Add garments in Clothes to start building outfits.
                        </p>
                      )}
                    </fieldset>
                    <div className="cal-card-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setOutfitDraft(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="primary"
                        type="submit"
                        disabled={!outfitDraft.garment_ids.length}
                      >
                        {busy ? 'Saving…' : 'Save outfit'}
                      </button>
                    </div>
                  </fieldset>
                </form>
              )}

              {tab === 'clothes' && (
                <>
                  <p className="wardrobe-count">
                    {filteredGarments.length}{' '}
                    {showArchived ? 'archived' : 'active'} garments
                  </p>
                  <div className="wardrobe-grid">
                    {filteredGarments.map((item) => (
                      <article className="cal-card wardrobe-card" key={item.id}>
                        {item.photo_file_id ? (
                          <img
                            loading="lazy"
                            className="wardrobe-photo"
                            src={`/api/files/${item.photo_file_id}`}
                            alt={item.name}
                          />
                        ) : (
                          <div
                            className="wardrobe-photo wardrobe-placeholder"
                            aria-hidden="true"
                          >
                            <svg
                              width="52"
                              height="52"
                              viewBox="0 0 20 20"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              aria-hidden="true"
                            >
                              <path d="M7 3 3 5 1 9l4 2v6h10v-6l4-2-2-4-4-2c0 3-6 3-6 0Z" />
                            </svg>
                          </div>
                        )}
                        <div>
                          <h2>{item.name}</h2>
                          <p>
                            {[item.category, item.brand, item.size, item.color]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        {item.notes && (
                          <p className="wardrobe-notes">{item.notes}</p>
                        )}
                        <div className="cal-card-actions">
                          <button
                            disabled={busy}
                            className="ghost"
                            onClick={() => {
                              setGarmentDraft({ ...item })
                              setPhoto(null)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            disabled={busy}
                            className="danger"
                            onClick={() =>
                              setRemove({
                                path: `garments/${item.id}`,
                                title: `Delete ${item.name}?`,
                                detail:
                                  'Garments used in outfits must be removed from those outfits first. You can also archive this garment.',
                              })
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!filteredGarments.length && (
                    <div className="cal-card wardrobe-empty">
                      <h2>
                        {garments.length
                          ? 'No matching garments'
                          : 'Start with your first garment'}
                      </h2>
                      <p>
                        {garments.length
                          ? 'Try another search, category, or archive filter.'
                          : 'Add a photo and a few details, then combine your clothes into outfits.'}
                      </p>
                    </div>
                  )}
                </>
              )}

              {tab === 'outfits' && (
                <>
                  <p className="wardrobe-count">
                    {filteredOutfits.length} saved outfits
                  </p>
                  <div className="wardrobe-grid wardrobe-outfit-grid">
                    {filteredOutfits.map((item) => (
                      <article
                        className="cal-card wardrobe-card wardrobe-outfit-card"
                        key={item.id}
                        id={`outfit-${item.id}`}
                        data-selected={params.get('outfit') === item.id}
                      >
                        <h2>{item.name}</h2>
                        {item.notes && (
                          <p className="wardrobe-notes">{item.notes}</p>
                        )}
                        <ul className="wardrobe-outfit-items">
                          {item.garment_ids.map((id) => {
                            const garment = garments.find(
                              (value) => value.id === id,
                            )
                            return (
                              garment && (
                                <li key={id}>
                                  {garment.photo_file_id && (
                                    <img
                                      loading="lazy"
                                      src={`/api/files/${garment.photo_file_id}`}
                                      alt=""
                                    />
                                  )}
                                  <span>
                                    {garment.name}
                                    {garment.archived ? ' (archived)' : ''}
                                  </span>
                                </li>
                              )
                            )
                          })}
                        </ul>
                        <div className="cal-card-actions">
                          <button
                            disabled={busy}
                            className="ghost"
                            onClick={() =>
                              setOutfitDraft({
                                ...item,
                                garment_ids: [...item.garment_ids],
                              })
                            }
                          >
                            Edit
                          </button>
                          <button
                            className="primary"
                            onClick={() => {
                              setOutfitId(item.id)
                              setTab('schedule')
                            }}
                          >
                            Schedule
                          </button>
                          <button
                            disabled={busy}
                            className="danger"
                            onClick={() =>
                              setRemove({
                                path: `outfits/${item.id}`,
                                title: `Delete ${item.name}?`,
                                detail:
                                  'Existing calendar events stay in your calendar. Their outfit link will be removed.',
                              })
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!filteredOutfits.length && (
                    <div className="cal-card wardrobe-empty">
                      <h2>
                        {outfits.length
                          ? 'No matching outfits'
                          : 'Build your first look'}
                      </h2>
                      <p>
                        Choose garments from your wardrobe and save an outfit to
                        wear again.
                      </p>
                    </div>
                  )}
                </>
              )}

              {tab === 'schedule' && (
                <>
                  <section className="cal-card wardrobe-form">
                    <h2>Plan an outfit</h2>
                    <p>
                      Choose a saved outfit or get a weather-based suggestion
                      for the same date and calendar.
                    </p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault()
                        void act(async () => {
                          await wardrobeRequest('schedule', 'POST', {
                            outfit_id: selectedOutfit,
                            calendar_id: selectedCalendar,
                            date,
                            timezone: settings.timezone,
                          })
                        })
                      }}
                    >
                      <fieldset disabled={busy}>
                        <div className="wardrobe-fields">
                          <Field label="Outfit">
                            <Dropdown
                              ariaLabel="Outfit"
                              options={outfits.map((item) => ({
                                value: item.id,
                                label: item.name,
                              }))}
                              value={selectedOutfit}
                              onChange={setOutfitId}
                              placeholder="Choose an outfit"
                            />
                          </Field>
                          <label className="cal-field">
                            <span>Date</span>
                            <input
                              required
                              type="date"
                              value={date}
                              onChange={(e) => setDate(e.target.value)}
                            />
                          </label>
                          <Field label="Calendar">
                            <Dropdown
                              ariaLabel="Calendar"
                              options={calendars.map((item) => ({
                                value: item.id,
                                label: item.name,
                              }))}
                              value={selectedCalendar}
                              onChange={setCalendarId}
                              placeholder="Choose a calendar"
                            />
                          </Field>
                        </div>
                        <div className="cal-card-actions">
                          <button
                            type="submit"
                            className="primary"
                            disabled={!outfits.length || !calendars.length}
                          >
                            {busy ? 'Saving…' : 'Add to calendar'}
                          </button>
                        </div>
                      </fieldset>
                      {!outfits.length && (
                        <p>Create an outfit first to schedule it.</p>
                      )}
                      {!calendars.length && (
                        <p>
                          Create a local calendar in Calendar to schedule
                          outfits.
                        </p>
                      )}
                    </form>
                    {preferences?.weather_planning_enabled && (
                      <OutfitAssistant
                        embedded
                        mode="weather"
                        date={date}
                        onDateChange={setDate}
                        calendarId={selectedCalendar}
                        timezone={settings.timezone}
                        garments={garments}
                        onSaved={load}
                      />
                    )}
                  </section>
                  <h2>Scheduled outfits</h2>
                  {!schedule.length && <p>No outfits scheduled yet.</p>}
                  {schedule.map((item) => (
                    <article
                      className="cal-card wardrobe-plan"
                      key={item.event_id}
                    >
                      <div>
                        <h3>{item.title}</h3>
                        <p>
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: 'full',
                            timeZone: item.timezone,
                          }).format(
                            new Date(
                              item.start_at.endsWith('Z') ||
                                /[+-]\d{2}:\d{2}$/.test(item.start_at)
                                ? item.start_at
                                : `${item.start_at}Z`,
                            ),
                          )}
                        </p>
                      </div>
                      <div className="cal-card-actions">
                        <Link
                          to={`/wardrobe?tab=outfits&outfit=${item.outfit_id}`}
                        >
                          View outfit
                        </Link>
                        <Link to="/calendar">Calendar</Link>
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() =>
                            setRemove({
                              path: `schedule/${item.event_id}`,
                              title: 'Remove scheduled outfit?',
                              detail:
                                'This disconnects the outfit. The calendar event and saved outfit are kept.',
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </main>
      <ConfirmDialog
        open={remove !== null && !busy}
        message={remove?.title ?? ''}
        detail={remove?.detail}
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) {
            const path = remove.path
            setRemove(null)
            void act(async () => {
              await wardrobeRequest(path, 'DELETE')
            })
          }
        }}
      />
    </div>
  )
}
