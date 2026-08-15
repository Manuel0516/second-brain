import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Segmented } from '../../components/Segmented'
import { EmojiPicker } from '../../components/EmojiPicker'
import { IconButton } from '../../components/IconButton'
import { Dropdown } from '../../components/Dropdown'
import { FolderPicker } from '../../components/FolderPicker'
import { apiCall } from '../../lib/api'
import { useSettings } from '../../context/SettingsContext'
import { onColor } from './colors'
import { orderCalendars } from './order'
import { SESSION_TYPES, SessionTypeIcon } from '../fitness/sessionTypes'
import type { MealLog } from '../food/api'
import type { WorkoutSession } from '../fitness/api'
import type { CalendarData, CalendarEvent, EventConnections } from './types'
const MIN_SAVE_SPINNER_MS = 145

type Freq = '' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
const FREQ_UNIT: Record<Exclude<Freq, ''>, string> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
}
// Monday-first, matching the calendar grid.
const WEEKDAYS: { code: string; label: string }[] = [
  { code: 'MO', label: 'Mo' },
  { code: 'TU', label: 'Tu' },
  { code: 'WE', label: 'We' },
  { code: 'TH', label: 'Th' },
  { code: 'FR', label: 'Fr' },
  { code: 'SA', label: 'Sa' },
  { code: 'SU', label: 'Su' },
]

interface Recurrence {
  freq: Freq
  interval: number
  byday: string[]
  ends: 'never' | 'on' | 'after'
  count: number
  until: string // YYYY-MM-DD
}

function recurrenceSummary(r: Recurrence): string {
  if (!r.freq) return 'Does not repeat'
  const unit = FREQ_UNIT[r.freq]
  let text = r.interval > 1 ? `Every ${r.interval} ${unit}s` : `Every ${unit}`
  if (r.freq === 'WEEKLY' && r.byday.length) {
    const order = WEEKDAYS.map((d) => d.code)
    const names = [...r.byday]
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .map((code) => WEEKDAYS.find((d) => d.code === code)?.label)
      .join(', ')
    text += ` on ${names}`
  }
  if (r.ends === 'after') text += `, ${r.count}×`
  if (r.ends === 'on' && r.until) text += `, until ${r.until}`
  return text
}

// The weekday code (MO..SU) of a local "YYYY-MM-DDTHH:mm" or ISO string.
function weekdayCode(value: string): string {
  const date = value ? new Date(value) : new Date()
  return WEEKDAYS[(date.getDay() + 6) % 7].code
}

interface Props {
  calendars: CalendarData[]
  event: Partial<CalendarEvent>
  onClose: () => void
  onSaved: () => void
  onOpenNote?: (pageId: string) => void
  onOpenFitness?: (sessionId: string) => void
  onOpenFood?: (mealLogId: string) => void
  onDraftChange?: (event: Partial<CalendarEvent>) => void
}

interface EventLink {
  id: string
  target_type: 'page' | 'event' | 'workout_session' | 'meal_log'
  target_id: string
  relation: string
  direction: 'incoming' | 'outgoing'
  title: string
  icon?: string | null
  page_type?: string | null
  parent_title?: string | null
}

function LinkIcon({
  pageType,
  targetType,
  icon,
}: {
  pageType: string | null | undefined
  targetType?: string | null
  icon?: string | null
}) {
  // A note's own emoji takes priority; monochrome SVGs are the fallback for
  // notes without one and for workout/meal entries (which have no emoji).
  if (icon) return <span aria-hidden="true">{icon}</span>
  if (targetType === 'workout_session')
    return (
      <span aria-hidden="true">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8v8M3 10v4M3 12h3M6 12h12M18 8v8M18 12h3M21 10v4" />
        </svg>
      </span>
    )
  if (targetType === 'meal_log')
    return (
      <span aria-hidden="true">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3" />
        </svg>
      </span>
    )
  if (pageType === 'folder')
    return (
      <span aria-hidden="true">
        <svg
          width="13"
          height="13"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 5.5a1 1 0 011-1h4l2 2h7a1 1 0 011 1v8a1 1 0 01-1 1h-13a1 1 0 01-1-1z" />
        </svg>
      </span>
    )
  return (
    <span aria-hidden="true">
      <svg
        width="13"
        height="13"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 2.5h7l3.5 3.5v11.5h-10.5z" />
        <path d="M12 2.5V6h3.5" />
        <path d="M7.5 10h5M7.5 13h5" />
      </svg>
    </span>
  )
}

function localValue(value: string) {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function offsetLocalDay(value: string, days: number) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return localValue(date.toISOString())
}

function editorEndValue(event: Partial<CalendarEvent>) {
  const value = event.end_at ?? event.start_at ?? ''
  const start = localValue(event.start_at ?? '')
  const end = localValue(event.end_at ?? '')
  if (
    !event.all_day ||
    !event.start_at ||
    !event.end_at ||
    new Date(event.end_at) <= new Date(event.start_at) ||
    start.slice(0, 10) === end.slice(0, 10)
  ) {
    return localValue(value)
  }
  return offsetLocalDay(event.end_at, -1)
}

