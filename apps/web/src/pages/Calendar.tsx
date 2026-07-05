import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppRail } from '../components/AppRail'
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
const PILL_WIDTH = 62
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

  // Replay a directional slide when the user navigates by button or view switch.
  useEffect(() => {
    const el = bodyRef.current
    if (!el || !animateNav.current) return
    animateNav.current = false
    const name = navDir.current < 0 ? 'daySlideLeft' : 'daySlideRight'
    el.style.animation = 'none'
    void el.offsetWidth // reflow to restart the animation
    el.style.animation = `${name} 0.28s cubic-bezier(0.16, 1, 0.3, 1)`
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
  const refreshCalendar = useCallback(() => {
    setRefresh((value) => value + 1)
    loadCalendars()
  }, [loadCalendars])
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
    setCursor((current) => {
      const next = new Date(current)
      next.setDate(next.getDate() + days)
      return next
    })
  }, [])

  const navBtnStyle: React.CSSProperties = {
    width: 26,
    height: 26,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'background .15s',
  }

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
      {(!isMobile || sidebarOpen) && (
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
          onChanged={loadCalendars}
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
              display: 'flex',
              padding: isMobile ? '12px 14px' : '18px 28px 14px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              animation: 'fadeDown .35s cubic-bezier(.16,1,.3,1) both',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                justifyContent: isMobile ? 'center' : 'space-between',
                gap: 12,
                width: '100%',
                position: isMobile ? 'relative' : undefined,
              }}
            >
              {/* Date nav */}
              <div
                className="cal-topbar-nav"
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: 'center',
                  gap: isMobile ? 10 : 12,
                  flex: isMobile ? '1 1 100%' : undefined,
                }}
              >
                {isMobile ? (
                  <>
                    {/* Row 1: toggle absolute left + centered title */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        position: 'relative',
                      }}
                    >
                      <button
                        onClick={() => setSidebarOpen((open) => !open)}
                        aria-label={
                          sidebarOpen ? 'Hide navigation' : 'Show navigation'
                        }
                        aria-pressed={sidebarOpen}
                        style={{
                          ...navBtnStyle,
                          position: 'absolute',
                          left: 0,
                        }}
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
                        >
                          <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                          <path d="M7.5 3.5v13" />
                        </svg>
                      </button>
                      <h2
                        style={{
                          fontSize: 17,
                          fontWeight: 700,
                          letterSpacing: '-.01em',
                          color: 'var(--text-primary)',
                          margin: 0,
                          textAlign: 'center',
                        }}
                      >
                        {formatTitle(view, cursor, days, isMobile)}
                      </h2>
                    </div>
                    {/* Row 2: nav arrows + Today button */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                      }}
                    >
                      <button
                        style={navBtnStyle}
                        onClick={() => shift(-1)}
                        aria-label="Previous"
                      >
                        ‹
                      </button>
                      <button
                        onClick={goToday}
                        style={{
                          height: 26,
                          padding: '0 10px',
                          background:
                            'color-mix(in srgb, var(--text-tertiary) 12%, transparent)',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 11.5,
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'background .15s',
                        }}
                      >
                        Today
                      </button>
                      <button
                        style={navBtnStyle}
                        onClick={() => shift(1)}
                        aria-label="Next"
                      >
                        ›
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setSidebarOpen((open) => !open)}
                      aria-label={
                        sidebarOpen ? 'Hide navigation' : 'Show navigation'
                      }
                      aria-pressed={sidebarOpen}
                      style={navBtnStyle}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'var(--bg-raised)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          'var(--bg-elevated)')
                      }
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
                      >
                        <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                        <path d="M7.5 3.5v13" />
                      </svg>
                    </button>
                    <h2
                      style={{
                        fontSize: 17,
                        fontWeight: 700,
                        letterSpacing: '-.01em',
                        color: 'var(--text-primary)',
                        margin: 0,
                      }}
                    >
                      {formatTitle(view, cursor, days, isMobile)}
                    </h2>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button
                        style={navBtnStyle}
                        onClick={() => shift(-1)}
                        aria-label="Previous"
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            'var(--bg-raised)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background =
                            'var(--bg-elevated)')
                        }
                      >
                        ‹
                      </button>
                      <button
                        style={navBtnStyle}
                        onClick={() => shift(1)}
                        aria-label="Next"
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            'var(--bg-raised)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background =
                            'var(--bg-elevated)')
                        }
                      >
                        ›
                      </button>
                    </div>
                    <button
                      onClick={goToday}
                      style={{
                        height: 26,
                        padding: '0 10px',
                        background:
                          'color-mix(in srgb, var(--text-tertiary) 12%, transparent)',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 11.5,
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'background .15s',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          'color-mix(in srgb, var(--text-tertiary) 18%, transparent)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          'color-mix(in srgb, var(--text-tertiary) 12%, transparent)')
                      }
                    >
                      Today
                    </button>
                  </>
                )}
              </div>

              {/* View pills */}
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 3,
                  alignSelf: isMobile ? 'center' : undefined,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: 3 + VIEWS.indexOf(view) * PILL_WIDTH,
                    width: PILL_WIDTH,
                    height: 'calc(100% - 6px)',
                    background: 'var(--bg-raised)',
                    borderRadius: 6,
                    transition:
                      'left .22s cubic-bezier(.16,1,.3,1), width .22s cubic-bezier(.16,1,.3,1)',
                    zIndex: 0,
                  }}
                />
                {VIEWS.map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      navDir.current = VIEWS.indexOf(v) - VIEWS.indexOf(view)
                      animateNav.current = true
                      setView(v)
                    }}
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      width: PILL_WIDTH,
                      padding: '5px 0',
                      border: 'none',
                      background: 'transparent',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      textTransform: 'capitalize',
                      cursor: 'pointer',
                      transition: 'color .2s',
                      color:
                        view === v
                          ? 'var(--text-primary)'
                          : 'var(--text-tertiary)',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* New event */}
              <button
                aria-label="New event"
                onClick={() => createAt(new Date())}
                style={{
                  ...(isMobile
                    ? { position: 'absolute', top: 2, right: 0 }
                    : { flexShrink: 0 }),
                  width: 34,
                  height: 34,
                  background: 'var(--accent-tint)',
                  border: '1px solid var(--accent-tint-border)',
                  borderRadius: 8,
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background .15s',
                  zIndex: 4,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background =
                    'color-mix(in srgb, var(--accent) 18%, transparent)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'var(--accent-tint)')
                }
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M10 4v12M4 10h12" />
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
          onOpenFitness={(sessionId) =>
            navigate(`/fitness?session=${sessionId}`)
          }
          onDraftChange={setDraftPreview}
        />
      )}
    </div>
  )
}
