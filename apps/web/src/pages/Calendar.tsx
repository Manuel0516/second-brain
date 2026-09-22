import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppRail } from '../components/AppRail'
import { Segmented } from '../components/Segmented'
import { Sidebar } from '../modules/calendar/Sidebar'
import { TimeGrid } from '../modules/calendar/TimeGrid'
import { MonthView } from '../modules/calendar/MonthView'
import { EventEditor } from '../modules/calendar/EventEditor'
import {
  clampRowHeight,
  daysOf,
  DEFAULT_ROW_HEIGHT,
  startOfDay,
  startOfWeekMonday,
} from '../modules/calendar/time'
import { useSettings } from '../context/SettingsContext'
import type { CalendarData, CalendarEvent } from '../modules/calendar/types'
import { occurrenceKey } from '../modules/calendar/types'
import { orderCalendars } from '../modules/calendar/order'
import { apiCall } from '../lib/api'

type View = 'day' | 'week' | 'month'
const VIEWS: View[] = ['day', 'week', 'month']
const NotesPagePane = lazy(() =>
  import('../modules/notes/NotesPagePane').then((module) => ({
    default: module.NotesPagePane,
  })),
)

function formatTitle(
  view: View,
  cursor: Date,
  days: Date[],
  isMobile: boolean,
): string {
  if (view === 'day') {
    return (days[0] ?? cursor).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }
  if (view === 'month') {
    return cursor.toLocaleDateString('en-US', {
      month: 'long',
      ...(!isMobile && { year: 'numeric' }),
    })
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(!isMobile && { year: 'numeric' }),
  }).formatRange(days[0] ?? cursor, days.at(-1) ?? cursor)
}