export function EventEditor({
  calendars,
  event,
  onClose,
  onSaved,
  onOpenNote,
  onOpenFitness,
  onOpenFood,
  onDraftChange,
}: Props) {
  const { settings } = useSettings()
  const iconPresets =
    settings.favorite_emojis.length > 0
      ? settings.favorite_emojis
      : ['📅', '💼', '☕', '🏃', '🍽️', '📝', '🎧', '🎯']
  const colorPresets =
    settings.favorite_colors.length > 0
      ? settings.favorite_colors
      : ['#3B6FE0', '#2E9E6E', '#D6932B', '#8B5CF6', '#D9573F']
  // Match the sidebar's saved calendar order in the picker and defaults.
  // Memoised so derived values (selectedCalendarId) stay stable across renders.
  const orderedCalendars = useMemo(() => orderCalendars(calendars), [calendars])

  const [icon, setIcon] = useState(event.icon ?? '')
  const [form, setForm] = useState({
    title: event.title ?? '',
    calendar_id: event.calendar_id ?? orderedCalendars[0]?.id ?? '',
    start_at: localValue(event.start_at ?? ''),
    end_at: editorEndValue(event),
    all_day: event.all_day ?? false,
    color_override: event.color_override ?? '',
    location: event.location ?? '',
    link: event.link ?? '',
    reminder_minutes: event.reminder_minutes?.toString() ?? '',
    description: event.description ?? '',
    connect_notes: Boolean(event.connections?.notes),
    note_title: event.connections?.notes?.title ?? event.title ?? '',
    note_folder_id: event.connections?.notes?.folder_id ?? null,
    connect_finance: Boolean(event.connections?.finance),
    finance_type: event.connections?.finance?.type ?? 'expense',
    finance_amount: event.connections?.finance?.amount?.toString() ?? '',
    finance_currency: event.connections?.finance?.currency ?? 'SEK',
    finance_category: event.connections?.finance?.category ?? '',
    finance_counterparty: event.connections?.finance?.counterparty ?? '',
    finance_tax_relevant: event.connections?.finance?.tax_relevant ?? false,
    connect_fitness: Boolean(event.connections?.fitness),
    workout_type: event.connections?.fitness?.workout_type ?? '',
    workout_notes: event.connections?.fitness?.notes ?? '',
    connect_food: Boolean(event.connections?.food),
    meal_type: event.connections?.food?.meal_type ?? 'lunch',
    food_notes: event.connections?.food?.notes ?? '',
  })
  // Fitness workout-type card selection: mirrors form.workout_type, but keeps
  // "Custom" highlighted while its text input is still empty.
  const initialWorkoutType = event.connections?.fitness?.workout_type ?? ''
  const [workoutTypeCard, setWorkoutTypeCard] = useState<string>(
    initialWorkoutType
      ? (SESSION_TYPES as readonly string[]).includes(initialWorkoutType)
        ? initialWorkoutType
        : 'Custom'
      : '',
  )
  const [customWorkoutType, setCustomWorkoutType] = useState(
    initialWorkoutType &&
      !(SESSION_TYPES as readonly string[]).includes(initialWorkoutType)
      ? initialWorkoutType
      : '',
  )
  const selectWorkoutType = (type: string) => {
    setWorkoutTypeCard(type)
    set('workout_type', type === 'Custom' ? customWorkoutType : type)
  }
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>(
    'idle',
  )
  const [saveErrorPulse, setSaveErrorPulse] = useState(false)
  const [eventLinks, setEventLinks] = useState<EventLink[]>([])
  const [noteQuery, setNoteQuery] = useState('')
  const [noteResults, setNoteResults] = useState<
    {
      id: string
      title: string
      type: string
      icon?: string | null
      page_type?: string | null
      parent_title?: string | null
    }[]
  >([])
  // Create mode: existing notes picked to be linked once the event is saved.
  const [pendingNoteLinks, setPendingNoteLinks] = useState<
    {
      id: string
      title: string
      icon?: string | null
      page_type?: string | null
      parent_title?: string | null
    }[]
  >([])
  // Edit mode: reveal the folder+title mini-form inside the Linked card.
  const [newNoteOpen, setNewNoteOpen] = useState(false)
  // Create mode: whether to create a new note (vs only link existing ones).
  const [createNoteEnabled, setCreateNoteEnabled] = useState(false)
  // ── Food search (link existing logged meals) ──────────────────────────
  const [foodSearchQuery, setFoodSearchQuery] = useState('')
  const [foodSearchResults, setFoodSearchResults] = useState<MealLog[]>([])
  // Create mode: meals picked to be linked once the event is saved.
  const [pendingFoodLinks, setPendingFoodLinks] = useState<MealLog[]>([])
  // Which view to show in the Food connection card.
  const [foodCardView, setFoodCardView] = useState<'create' | 'search'>(
    'create',
  )
  // ── Fitness search (link existing completed workouts) ──────────────────
  const [fitnessSearchQuery, setFitnessSearchQuery] = useState('')
  const [fitnessSearchResults, setFitnessSearchResults] = useState<
    WorkoutSession[]
  >([])
  // Create mode: sessions picked to be linked once the event is saved.
  const [pendingFitnessLinks, setPendingFitnessLinks] = useState<
    WorkoutSession[]
  >([])
  // Which view to show in the Fitness connection card.
  const [fitnessCardView, setFitnessCardView] = useState<'create' | 'search'>(
    'create',
  )
  // Linked-panel create-form expand toggles (food/fitness).
  const [linkedFoodCreateOpen, setLinkedFoodCreateOpen] = useState(false)
  const [linkedFitnessCreateOpen, setLinkedFitnessCreateOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [dragY, setDragY] = useState(0) // pull-down gesture offset
  const [isDragging, setIsDragging] = useState(false)
  const dragYRef = useRef(0)
  const dragStartRef = useRef(0)
  // When set, a recurring event needs the user to choose an edit/delete scope.
  const [scopePrompt, setScopePrompt] = useState<'save' | 'delete' | null>(null)
  const [recurrence, setRecurrence] = useState<Recurrence>({
    freq: event.rrule ?? '',
    interval: event.recurrence_interval ?? 1,
    byday: event.recurrence_byday ?? [],
    ends: event.recurrence_count
      ? 'after'
      : event.recurrence_until
        ? 'on'
        : 'never',
    count: event.recurrence_count ?? 4,
    until: event.recurrence_until ? event.recurrence_until.slice(0, 10) : '',
  })
  // Repeat editor popover + the snapshot to restore on Cancel.
  const [repeatOpen, setRepeatOpen] = useState(false)
  const repeatSnapshot = useRef<Recurrence | null>(null)
  // The occurrence the editor opened on (before any time edits) — anchors
  // single-occurrence overrides and exceptions.
  const occurrenceStart = event.start_at
  const isRecurring = Boolean(event.id && event.rrule)
  // A recurring series stores one meal/workout per occurrence, all linked to the
  // same event id. Scope the Linked panel to just this occurrence's date so each
  // repetition shows only its own food/fitness entry.
  const linksUrl =
    isRecurring && occurrenceStart
      ? `/api/events/${event.id}/links?on=${new Date(occurrenceStart).toISOString().slice(0, 10)}`
      : `/api/events/${event.id}/links`
  const closingRef = useRef(false)
  const closeTimer = useRef(0)
  const saveStateTimer = useRef(0)
  const errorFrame = useRef(0)
  const errorTimer = useRef(0)
  const editorRef = useRef<HTMLElement>(null)
  // Guard: ignore close-requests fired within 300ms of mount (e.g. synthetic
  // mousedown from the touch double-tap that opened the editor).
  const mountedAt = useRef(0)
  useEffect(() => {
    mountedAt.current = Math.floor(performance.now())
  }, [])

  const refreshLinks = async () => {
    if (!event.id) return
    try {
      const response = await apiCall(linksUrl)
      if (!response.ok) return
      const links = await response.json()
      if (Array.isArray(links)) setEventLinks(links)
    } catch {
      /* non-critical */
    }
  }
  useEffect(() => {
    if (!event.id) return
    let active = true
    void (async () => {
      try {
        const response = await apiCall(linksUrl)
        if (!response.ok || !active) return
        const links = await response.json()
        if (Array.isArray(links) && active) {
          setEventLinks(links)
          // Links made elsewhere (notes side) still flip the toggle on.
          if (links.some((link) => link.target_type === 'page')) {
            setForm((current) =>
              current.connect_notes
                ? current
                : { ...current, connect_notes: true },
            )
          }
          // A workout session created from this event (backend hook) flips
          // the fitness toggle on too, even though the editor didn't set it.
          if (links.some((link) => link.target_type === 'workout_session')) {
            setForm((current) =>
              current.connect_fitness
                ? current
                : { ...current, connect_fitness: true },
            )
          }
        }
      } catch {
        /* non-critical */
      }
    })()
    return () => {
      active = false
    }
  }, [event.id, linksUrl])

  // Link an existing note (page) to this event — the same note can be linked
  // to many events, and an event can link many notes (generic Link edges).
  const linkExistingNote = async (pageId: string) => {
    if (!event.id) return
    const response = await apiCall('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'event',
        source_id: event.id,
        target_type: 'page',
        target_id: pageId,
        relation: 'note',
      }),
    })
    if (response.ok || response.status === 409) {
      setNoteQuery('')
      setNoteResults([])
      await refreshLinks()
    }
  }

  const unlinkItem = async (linkId: string) => {
    const response = await apiCall(`/api/links/${linkId}`, { method: 'DELETE' })
    if (response.ok) await refreshLinks()
  }

  // ── Link existing food / fitness ──────────────────────────────────────

  const linkExistingFood = async (mealLogId: string) => {
    if (!event.id) return
    const response = await apiCall('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'event',
        source_id: event.id,
        target_type: 'meal_log',
        target_id: mealLogId,
        relation: 'logged_from',
      }),
    })
    if (response.ok || response.status === 409) {
      setFoodSearchQuery('')
      setFoodSearchResults([])
      await refreshLinks()
    }
  }

  const linkExistingFitness = async (sessionId: string) => {
    if (!event.id) return
    const response = await apiCall('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'event',
        source_id: event.id,
        target_type: 'workout_session',
        target_id: sessionId,
        relation: 'logged_from',
      }),
    })
    if (response.ok || response.status === 409) {
      setFitnessSearchQuery('')
      setFitnessSearchResults([])
      await refreshLinks()
    }
  }

  useEffect(() => {
    let active = true
    const query = noteQuery.trim()
    const timer = setTimeout(async () => {
      if (!query) {
        if (active) setNoteResults([])
        return
      }
      try {
        const response = await apiCall(
          `/api/search?q=${encodeURIComponent(query)}`,
        )
        if (!response.ok || !active) return
        const results = await response.json()
        const linkedIds = new Set([
          ...eventLinks.map((link) => link.target_id),
          ...pendingNoteLinks.map((link) => link.id),
        ])
        setNoteResults(
          (Array.isArray(results) ? results : [])
            .filter((item) => item.type === 'page' && !linkedIds.has(item.id))
            .slice(0, 6),
        )
      } catch {
        if (active) setNoteResults([])
      }
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [noteQuery, eventLinks, pendingNoteLinks])

  // ── Food search effect ────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    const query = foodSearchQuery.trim()
    const timer = setTimeout(async () => {
      if (!query) {
        if (active) setFoodSearchResults([])
        return
      }
      try {
        const response = await apiCall(
          `/api/food/unlinked?q=${encodeURIComponent(query)}&limit=8`,
        )
        if (!response.ok || !active) return
        const results = await response.json()
        const linkedIds = new Set([
          ...eventLinks
            .filter((link) => link.target_type === 'meal_log')
            .map((link) => link.target_id),
          ...pendingFoodLinks.map((link) => link.id),
        ])
        if (active)
          setFoodSearchResults(
            (Array.isArray(results) ? results : []).filter(
              (item: MealLog) => !linkedIds.has(item.id),
            ),
          )
      } catch {
        if (active) setFoodSearchResults([])
      }
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [foodSearchQuery, eventLinks, pendingFoodLinks])

  // ── Fitness search effect ─────────────────────────────────────────────
  useEffect(() => {
    let active = true
    const query = fitnessSearchQuery.trim()
    const timer = setTimeout(async () => {
      if (!query) {
        if (active) setFitnessSearchResults([])
        return
      }
      try {
        const response = await apiCall(
          `/api/fitness/unlinked?q=${encodeURIComponent(query)}&limit=8`,
        )
        if (!response.ok || !active) return
        const results = await response.json()
        const linkedIds = new Set([
          ...eventLinks
            .filter((link) => link.target_type === 'workout_session')
            .map((link) => link.target_id),
          ...pendingFitnessLinks.map((link) => link.id),
        ])
        if (active)
          setFitnessSearchResults(
            (Array.isArray(results) ? results : []).filter(
              (item: WorkoutSession) => !linkedIds.has(item.id),
            ),
          )
      } catch {
        if (active) setFitnessSearchResults([])
      }
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [fitnessSearchQuery, eventLinks, pendingFitnessLinks])

  const closeWithAnimation = useCallback((complete: () => void) => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    closeTimer.current = window.setTimeout(complete, 240)
  }, [])

  // Close immediately without the slide-right animation (used by grabber).
  const closeImmediate = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    onClose()
  }, [onClose])

  // ── Pull-down-to-close gesture ────────────────────────────────
  const onGrabberPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStartRef.current = e.clientY
    setIsDragging(true)
    dragYRef.current = 0
    setDragY(0)
  }, [])

  const onGrabberPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || e.pointerType !== 'touch') return
      const delta = Math.max(0, e.clientY - dragStartRef.current)
      dragYRef.current = delta
      setDragY(delta)
    },
    [isDragging],
  )

  const onGrabberPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || e.pointerType !== 'touch') return
      setIsDragging(false)
      if (dragYRef.current > 80) {
        closeImmediate()
      }
      setDragY(0)
    },
    [closeImmediate, isDragging],
  )

  useEffect(() => {
    const escape = (e: KeyboardEvent) =>
      e.key === 'Escape' && closeWithAnimation(onClose)
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [closeWithAnimation, onClose])

  // Clear pending timers only on unmount. Keeping this out of the Escape effect
  // above matters: onClose is an inline prop, so a parent re-render mid-save
  // (e.g. the WebSocket calendar refresh) would otherwise run this cleanup and
  // cancel the scheduled close, leaving the card stuck open.
  useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current)
      window.clearTimeout(saveStateTimer.current)
      window.cancelAnimationFrame(errorFrame.current)
      window.clearTimeout(errorTimer.current)
    },
    [],
  )

  const showSaveError = useCallback((message: string) => {
    setError(message)
    setSaveErrorPulse(false)
    window.cancelAnimationFrame(errorFrame.current)
    window.clearTimeout(errorTimer.current)
    errorFrame.current = window.requestAnimationFrame(() => {
      setSaveErrorPulse(true)
      errorTimer.current = window.setTimeout(
        () => setSaveErrorPulse(false),
        650,
      )
    })
  }, [])

  const set = (key: keyof typeof form, value: string | boolean | null) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  // start_at/end_at are kept as "YYYY-MM-DDTHH:mm"; edit date and time halves
  // separately for a cleaner picker without changing the submitted shape.
  type TimeKey = 'start_at' | 'end_at'
  const datePart = (value: string) =>
    value.slice(0, 10) || new Date().toISOString().slice(0, 10)
  const timePart = (value: string) => value.slice(11, 16) || '09:00'
  const setDatePart = (key: TimeKey, date: string) =>
    set(key, `${date}T${timePart(form[key])}`)
  const setTimePart = (key: TimeKey, time: string) =>
    set(key, `${datePart(form[key])}T${time}`)

  // Once a workout session exists for this event, the fitness card just
  // links to it — the type/notes were already consumed by the backend hook.
  // ponytail: only eventLinks — removing event.connections?.food/.fitness so
  // that unlinking a meal/workout immediately reveals the search UI in the
  // Linked panel instead of being stuck because the saved connections JSON
  // still references food/fitness.
  const fitnessLinked =
    Boolean(event.id) &&
    eventLinks.some((link) => link.target_type === 'workout_session')

  const foodLinked =
    Boolean(event.id) &&
    eventLinks.some((link) => link.target_type === 'meal_log')

  const selectedCalendarId = form.calendar_id || orderedCalendars[0]?.id || ''
  const selectedCalendarColor =
    orderedCalendars.find((calendar) => calendar.id === selectedCalendarId)
      ?.color || '#3B6FE0'

  useEffect(() => {
    if (!onDraftChange) return
    const start = new Date(form.start_at)
    const end = new Date(form.end_at)
    onDraftChange({
      ...event,
      title: form.title,
      calendar_id: selectedCalendarId,
      start_at: Number.isNaN(start.getTime())
        ? event.start_at
        : start.toISOString(),
      end_at: Number.isNaN(end.getTime()) ? event.end_at : end.toISOString(),
      all_day: form.all_day,
      icon: icon.trim() || undefined,
      color_override: form.color_override || undefined,
      location: form.location || undefined,
      link: form.link || undefined,
      description: form.description || undefined,
      reminder_minutes: form.reminder_minutes
        ? Number(form.reminder_minutes)
        : undefined,
      rrule: recurrence.freq || undefined,
    })
  }, [event, form, icon, onDraftChange, recurrence.freq, selectedCalendarId])

  const persist = useCallback(
    async (scope: 'all' | 'this' = 'all') => {
      setError('')
      const fail = (message: string): false => {
        setSaveState('idle')
        showSaveError(message)
        return false
      }
      if (!selectedCalendarId) {
        return fail('Create or select a calendar before saving this event.')
      }
      if (!form.title.trim()) {
        return fail('Add an event title.')
      }
      const start = new Date(form.start_at)
      const editorEnd = new Date(form.end_at)
      if (Number.isNaN(start.getTime()) || Number.isNaN(editorEnd.getTime())) {
        return fail('Choose a valid start and end time.')
      }
      if (form.all_day && datePart(form.end_at) < datePart(form.start_at)) {
        return fail('The end date cannot be before the start date.')
      }
      if (!form.all_day && editorEnd <= start) {
        return fail('The end time must be after the start time.')
      }
      const end = form.all_day
        ? new Date(
            offsetLocalDay(
              `${datePart(form.end_at)}T${timePart(form.start_at)}`,
              1,
            ),
          )
        : editorEnd
      if (form.connect_finance && Number(form.finance_amount) <= 0) {
        return fail('Add a finance amount greater than zero.')
      }
      if (form.connect_finance && !form.finance_category.trim()) {
        return fail('Add a finance category.')
      }
      const saveStartedAt = performance.now()
      setSaveState('saving')
      const connections: EventConnections = {
        notes: form.connect_notes
          ? {
              title: form.note_title.trim() || form.title.trim(),
              folder_id: form.note_folder_id,
              link_ids: pendingNoteLinks.map((link) => link.id),
            }
          : null,
        finance: form.connect_finance
          ? {
              type: form.finance_type as 'income' | 'expense',
              amount: Number(form.finance_amount),
              currency: form.finance_currency.trim().toUpperCase(),
              category: form.finance_category.trim(),
              counterparty: form.finance_counterparty.trim() || null,
              tax_relevant: form.finance_tax_relevant,
            }
          : null,
        // ponytail: guard with !Linked — if a link was established via search,
        // don't create a duplicate planned entry on save.
        fitness:
          form.connect_fitness && !fitnessLinked
            ? {
                workout_type: form.workout_type.trim(),
                notes: form.workout_notes.trim() || null,
              }
            : null,
        food:
          form.connect_food && !foodLinked
            ? {
                meal_type: form.meal_type as
                  | 'breakfast'
                  | 'lunch'
                  | 'dinner'
                  | 'snack',
                notes: form.food_notes.trim() || null,
              }
            : null,
      }
      const recurrenceBody = recurrence.freq
        ? {
            rrule: recurrence.freq,
            recurrence_interval: Math.min(
              365,
              Math.max(1, Math.round(recurrence.interval) || 1),
            ),
            recurrence_byday:
              recurrence.freq === 'WEEKLY' ? recurrence.byday : [],
            recurrence_count:
              recurrence.ends === 'after'
                ? Math.max(1, Math.round(recurrence.count) || 1)
                : null,
            recurrence_until:
              recurrence.ends === 'on' && recurrence.until
                ? new Date(`${recurrence.until}T23:59:59`).toISOString()
                : null,
          }
        : {
            rrule: null,
            recurrence_interval: 1,
            recurrence_byday: [],
            recurrence_count: null,
            recurrence_until: null,
          }
      const body = {
        ...form,
        calendar_id: selectedCalendarId,
        title: form.title.trim(),
        icon: icon.trim().slice(0, 32) || null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        color_override: form.color_override || null,
        location: form.location || null,
        link: form.link || null,
        reminder_minutes: form.reminder_minutes
          ? Number(form.reminder_minutes)
          : null,
        description: form.description || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        connections,
        ...recurrenceBody,
        ...(scope === 'this'
          ? { scope: 'this', occurrence_start: occurrenceStart }
          : {}),
      }
      let response: Response
      try {
        response = await apiCall(
          event.id ? `/api/events/${event.id}` : '/api/events',
          {
            method: event.id ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        )
      } catch {
        return fail('Could not connect to save the event.')
      }
      if (response.ok) {
        const savedEvent = await response.json().catch(() => null)
        let notePageId: string | undefined
        // Create mode: optionally make a new note (in its folder) and
        // attach any pre-picked existing notes. Edit mode manages links
        // in the Linked card instead — except the toggle-off cleanup below.
        if (!event.id && form.connect_notes && savedEvent?.id) {
          if (createNoteEnabled) {
            const noteResponse = await apiCall(
              `/api/events/${savedEvent.id}/note`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: form.note_title.trim() || form.title.trim(),
                  icon: icon || undefined,
                  parent_page_id: form.note_folder_id,
                }),
              },
            ).catch(() => null)
            if (!noteResponse?.ok)
              return fail('Could not create the event note.')
            const page = await noteResponse.json()
            notePageId = page.id
          }
          for (const pending of pendingNoteLinks) {
            // 409 (already linked) and network failures are non-fatal.
            await apiCall('/api/links', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                source_type: 'event',
                source_id: savedEvent.id,
                target_type: 'page',
                target_id: pending.id,
                relation: 'note',
              }),
            }).catch(() => null)
          }
          // Link any meals/Workouts picked before the event existed.
          for (const pending of pendingFoodLinks) {
            await apiCall('/api/links', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                source_type: 'event',
                source_id: savedEvent.id,
                target_type: 'meal_log',
                target_id: pending.id,
                relation: 'logged_from',
              }),
            }).catch(() => null)
          }
          for (const pending of pendingFitnessLinks) {
            await apiCall('/api/links', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                source_type: 'event',
                source_id: savedEvent.id,
                target_type: 'workout_session',
                target_id: pending.id,
                relation: 'logged_from',
              }),
            }).catch(() => null)
          }
        }
        const remaining =
          MIN_SAVE_SPINNER_MS - (performance.now() - saveStartedAt)
        if (remaining > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, remaining))
        }
        setSaveState('saved')
        return { notePageId }
      } else {
        const data = await response.json().catch(() => ({}))
        const message =
          typeof data.detail === 'string'
            ? data.detail
            : 'Could not save the event.'
        return fail(message)
      }
    },
    [
      createNoteEnabled,
      event.id,
      fitnessLinked,
      foodLinked,
      form,
      icon,
      occurrenceStart,
      pendingFitnessLinks,
      pendingFoodLinks,
      pendingNoteLinks,
      recurrence,
      selectedCalendarId,
      showSaveError,
    ],
  )

  const commitSave = async (scope: 'all' | 'this') => {
    setScopePrompt(null)
    const result = await persist(scope)
    if (result) {
      window.clearTimeout(saveStateTimer.current)
      // Refresh linked items so their titles show the updated date after a
      // reschedule that moved meals/workouts along with the event.
      void refreshLinks()
      saveStateTimer.current = window.setTimeout(
        () =>
          closeWithAnimation(() => {
            onSaved()
            if (result.notePageId) onOpenNote?.(result.notePageId)
          }),
        450,
      )
    }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    // Recurring events ask whether to edit this occurrence or the whole series.
    if (isRecurring) {
      setScopePrompt('save')
      return
    }
    await commitSave('all')
  }

  const performDelete = async (scope: 'all' | 'this' | 'following') => {
    setScopePrompt(null)
    const query =
      scope === 'all'
        ? ''
        : `?scope=${scope}&occurrence_start=${encodeURIComponent(occurrenceStart ?? '')}`
    const response = await apiCall(`/api/events/${event.id}${query}`, {
      method: 'DELETE',
    })
    if (response.ok) closeWithAnimation(onSaved)
    else setError('Could not delete the event.')
  }

  const remove = () => {
    if (!event.id) return
    if (isRecurring) {
      setScopePrompt('delete')
      return
    }
    if (window.confirm('Delete this event?')) void performDelete('all')
  }

  const openEventNote = async () => {
    if (!event.id) {
      showSaveError('Save the event before opening its note.')
      return
    }
    const response = await apiCall(`/api/events/${event.id}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.note_title.trim() || form.title.trim() || 'Untitled',
        icon: icon || undefined,
        parent_page_id: form.note_folder_id,
        // The Linked card creates additional notes, never reuses the first.
        force_new: eventLinks.some((link) => link.target_type === 'page'),
      }),
    }).catch(() => null)
    if (!response?.ok) {
      showSaveError('Could not open the event note.')
      return
    }
    const page = await response.json()
    setNewNoteOpen(false)
    closeWithAnimation(() => onOpenNote?.(page.id))
  }

  const openRepeat = () => {
    repeatSnapshot.current = recurrence
    // Scroll to top synchronously before the locked class disables overflow.
    if (editorRef.current) editorRef.current.scrollTop = 0
    setRecurrence((r) =>
      r.freq
        ? r
        : { ...r, freq: 'WEEKLY', byday: [weekdayCode(form.start_at)] },
    )
    setRepeatOpen(true)
  }
  const cancelRepeat = () => {
    if (repeatSnapshot.current) setRecurrence(repeatSnapshot.current)
    setRepeatOpen(false)
  }
  const toggleByday = (code: string) =>
    setRecurrence((r) => {
      if (r.byday.includes(code)) {
        // Keep at least one weekday selected.
        if (r.byday.length === 1) return r
        return { ...r, byday: r.byday.filter((c) => c !== code) }
      }
      return { ...r, byday: [...r.byday, code] }
    })

  return createPortal(
    <div
      className={`calendar-backdrop ${closing ? 'closing' : ''}`}
      role="presentation"
      style={{ opacity: dragY ? Math.max(0, 1 - dragY / 200) : undefined }}
      onMouseDown={(e) =>
        e.target === e.currentTarget &&
        e.timeStamp - mountedAt.current > 300 &&
        closeWithAnimation(onClose)
      }
      onKeyDown={(e) => e.key === 'Escape' && closeWithAnimation(onClose)}
    >
      <aside
        ref={editorRef}
        className={`event-editor ${closing ? 'closing' : ''} ${repeatOpen || scopePrompt ? 'locked' : ''}`}
        aria-label={event.id ? 'Edit event' : 'New event'}
      >
        {/* Pull-down grabber */}
        <div
          className="editor-grabber"
          onPointerDown={onGrabberPointerDown}
          onPointerMove={onGrabberPointerMove}
          onPointerUp={onGrabberPointerUp}
          onPointerCancel={() => {
            setIsDragging(false)
            setDragY(0)
          }}
        >
          <span className="editor-grabber-handle" />
        </div>
        <div
          className={`editor-drag-wrap${isDragging ? ' no-transition' : ''}`}
          style={{ transform: `translateY(${dragY}px)` }}
        >
          <header>
            <h2>{event.id ? 'Edit event' : 'New event'}</h2>
            <IconButton
              icon={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              }
              label="Close"
              onClick={() => closeWithAnimation(onClose)}
              size="md"
              className="editor-close"
            />
          </header>
          <form onSubmit={save} noValidate>
            <div className="editor-title-row">
              <EmojiPicker
                icon={icon}
                onChange={setIcon}
                presets={iconPresets}
                label="event icon"
              />
              <input
                className="editor-title"
                required
                placeholder="Event title"
                aria-label="Title"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </div>

            <fieldset className="editor-group">
              <legend>Calendar</legend>
              <div
                className="calendar-chips"
                role="radiogroup"
                aria-label="Calendar"
              >
                {orderedCalendars.map((calendar) => {
                  const active = calendar.id === selectedCalendarId
                  return (
                    <button
                      key={calendar.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`calendar-chip ${active ? 'active' : ''}`}
                      onClick={() => set('calendar_id', calendar.id)}
                    >
                      <span
                        className="chip-dot"
                        style={{ background: calendar.color }}
                      />
                      {calendar.name}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {event.id && (
              <fieldset className="editor-group event-linked-group">
                <legend>
                  Linked{eventLinks.length ? ` · ${eventLinks.length}` : ''}
                </legend>
                <p className="connection-help">
                  Keep related notes and records beside this event.
                </p>
                <div className="event-linked-list">
                  {eventLinks.map((link) => (
                    <div key={link.id} className="event-linked-item">
                      <LinkIcon
                        pageType={link.page_type}
                        targetType={link.target_type}
                        icon={link.icon}
                      />
                      <button
                        type="button"
                        className="event-linked-open"
                        disabled={
                          link.target_type !== 'page' &&
                          link.target_type !== 'workout_session' &&
                          link.target_type !== 'meal_log'
                        }
                        onClick={() => {
                          if (link.target_type === 'page')
                            closeWithAnimation(() =>
                              onOpenNote?.(link.target_id),
                            )
                          else if (link.target_type === 'workout_session')
                            closeWithAnimation(() =>
                              onOpenFitness?.(link.target_id),
                            )
                          else if (link.target_type === 'meal_log')
                            closeWithAnimation(() =>
                              onOpenFood?.(link.target_id),
                            )
                        }}
                      >
                        <span className="event-linked-title">{link.title}</span>
                        {link.parent_title && (
                          <small className="event-link-parent">
                            in {link.parent_title}
                          </small>
                        )}
                        <small>{link.relation}</small>
                      </button>
                      <button
                        type="button"
                        className="event-linked-unlink"
                        aria-label={`Unlink ${link.title}`}
                        title="Unlink"
                        onClick={() => void unlinkItem(link.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {!eventLinks.length && (
                    <p className="event-linked-empty">
                      {form.connect_notes
                        ? 'Nothing linked yet. Search below or create a note.'
                        : 'Nothing linked yet.'}
                    </p>
                  )}
                  {form.connect_notes && (
                    <>
                      <div className="event-link-search">
                        <input
                          type="text"
                          placeholder="Link a note or folder…"
                          value={noteQuery}
                          onChange={(e) => setNoteQuery(e.target.value)}
                        />
                        {noteResults.length > 0 && (
                          <div className="event-link-results" role="listbox">
                            {noteResults.map((result) => (
                              <button
                                key={result.id}
                                type="button"
                                role="option"
                                aria-selected={false}
                                onClick={() => void linkExistingNote(result.id)}
                              >
                                <LinkIcon
                                  pageType={result.page_type}
                                  icon={result.icon}
                                />
                                <span>{result.title}</span>
                                {result.parent_title && (
                                  <small className="event-link-parent">
                                    in {result.parent_title}
                                  </small>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {newNoteOpen ? (
                        <div className="connection-options">
                          <FolderPicker
                            value={form.note_folder_id}
                            onChange={(id) => set('note_folder_id', id)}
                          />
                          <label>
                            Note title
                            <input
                              value={form.note_title}
                              placeholder={form.title || 'Related note'}
                              onChange={(e) =>
                                set('note_title', e.target.value)
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="ghost connection-open-note"
                            onClick={() => void openEventNote()}
                          >
                            Create and open
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="ghost connection-open-note"
                          onClick={() => setNewNoteOpen(true)}
                        >
                          Create new note
                        </button>
                      )}
                    </>
                  )}
                  {/* ── Food search in Linked panel (existing event, no link) ── */}
                  {event.id &&
                    form.connect_food &&
                    !foodLinked &&
                    !eventLinks.some((l) => l.target_type === 'meal_log') && (
                      <div
                        style={{
                          padding: '6px',
                          borderTop: '1px solid var(--border)',
                        }}
                      >
                        <p
                          style={{
                            font: '600 10px var(--font-mono)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            color: 'var(--text-tertiary)',
                            margin: '0 0 8px',
                          }}
                        >
                          Link an existing meal
                        </p>
                        <div className="event-link-search-wrap">
                          <div className="event-link-search">
                            <input
                              type="text"
                              placeholder="Search logged meals…"
                              value={foodSearchQuery}
                              onChange={(e) =>
                                setFoodSearchQuery(e.target.value)
                              }
                            />
                            {foodSearchResults.length > 0 && (
                              <div
                                className="event-link-results"
                                role="listbox"
                              >
                                {foodSearchResults.map((meal) => (
                                  <button
                                    key={meal.id}
                                    type="button"
                                    role="option"
                                    aria-selected={false}
                                    onClick={() =>
                                      void linkExistingFood(meal.id)
                                    }
                                  >
                                    <span
                                      style={{
                                        flexShrink: 0,
                                        width: '16px',
                                        height: '16px',
                                        display: 'grid',
                                        placeItems: 'center',
                                      }}
                                    >
                                      <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3" />
                                      </svg>
                                    </span>
                                    <span
                                      style={{
                                        flex: 1,
                                        minWidth: 0,
                                        textAlign: 'left',
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontWeight: 600,
                                          color: 'var(--text-primary)',
                                        }}
                                      >
                                        {meal.meal_type
                                          .charAt(0)
                                          .toUpperCase() +
                                          meal.meal_type.slice(1)}
                                      </span>
                                      <small
                                        style={{
                                          display: 'block',
                                          font: '10px var(--font-mono)',
                                          color: 'var(--text-tertiary)',
                                        }}
                                      >
                                        {new Date(
                                          meal.logged_at ?? meal.date,
                                        ).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: 'numeric',
                                          minute: '2-digit',
                                        })}
                                        {meal.calories != null &&
                                          ` · ${Math.round(meal.calories)} kcal`}
                                        {meal.notes &&
                                          ` · ${meal.notes.slice(0, 40)}${meal.notes.length > 40 ? '…' : ''}`}
                                      </small>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="ghost connection-open-note"
                            onClick={() =>
                              setLinkedFoodCreateOpen(!linkedFoodCreateOpen)
                            }
                          >
                            {linkedFoodCreateOpen
                              ? 'Hide form'
                              : 'Create new planned meal'}
                          </button>
                        </div>
                        <div
                          className={`connection-create-fields${linkedFoodCreateOpen ? ' open' : ''}`}
                        >
                          <div>
                            <div className="cal-field">
                              <span>Meal</span>
                              <Dropdown
                                ariaLabel="Meal type"
                                value={form.meal_type}
                                onChange={(value) =>
                                  set('meal_type', value as string)
                                }
                                options={[
                                  {
                                    value: 'breakfast',
                                    label: 'Breakfast',
                                  },
                                  { value: 'lunch', label: 'Lunch' },
                                  { value: 'dinner', label: 'Dinner' },
                                  { value: 'snack', label: 'Snack' },
                                ]}
                              />
                            </div>
                            <label>
                              Notes
                              <textarea
                                value={form.food_notes}
                                onChange={(e) =>
                                  set('food_notes', e.target.value)
                                }
                                rows={1}
                                placeholder="Optional notes"
                                style={{
                                  minHeight: '34px',
                                  resize: 'none',
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  {/* ── Fitness search in Linked panel ── */}
                  {event.id &&
                    form.connect_fitness &&
                    !fitnessLinked &&
                    !eventLinks.some(
                      (l) => l.target_type === 'workout_session',
                    ) && (
                      <div
                        style={{
                          padding: '12px',
                          borderTop: '1px solid var(--border)',
                        }}
                      >
                        <p
                          style={{
                            font: '600 10px var(--font-mono)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            color: 'var(--text-tertiary)',
                            margin: '0 0 8px',
                          }}
                        >
                          Link an existing workout
                        </p>
                        <div className="event-link-search-wrap">
                          <div className="event-link-search">
                            <input
                              type="text"
                              placeholder="Search completed workouts…"
                              value={fitnessSearchQuery}
                              onChange={(e) =>
                                setFitnessSearchQuery(e.target.value)
                              }
                            />
                            {fitnessSearchResults.length > 0 && (
                              <div
                                className="event-link-results"
                                role="listbox"
                              >
                                {fitnessSearchResults.map((session) => (
                                  <button
                                    key={session.id}
                                    type="button"
                                    role="option"
                                    aria-selected={false}
                                    onClick={() =>
                                      void linkExistingFitness(session.id)
                                    }
                                  >
                                    <SessionTypeIcon
                                      type={session.type}
                                      size={16}
                                    />
                                    <span
                                      style={{
                                        flex: 1,
                                        minWidth: 0,
                                        textAlign: 'left',
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontWeight: 600,
                                          color: 'var(--text-primary)',
                                        }}
                                      >
                                        {session.type}
                                      </span>
                                      <small
                                        style={{
                                          display: 'block',
                                          font: '10px var(--font-mono)',
                                          color: 'var(--text-tertiary)',
                                        }}
                                      >
                                        {new Date(
                                          session.date,
                                        ).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                        })}
                                        {session.notes &&
                                          Object.keys(session.notes).length >
                                            0 &&
                                          ` · has notes`}
                                      </small>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="ghost connection-open-note"
                            onClick={() =>
                              setLinkedFitnessCreateOpen(
                                !linkedFitnessCreateOpen,
                              )
                            }
                          >
                            {linkedFitnessCreateOpen
                              ? 'Hide form'
                              : 'Create new workout'}
                          </button>
                        </div>
                        <div
                          className={`connection-create-fields${linkedFitnessCreateOpen ? ' open' : ''}`}
                        >
                          <div>
                            <div
                              className="type-card-grid"
                              role="radiogroup"
                              aria-label="Workout type"
                            >
                              {SESSION_TYPES.map((t) => {
                                const active = workoutTypeCard === t
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    className={`type-card ${active ? 'active' : ''}`}
                                    onClick={() => selectWorkoutType(t)}
                                  >
                                    <SessionTypeIcon type={t} />
                                    {t}
                                  </button>
                                )
                              })}
                            </div>
                            {workoutTypeCard === 'Custom' && (
                              <input
                                placeholder="Custom workout type"
                                aria-label="Custom workout type"
                                value={customWorkoutType}
                                onChange={(e) => {
                                  setCustomWorkoutType(e.target.value)
                                  set('workout_type', e.target.value)
                                }}
                              />
                            )}
                            <label>
                              Workout notes
                              <textarea
                                className="workout-notes"
                                rows={1}
                                value={form.workout_notes}
                                onChange={(e) =>
                                  set('workout_notes', e.target.value)
                                }
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              </fieldset>
            )}

            <fieldset className="editor-group">
              <legend>When</legend>
              <label className="toggle-row">
                <span>All day</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={form.all_day}
                  onChange={(e) => set('all_day', e.target.checked)}
                />
              </label>
              <label className="dt-row">
                <span>Starts</span>
                <div className="dt-field">
                  {!form.all_day && (
                    <input
                      type="time"
                      step={300}
                      aria-label="Start time"
                      value={timePart(form.start_at)}
                      onChange={(e) => setTimePart('start_at', e.target.value)}
                    />
                  )}
                  <input
                    required
                    type="date"
                    aria-label="Start date"
                    value={datePart(form.start_at)}
                    onChange={(e) => setDatePart('start_at', e.target.value)}
                  />
                </div>
              </label>
              <label className="dt-row">
                <span>Ends</span>
                <div className="dt-field">
                  {!form.all_day && (
                    <input
                      type="time"
                      step={300}
                      aria-label="End time"
                      value={timePart(form.end_at)}
                      onChange={(e) => setTimePart('end_at', e.target.value)}
                    />
                  )}
                  <input
                    required
                    type="date"
                    aria-label="End date"
                    value={datePart(form.end_at)}
                    onChange={(e) => setDatePart('end_at', e.target.value)}
                  />
                </div>
              </label>
              <label>
                Repeats
                <div className="repeat-field-row">
                  <button
                    type="button"
                    className="repeat-field"
                    onClick={openRepeat}
                  >
                    {recurrenceSummary(recurrence)}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 7.5l5 5 5-5" />
                    </svg>
                  </button>
                  {recurrence.freq && (
                    <button
                      type="button"
                      className="repeat-clear"
                      aria-label="Remove repeat"
                      onClick={() => setRecurrence((r) => ({ ...r, freq: '' }))}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      >
                        <path d="M5 5l10 10M15 5L5 15" />
                      </svg>
                    </button>
                  )}
                </div>
              </label>
            </fieldset>

            <fieldset className="editor-group">
              <legend>Color</legend>
              <div className="color-swatches">
                {colorPresets.map((preset) => {
                  const active =
                    form.color_override.toLowerCase() === preset.toLowerCase()
                  return (
                    <button
                      key={preset}
                      type="button"
                      className={`color-swatch ${active ? 'active' : ''}`}
                      aria-label={`Use color ${preset}`}
                      aria-pressed={active}
                      style={
                        {
                          background: preset,
                          '--cc-on': onColor(preset),
                        } as React.CSSProperties
                      }
                      onClick={() => set('color_override', preset)}
                    />
                  )
                })}
                <label
                  className={`color-custom ${
                    form.color_override &&
                    !colorPresets.some(
                      (preset) =>
                        preset.toLowerCase() ===
                        form.color_override.toLowerCase(),
                    )
                      ? 'active'
                      : ''
                  }`}
                  title="Custom color"
                  style={
                    {
                      background: form.color_override || selectedCalendarColor,
                      '--cc-on': onColor(
                        form.color_override || selectedCalendarColor,
                      ),
                    } as React.CSSProperties
                  }
                >
                  <input
                    type="color"
                    aria-label="Custom event color"
                    value={form.color_override || selectedCalendarColor}
                    onChange={(e) => set('color_override', e.target.value)}
                  />
                  <svg
                    className="color-custom-icon"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M14.5 3.5a2.1 2.1 0 0 1 3 3l-7.8 7.8-3.9.9.9-3.9z" />
                    <path d="M12.5 5.5l2 2" />
                  </svg>
                </label>
                <button
                  type="button"
                  className="color-clear"
                  aria-pressed={!form.color_override}
                  onClick={() => set('color_override', '')}
                >
                  Use calendar color
                </button>
              </div>
            </fieldset>

            <fieldset className="editor-group">
              <legend>Connections</legend>
              <p className="connection-help">
                Prepare related records that will live in the other modules.
              </p>
              <div className="connection-list">
                <div
                  className={`connection-card ${form.connect_notes ? 'active' : ''}`}
                >
                  <label className="toggle-row">
                    <span>Notes</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={form.connect_notes}
                      onChange={(e) => {
                        set('connect_notes', e.target.checked)
                        if (e.target.checked && !form.note_title)
                          set('note_title', form.title)
                      }}
                    />
                  </label>
                  {form.connect_notes && (
                    <div className="connection-options">
                      <label className="connection-check">
                        <input
                          type="checkbox"
                          checked={createNoteEnabled}
                          onChange={(e) =>
                            setCreateNoteEnabled(e.target.checked)
                          }
                        />
                        Create new note
                      </label>
                      <div
                        className={`connection-create-fields${createNoteEnabled ? ' open' : ''}`}
                      >
                        <div>
                          <span className="connection-field-label">Folder</span>
                          <FolderPicker
                            value={form.note_folder_id}
                            onChange={(id) => set('note_folder_id', id)}
                          />
                        </div>
                        <div>
                          <span className="connection-field-label">
                            Note title
                          </span>
                          <input
                            aria-label="Note title"
                            value={form.note_title}
                            placeholder={form.title || 'Related note'}
                            onChange={(e) => set('note_title', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="event-link-search">
                        <span className="connection-field-label">Link</span>
                        <input
                          type="text"
                          placeholder={
                            createNoteEnabled
                              ? 'Also link notes or folders…'
                              : 'Link notes or folders…'
                          }
                          value={noteQuery}
                          onChange={(e) => setNoteQuery(e.target.value)}
                        />
                        {noteResults.length > 0 && (
                          <div className="event-link-results" role="listbox">
                            {noteResults.map((result) => (
                              <button
                                key={result.id}
                                type="button"
                                role="option"
                                aria-selected={false}
                                onClick={() => {
                                  setPendingNoteLinks((current) => [
                                    ...current,
                                    {
                                      id: result.id,
                                      title: result.title,
                                      icon: result.icon,
                                      page_type: result.page_type,
                                      parent_title: result.parent_title,
                                    },
                                  ])
                                  setNoteQuery('')
                                  setNoteResults([])
                                }}
                              >
                                <LinkIcon
                                  pageType={result.page_type}
                                  icon={result.icon}
                                />
                                <span>{result.title}</span>
                                {result.parent_title && (
                                  <small className="event-link-parent">
                                    in {result.parent_title}
                                  </small>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {pendingNoteLinks.map((pending) => (
                        <div key={pending.id} className="event-linked-item">
                          <LinkIcon
                            pageType={pending.page_type}
                            icon={pending.icon}
                          />
                          <span className="event-linked-title">
                            {pending.title}
                          </span>
                          {pending.parent_title && (
                            <small className="event-link-parent">
                              in {pending.parent_title}
                            </small>
                          )}
                          <button
                            type="button"
                            className="event-linked-unlink"
                            aria-label={`Remove ${pending.title}`}
                            title="Remove"
                            onClick={() =>
                              setPendingNoteLinks((current) =>
                                current.filter(
                                  (item) => item.id !== pending.id,
                                ),
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className={`connection-card ${form.connect_finance ? 'active' : ''}`}
                >
                  <label className="toggle-row">
                    <span>Finance</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={form.connect_finance}
                      onChange={(e) => set('connect_finance', e.target.checked)}
                    />
                  </label>
                  {form.connect_finance && (
                    <div className="connection-options two-column">
                      <div className="cal-field">
                        <span>Type</span>
                        <Dropdown
                          ariaLabel="Finance type"
                          value={form.finance_type}
                          onChange={(value) =>
                            set('finance_type', value as string)
                          }
                          options={[
                            { value: 'expense', label: 'Expense' },
                            { value: 'income', label: 'Income' },
                          ]}
                        />
                      </div>
                      <label>
                        Amount
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={form.finance_amount}
                          onChange={(e) =>
                            set('finance_amount', e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Currency
                        <input
                          maxLength={3}
                          value={form.finance_currency}
                          onChange={(e) =>
                            set('finance_currency', e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Category
                        <input
                          value={form.finance_category}
                          onChange={(e) =>
                            set('finance_category', e.target.value)
                          }
                        />
                      </label>
                      <label className="connection-wide">
                        Counterparty
                        <input
                          value={form.finance_counterparty}
                          onChange={(e) =>
                            set('finance_counterparty', e.target.value)
                          }
                        />
                      </label>
                      <label className="connection-check connection-wide">
                        <input
                          type="checkbox"
                          checked={form.finance_tax_relevant}
                          onChange={(e) =>
                            set('finance_tax_relevant', e.target.checked)
                          }
                        />
                        Tax relevant
                      </label>
                    </div>
                  )}
                </div>

                <div
                  className={`connection-card ${form.connect_fitness ? 'active' : ''}`}
                >
                  <label className="toggle-row">
                    <span>Fitness</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={form.connect_fitness}
                      disabled={fitnessLinked}
                      onChange={(e) => set('connect_fitness', e.target.checked)}
                    />
                  </label>
                  {form.connect_fitness &&
                    (fitnessLinked ? (
                      <p className="connection-help">
                        Managed from the linked workout — open it from Linked
                        above to edit exercises and notes.
                      </p>
                    ) : !event.id && fitnessCardView === 'create' ? (
                      <div className="connection-options">
                        <div
                          className="type-card-grid"
                          role="radiogroup"
                          aria-label="Workout type"
                        >
                          {SESSION_TYPES.map((t) => {
                            const active = workoutTypeCard === t
                            return (
                              <button
                                key={t}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                className={`type-card ${active ? 'active' : ''}`}
                                onClick={() => selectWorkoutType(t)}
                              >
                                <SessionTypeIcon type={t} />
                                {t}
                              </button>
                            )
                          })}
                        </div>
                        {workoutTypeCard === 'Custom' && (
                          <input
                            placeholder="Custom workout type"
                            aria-label="Custom workout type"
                            value={customWorkoutType}
                            onChange={(e) => {
                              setCustomWorkoutType(e.target.value)
                              set('workout_type', e.target.value)
                            }}
                          />
                        )}
                        <label>
                          Workout notes
                          <textarea
                            className="workout-notes"
                            rows={1}
                            value={form.workout_notes}
                            onChange={(e) =>
                              set('workout_notes', e.target.value)
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="ghost connection-open-note"
                          onClick={() => setFitnessCardView('search')}
                        >
                          Skip, link existing workout
                        </button>
                      </div>
                    ) : !event.id ? (
                      <div className="connection-options">
                        <div className="event-link-search">
                          <input
                            type="text"
                            placeholder="Link a completed workout…"
                            value={fitnessSearchQuery}
                            onChange={(e) =>
                              setFitnessSearchQuery(e.target.value)
                            }
                          />
                          {fitnessSearchResults.length > 0 && (
                            <div className="event-link-results" role="listbox">
                              {fitnessSearchResults.map((session) => (
                                <button
                                  key={session.id}
                                  type="button"
                                  role="option"
                                  aria-selected={false}
                                  onClick={() => {
                                    if (event.id) {
                                      void linkExistingFitness(session.id)
                                    } else {
                                      setPendingFitnessLinks((prev) => [
                                        ...prev,
                                        session,
                                      ])
                                      setFitnessSearchQuery('')
                                      setFitnessSearchResults([])
                                    }
                                  }}
                                >
                                  <SessionTypeIcon
                                    type={session.type}
                                    size={16}
                                  />
                                  <span
                                    style={{
                                      flex: 1,
                                      minWidth: 0,
                                      textAlign: 'left',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                      }}
                                    >
                                      {session.type}
                                    </span>
                                    <small
                                      style={{
                                        display: 'block',
                                        font: '10px var(--font-mono)',
                                        color: 'var(--text-tertiary)',
                                      }}
                                    >
                                      {new Date(
                                        session.date,
                                      ).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })}
                                      {session.notes &&
                                        Object.keys(session.notes).length > 0 &&
                                        ` · has notes`}
                                    </small>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="ghost connection-open-note"
                          onClick={() => {
                            setFitnessCardView('create')
                            setFitnessSearchQuery('')
                            setFitnessSearchResults([])
                          }}
                        >
                          Back to create
                        </button>
                        {pendingFitnessLinks.length > 0 && (
                          <p
                            style={{
                              font: '10px var(--font-mono)',
                              color: 'var(--text-tertiary)',
                              margin: '4px 0 0',
                            }}
                          >
                            {pendingFitnessLinks.length} workout(s) will be
                            linked on save
                          </p>
                        )}
                      </div>
                    ) : null)}
                </div>

                <div
                  className={`connection-card ${form.connect_food ? 'active' : ''}`}
                >
                  <label className="toggle-row">
                    <span>Food</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={form.connect_food}
                      disabled={foodLinked}
                      onChange={(e) => set('connect_food', e.target.checked)}
                    />
                  </label>
                  {form.connect_food &&
                    (foodLinked ? (
                      <p className="connection-help">
                        Managed from the linked meal — open it from Linked above
                        to log or edit.
                      </p>
                    ) : !event.id && foodCardView === 'create' ? (
                      <div className="connection-options">
                        <div className="cal-field">
                          <span>Meal</span>
                          <Dropdown
                            ariaLabel="Meal type"
                            value={form.meal_type}
                            onChange={(value) =>
                              set('meal_type', value as string)
                            }
                            options={[
                              { value: 'breakfast', label: 'Breakfast' },
                              { value: 'lunch', label: 'Lunch' },
                              { value: 'dinner', label: 'Dinner' },
                              { value: 'snack', label: 'Snack' },
                            ]}
                          />
                        </div>
                        <label>
                          Notes
                          <textarea
                            value={form.food_notes}
                            onChange={(e) => set('food_notes', e.target.value)}
                            rows={1}
                            placeholder="Optional notes"
                            style={{ minHeight: '34px', resize: 'none' }}
                          />
                        </label>
                        <button
                          type="button"
                          className="ghost connection-open-note"
                          onClick={() => setFoodCardView('search')}
                        >
                          Skip, link existing meal
                        </button>
                      </div>
                    ) : !event.id ? (
                      <div className="connection-options">
                        <div className="event-link-search">
                          <input
                            type="text"
                            placeholder="Link a logged meal…"
                            value={foodSearchQuery}
                            onChange={(e) => setFoodSearchQuery(e.target.value)}
                          />
                          {foodSearchResults.length > 0 && (
                            <div className="event-link-results" role="listbox">
                              {foodSearchResults.map((meal) => (
                                <button
                                  key={meal.id}
                                  type="button"
                                  role="option"
                                  aria-selected={false}
                                  onClick={() => {
                                    if (event.id) {
                                      void linkExistingFood(meal.id)
                                    } else {
                                      setPendingFoodLinks((prev) => [
                                        ...prev,
                                        meal,
                                      ])
                                      setFoodSearchQuery('')
                                      setFoodSearchResults([])
                                    }
                                  }}
                                >
                                  <span
                                    style={{
                                      flexShrink: 0,
                                      width: '16px',
                                      height: '16px',
                                      display: 'grid',
                                      placeItems: 'center',
                                    }}
                                  >
                                    <svg
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3" />
                                    </svg>
                                  </span>
                                  <span
                                    style={{
                                      flex: 1,
                                      minWidth: 0,
                                      textAlign: 'left',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                      }}
                                    >
                                      {meal.meal_type.charAt(0).toUpperCase() +
                                        meal.meal_type.slice(1)}
                                    </span>
                                    <small
                                      style={{
                                        display: 'block',
                                        font: '10px var(--font-mono)',
                                        color: 'var(--text-tertiary)',
                                      }}
                                    >
                                      {new Date(
                                        meal.logged_at ?? meal.date,
                                      ).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                      {meal.calories != null &&
                                        ` · ${Math.round(meal.calories)} kcal`}
                                      {meal.notes &&
                                        ` · ${meal.notes.slice(0, 40)}${meal.notes.length > 40 ? '…' : ''}`}
                                    </small>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="ghost connection-open-note"
                          onClick={() => {
                            setFoodCardView('create')
                            setFoodSearchQuery('')
                            setFoodSearchResults([])
                          }}
                        >
                          Back to create
                        </button>
                        {pendingFoodLinks.length > 0 && (
                          <p
                            style={{
                              font: '10px var(--font-mono)',
                              color: 'var(--text-tertiary)',
                              margin: '4px 0 0',
                            }}
                          >
                            {pendingFoodLinks.length} meal(s) will be linked on
                            save
                          </p>
                        )}
                      </div>
                    ) : null)}
                </div>
              </div>
            </fieldset>

            <fieldset className="editor-group">
              <legend>Details</legend>
              <label>
                Location
                <input
                  placeholder="Add a place"
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                />
              </label>
              <label>
                Link
                <input
                  type="url"
                  placeholder="https://"
                  value={form.link}
                  onChange={(e) => set('link', e.target.value)}
                />
              </label>
              <div className="cal-field">
                <span>Reminder</span>
                <Dropdown
                  ariaLabel="Reminder"
                  value={form.reminder_minutes}
                  onChange={(value) => set('reminder_minutes', value as string)}
                  placeholder="None"
                  options={[
                    { value: '', label: 'None' },
                    { value: '5', label: '5 minutes before' },
                    { value: '15', label: '15 minutes before' },
                    { value: '30', label: '30 minutes before' },
                    { value: '60', label: '1 hour before' },
                    { value: '1440', label: '1 day before' },
                  ]}
                />
              </div>
              <label>
                Notes
                <textarea
                  rows={4}
                  placeholder="Add notes"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </label>
            </fieldset>

            <footer>
              {event.id && (
                <button className="danger" type="button" onClick={remove}>
                  Delete
                </button>
              )}
              {error && (
                <div className="editor-alert" role="alert">
                  <svg
                    className="editor-alert-icon"
                    width="14"
                    height="14"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <circle cx="10" cy="10" r="7.5" />
                    <path d="M10 6.2v4.8M10 14h.01" />
                  </svg>
                  <p>{error}</p>
                </div>
              )}
              <span />
              <button type="button" onClick={() => closeWithAnimation(onClose)}>
                Cancel
              </button>
              <button
                className={`primary ${saveState} ${saveErrorPulse ? 'save-error' : ''}`}
                type="submit"
                disabled={saveState !== 'idle'}
                aria-label={
                  saveState === 'saving'
                    ? 'Saving event'
                    : saveState === 'saved'
                      ? 'Event saved'
                      : 'Save'
                }
              >
                {saveState === 'saving' && (
                  <span className="event-save-spinner" />
                )}
                {saveState === 'saved' && (
                  <svg
                    className="event-save-check"
                    width="15"
                    height="15"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 8.5L6.5 12L13 4"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="20"
                      strokeDashoffset="20"
                    />
                  </svg>
                )}
                {saveState === 'idle' && 'Save'}
              </button>
            </footer>
          </form>
          {repeatOpen &&
            createPortal(
              <div className="scope-prompt" role="dialog" aria-label="Repeat">
                <div className="repeat-card">
                  <h3>Repeat</h3>
                  <div className="repeat-section">
                    <span className="repeat-label">Every</span>
                    <div className="repeat-line">
                      <input
                        type="number"
                        inputMode="numeric"
                        max={365}
                        className="repeat-interval"
                        aria-label="Interval"
                        value={recurrence.interval || ''}
                        onChange={(e) =>
                          setRecurrence((r) => ({
                            ...r,
                            interval: Number(e.target.value),
                          }))
                        }
                        onBlur={() =>
                          setRecurrence((r) => ({
                            ...r,
                            interval: Math.min(
                              365,
                              Math.max(1, Math.round(r.interval) || 1),
                            ),
                          }))
                        }
                      />
                      <Dropdown
                        ariaLabel="Frequency"
                        value={recurrence.freq || 'WEEKLY'}
                        onChange={(value) =>
                          setRecurrence((r) => ({
                            ...r,
                            freq: value as Freq,
                          }))
                        }
                        options={[
                          {
                            value: 'DAILY',
                            label: recurrence.interval > 1 ? 'Days' : 'Day',
                          },
                          {
                            value: 'WEEKLY',
                            label: recurrence.interval > 1 ? 'Weeks' : 'Week',
                          },
                          {
                            value: 'MONTHLY',
                            label: recurrence.interval > 1 ? 'Months' : 'Month',
                          },
                          {
                            value: 'YEARLY',
                            label: recurrence.interval > 1 ? 'Years' : 'Year',
                          },
                        ]}
                      />
                    </div>
                  </div>
                  <div
                    className={`repeat-collapse ${recurrence.freq === 'WEEKLY' ? 'open' : ''}`}
                  >
                    <div className="repeat-collapse-inner">
                      <div className="repeat-section">
                        <span className="repeat-label">Repeat on</span>
                        <div className="repeat-days">
                          {WEEKDAYS.map((day) => (
                            <button
                              key={day.code}
                              type="button"
                              className={`repeat-day ${recurrence.byday.includes(day.code) ? 'active' : ''}`}
                              aria-pressed={recurrence.byday.includes(day.code)}
                              onClick={() => toggleByday(day.code)}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="repeat-section">
                    <label className="toggle-row">
                      <span>Ends</span>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label="Ends"
                        checked={recurrence.ends !== 'never'}
                        onChange={(e) =>
                          setRecurrence((r) => ({
                            ...r,
                            ends: e.target.checked
                              ? r.ends === 'never'
                                ? 'on'
                                : r.ends
                              : 'never',
                          }))
                        }
                      />
                    </label>
                    <div
                      className={`repeat-collapse ${recurrence.ends !== 'never' ? 'open' : ''}`}
                    >
                      <div className="repeat-collapse-inner">
                        <div className="repeat-end-options repeat-reveal">
                          <Segmented
                            value={recurrence.ends === 'after' ? 'after' : 'on'}
                            options={['on', 'after']}
                            labels={{ on: 'On date', after: 'After count' }}
                            ariaLabel="End condition"
                            onChange={(v) =>
                              setRecurrence((r) => ({ ...r, ends: v }))
                            }
                          />
                          {recurrence.ends === 'on' ? (
                            <input
                              type="date"
                              aria-label="End date"
                              value={recurrence.until}
                              onChange={(e) =>
                                setRecurrence((r) => ({
                                  ...r,
                                  until: e.target.value,
                                }))
                              }
                            />
                          ) : (
                            <div className="repeat-line">
                              <input
                                type="number"
                                inputMode="numeric"
                                max={730}
                                aria-label="Occurrence count"
                                className="repeat-count"
                                value={recurrence.count || ''}
                                onChange={(e) =>
                                  setRecurrence((r) => ({
                                    ...r,
                                    count: Number(e.target.value),
                                  }))
                                }
                                onBlur={() =>
                                  setRecurrence((r) => ({
                                    ...r,
                                    count: Math.min(
                                      730,
                                      Math.max(1, Math.round(r.count) || 1),
                                    ),
                                  }))
                                }
                              />
                              <span className="repeat-times">times</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="repeat-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={cancelRepeat}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setRepeatOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}
          {scopePrompt &&
            createPortal(
              <div
                className="scope-prompt"
                role="dialog"
                aria-label="Repeating event"
              >
                <div className="scope-card">
                  <h3>
                    {scopePrompt === 'delete'
                      ? 'Delete repeating event'
                      : 'Edit repeating event'}
                  </h3>
                  <p>This event repeats. Apply your change to:</p>
                  <div className="scope-options">
                    <button
                      type="button"
                      className="scope-option"
                      onClick={() =>
                        scopePrompt === 'delete'
                          ? void performDelete('this')
                          : void commitSave('this')
                      }
                    >
                      This event
                    </button>
                    {scopePrompt === 'delete' && (
                      <button
                        type="button"
                        className="scope-option"
                        onClick={() => void performDelete('following')}
                      >
                        This and following events
                      </button>
                    )}
                    <button
                      type="button"
                      className="scope-option"
                      onClick={() =>
                        scopePrompt === 'delete'
                          ? void performDelete('all')
                          : void commitSave('all')
                      }
                    >
                      All events
                    </button>
                  </div>
                  <button
                    type="button"
                    className="scope-cancel"
                    onClick={() => setScopePrompt(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>,
              document.body,
            )}
        </div>
        {/* /editor-drag-wrap */}
      </aside>
    </div>,
    document.body,
  )
}