export function Calendar() {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 640,
  )
  const [isRailMobile, setIsRailMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 800,
  )
  // Use settings.default_view with 'week' as fallback
  const initialView = (
    typeof window !== 'undefined' ? settings.default_view : 'week'
  ) as View
  const [view, setView] = useState<View>(initialView)
  // Cursor for the start of the visible range, honouring week-start + mobile.
  const startCursorFor = useCallback(
    (mobile: boolean, weekStart: 'monday' | 'sunday') => {
      if (mobile) return startOfDay(new Date())
      if (weekStart === 'sunday') {
        const start = startOfDay(new Date())
        const offset = start.getDay() === 0 ? 0 : -start.getDay()
        start.setDate(start.getDate() + offset)
        return start
      }
      return startOfWeekMonday(new Date())
    },
    [],
  )
  const [cursor, setCursor] = useState(() =>
    typeof window === 'undefined'
      ? new Date()
      : startCursorFor(window.innerWidth <= 640, settings.week_start),
  )
  const [rowHeight, setRowHeight] = useState(() => {
    const stored = Number(localStorage.getItem('sb-cal-row-h'))
    return stored ? clampRowHeight(stored) : DEFAULT_ROW_HEIGHT
  })
  const [calendars, setCalendars] = useState<CalendarData[]>([])
  const [editorEvent, setEditorEvent] = useState<Partial<CalendarEvent> | null>(
    null,
  )
  const [draftPreview, setDraftPreview] =
    useState<Partial<CalendarEvent> | null>(null)
  // The exact occurrence the editor is previewing — hidden from the grid so it
  // isn't drawn twice. Stable across edits: editorEvent keeps the original
  // start_at (only draftPreview moves), so for a recurring event we hide just
  // this occurrence, not the whole series.
  const draftReplaceKey =
    editorEvent?.id && editorEvent.start_at
      ? occurrenceKey({ id: editorEvent.id, start_at: editorEvent.start_at })
      : null
  const [refresh, setRefresh] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 800,
  )
  const [openNotePageId, setOpenNotePageId] = useState<string | null>(null)
  const [notePaneWidth, setNotePaneWidth] = useState(() => {
    const stored = Number(localStorage.getItem('sb-note-pane-width'))
    return stored || 420
  })
  // Settings load asynchronously. Apply the saved default view + week start when
  // they arrive (and when changed on the settings page) by adjusting state during
  // render — guarded so manual navigation isn't reset. (React's recommended
  // "store previous value" pattern; avoids a cascading effect.)
  const settingsKey = `${settings.default_view}|${settings.week_start}`
  const [appliedSettingsKey, setAppliedSettingsKey] = useState(settingsKey)
  if (appliedSettingsKey !== settingsKey) {
    setAppliedSettingsKey(settingsKey)
    setView(settings.default_view as View)
    setCursor(startCursorFor(window.innerWidth <= 640, settings.week_start))
  }

  const bodyRef = useRef<HTMLDivElement>(null)
  const navDir = useRef(0)
  // Trackpad day-stepping skips the slide so continuous scrolling stays smooth.
  const animateNav = useRef(false)
  const dividerDrag = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)

  const moveDivider = (pointer: React.PointerEvent<HTMLDivElement>) => {
    const drag = dividerDrag.current
    if (!drag || drag.pointerId !== pointer.pointerId) return
    const max = Math.max(320, window.innerWidth * 0.65)
    setNotePaneWidth(
      Math.min(
        max,
        Math.max(320, drag.startWidth + drag.startX - pointer.clientX),
      ),
    )
  }

  const finishDivider = (pointer: React.PointerEvent<HTMLDivElement>) => {
    if (dividerDrag.current?.pointerId !== pointer.pointerId) return
    pointer.currentTarget.releasePointerCapture(pointer.pointerId)
    dividerDrag.current = null
    localStorage.setItem(
      'sb-note-pane-width',
      String(Math.round(notePaneWidth)),
    )
  }

  const openMentionedEvent = async (eventId: string) => {
    const response = await apiCall(`/api/events/${eventId}`).catch(() => null)
    if (!response?.ok) return
    const calendarEvent: CalendarEvent = await response.json()
    const day = startOfDay(new Date(calendarEvent.start_at))
    setCursor(day)
    setView('day')
    setOpenNotePageId(null)
    setEditorEvent(calendarEvent)
  }

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)')
    const update = () => {
      setIsRailMobile(media.matches)
      setSidebarOpen(!media.matches)
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // Replay a directional slide when the user navigates by button or view switch.
  useEffect(() => {
    const el = bodyRef.current
    if (!el || !animateNav.current) return
    animateNav.current = false
    const name = navDir.current < 0 ? 'daySlideLeft' : 'daySlideRight'
    el.style.animation = 'none'
    void el.offsetWidth // reflow to restart the animation
    el.style.animation = `${name} 0.18s cubic-bezier(0.16, 1, 0.3, 1)`
  }, [cursor, view])

  const changeRowHeight = useCallback((value: number) => {
    const clamped = clampRowHeight(value)
    setRowHeight(clamped)
    localStorage.setItem('sb-cal-row-h', String(Math.round(clamped)))
  }, [])

  const days =
    isMobile && view === 'week'
      ? Array.from({ length: 3 }, (_, index) => {
          const day = startOfDay(cursor)
          day.setDate(day.getDate() + index)
          return day
        })
      : daysOf(view, cursor)

  const loadCalendars = useCallback(() => {
    apiCall('/api/calendars')
      .then(
        async (response) => response.ok && setCalendars(await response.json()),
      )
      .catch(() => {})
  }, [])
  useEffect(loadCalendars, [loadCalendars])

  const createAt = (start: Date, selectedEnd?: Date) => {
    const end = selectedEnd ?? new Date(start.getTime() + 60 * 60 * 1000)
    // Prefer the calendar chosen in settings, if it still exists; otherwise the
    // first calendar in the saved order.
    const defaultCalendar =
      calendars.find((c) => c.id === settings.default_calendar_id) ??
      orderCalendars(calendars)[0]
    const draft = {
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      calendar_id: defaultCalendar?.id,
    }
    setEditorEvent(draft)
    setDraftPreview(draft)
  }
  const createAllDayAt = (day: Date) => {
    const start = startOfDay(day)
    const defaultCalendar =
      calendars.find((c) => c.id === settings.default_calendar_id) ??
      orderCalendars(calendars)[0]
    const draft = {
      start_at: start.toISOString(),
      end_at: start.toISOString(),
      all_day: true,
      calendar_id: defaultCalendar?.id,
    }
    setEditorEvent(draft)
    setDraftPreview(draft)
  }
  const refreshCalendar = useCallback(() => {
    setRefresh((value) => value + 1)
    loadCalendars()
  }, [loadCalendars])
  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(
      `${protocol}//${location.host}/api/calendar/updates`,
    )
    socket.onmessage = (event) => {
      if ((JSON.parse(event.data) as { type?: string }).type === 'calendar')
        refreshCalendar()
    }
    return () => socket.close()
  }, [refreshCalendar])
  const saved = () => {
    setEditorEvent(null)
    setDraftPreview(null)
    refreshCalendar()
  }

  const shift = (direction: -1 | 1) => {
    const d = new Date(cursor)
    if (view === 'day') d.setDate(d.getDate() + direction)
    else if (view === 'week')
      d.setDate(d.getDate() + (isMobile ? 3 : 7) * direction)
    else d.setMonth(d.getMonth() + direction)
    navDir.current = direction
    animateNav.current = true
    setCursor(d)
  }
  const goToday = () => {
    setView((settings.default_view as View) || 'week')
    setCursor(startCursorFor(isMobile, settings.week_start))
  }
  const shiftByDays = useCallback((days: number) => {
    if (!days) return
    // ponytail: gesture navigation updates once without replaying the page-load
    // animation; the live drag feedback in TimeGrid already communicates motion.
    animateNav.current = false
    setCursor((current) => {
      const next = new Date(current)
      next.setDate(next.getDate() + days)
      return next
    })
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-base)',
        animation: 'fadeUp .4s cubic-bezier(.16,1,.3,1) both',
      }}
    >
      {/* ── Rail (always visible on desktop, toggles with sidebar on mobile) ── */}
      {(!isRailMobile || sidebarOpen) && (
        <AppRail active="calendar" onNavigate={navigate} />
      )}

      {/* ── Sidebar + Main ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minWidth: 0,
          position: 'relative',
        }}
      >
        {/* Sidebar */}
        <Sidebar
          calendars={calendars}
          onChanged={refreshCalendar}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        {sidebarOpen && (
          <div
            className="sidebar-backdrop"
            role="presentation"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {/* Topbar */}
          <div
            className="cal-topbar enter"
            style={{
              ['--enter-delay' as string]: '50ms',
            }}
          >
            <div className="cal-toolbar">
              <div className="cal-toolbar-primary">
                <button
                  className="cal-toolbar-button"
                  onClick={() => setSidebarOpen((open) => !open)}
                  aria-label={
                    sidebarOpen ? 'Hide navigation' : 'Show navigation'
                  }
                  aria-pressed={sidebarOpen}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                    <path d="M7.5 3.5v13" />
                  </svg>
                </button>
                <button
                  className="cal-toolbar-button"
                  onClick={() => shift(-1)}
                  aria-label="Previous"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m12 4-6 6 6 6" />
                  </svg>
                </button>
                <h2>{formatTitle(view, cursor, days, isMobile)}</h2>
                <button
                  className="cal-toolbar-button"
                  onClick={() => shift(1)}
                  aria-label="Next"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m8 4 6 6-6 6" />
                  </svg>
                </button>
                <button className="cal-today-button" onClick={goToday}>
                  Today
                </button>
              </div>

              <div className="calendar-tabs">
                <Segmented
                  value={view}
                  options={VIEWS}
                  labels={{ day: 'Day', week: 'Week', month: 'Month' }}
                  ariaLabel="Calendar view"
                  onChange={(item) => {
                    navDir.current = VIEWS.indexOf(item) - VIEWS.indexOf(view)
                    animateNav.current = true
                    setView(item)
                  }}
                />
              </div>
              <button
                className="cal-new-event-button"
                aria-label="New event"
                onClick={() => createAt(new Date())}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M10 3v14M3 10h14" />
                </svg>
              </button>
            </div>
          </div>

          {/* View body */}
          <div
            ref={bodyRef}
            className="enter"
            style={{
              ['--enter-delay' as string]: '120ms',
              flex: 1,
              display: 'flex',
              minHeight: 0,
              willChange: 'transform',
            }}
          >
            {view === 'month' ? (
              <MonthView
                monthDate={cursor}
                calendars={calendars}
                refresh={refresh}
                onCreate={(start) => createAt(start)}
                onEdit={setEditorEvent}
                draftEvent={draftPreview}
                draftReplaceKey={draftReplaceKey}
              />
            ) : (
              <TimeGrid
                days={days}
                rowHeight={rowHeight}
                calendars={calendars}
                refresh={refresh}
                onCreate={createAt}
                onCreateAllDay={createAllDayAt}
                onEdit={setEditorEvent}
                onRowHeightChange={changeRowHeight}
                onHorizontalNavigate={shiftByDays}
                draftEvent={draftPreview}
                draftReplaceKey={draftReplaceKey}
              />
            )}
          </div>
        </div>
        {openNotePageId && (
          <>
            <div
              className="calendar-note-divider"
              role="slider"
              aria-label="Resize note pane"
              aria-orientation="horizontal"
              aria-valuemin={320}
              aria-valuemax={Math.round(window.innerWidth * 0.65)}
              aria-valuenow={Math.round(notePaneWidth)}
              tabIndex={0}
              onPointerDown={(pointer) => {
                pointer.currentTarget.setPointerCapture(pointer.pointerId)
                dividerDrag.current = {
                  pointerId: pointer.pointerId,
                  startX: pointer.clientX,
                  startWidth: notePaneWidth,
                }
              }}
              onPointerMove={moveDivider}
              onPointerUp={finishDivider}
              onPointerCancel={() => (dividerDrag.current = null)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
                  return
                event.preventDefault()
                const next = Math.min(
                  window.innerWidth * 0.65,
                  Math.max(
                    320,
                    notePaneWidth + (event.key === 'ArrowLeft' ? 24 : -24),
                  ),
                )
                setNotePaneWidth(next)
                localStorage.setItem(
                  'sb-note-pane-width',
                  String(Math.round(next)),
                )
              }}
            />
            <aside
              className="calendar-note-pane"
              style={{ width: isMobile ? undefined : notePaneWidth }}
            >
              <Suspense
                fallback={<p className="notes-pane-loading">Loading note…</p>}
              >
                <NotesPagePane
                  pageId={openNotePageId}
                  onClose={() => setOpenNotePageId(null)}
                  onOpenEvent={(id) => void openMentionedEvent(id)}
                  onOpenFull={(id) => navigate(`/notes/${id}`)}
                />
              </Suspense>
            </aside>
          </>
        )}
      </div>
      {editorEvent && (
        <EventEditor
          key={`${editorEvent.id ?? 'draft'}-${editorEvent.start_at ?? ''}-${editorEvent.end_at ?? ''}-${editorEvent.calendar_id ?? ''}`}
          calendars={calendars}
          event={editorEvent}
          onClose={() => {
            setEditorEvent(null)
            setDraftPreview(null)
          }}
          onSaved={saved}
          onOpenNote={setOpenNotePageId}
          onOpenFitness={(sessionId) => {
            const isPast = editorEvent?.end_at
              ? new Date(editorEvent.end_at) < new Date()
              : false
            if (isPast)
              navigate(`/fitness?tab=history&edit_session=${sessionId}`)
            else navigate(`/fitness?session=${sessionId}`)
          }}
          onOpenFood={(mealLogId) => {
            const isPast = editorEvent?.end_at
              ? new Date(editorEvent.end_at) < new Date()
              : false
            if (isPast) navigate(`/food?tab=history&meal=${mealLogId}`)
            else navigate(`/food`)
          }}
          onDraftChange={setDraftPreview}
        />
      )}
    </div>
  )
}
