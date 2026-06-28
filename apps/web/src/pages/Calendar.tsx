import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
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
import type { CalendarData, CalendarEvent } from '../modules/calendar/types'
import { apiCall } from '../lib/api'

type View = 'day' | 'week' | 'month'
const VIEWS: View[] = ['day', 'week', 'month']
const PILL_WIDTH = 62

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

// ── Inline SVG icons from design canvas ───────────────────────────
const IconCalendar = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3.5" width="14" height="13" rx="2" />
    <path d="M3 7.5h14M7 2v3M13 2v3" />
  </svg>
)
const IconNotes = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 2.5h7.5l3 3v12a.5.5 0 01-.5.5H5a.5.5 0 01-.5-.5v-15A.5.5 0 015 2.5z" />
    <path d="M12.5 2.5v3h3M7.5 9.5h5M7.5 12.5h5" />
  </svg>
)
const IconFinance = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="10" cy="10" r="7.2" />
    <path d="M10 6.5v7M12.3 8.3c0-1.1-1.1-1.8-2.3-1.8s-2.3.6-2.3 1.6c0 2.1 4.6 1 4.6 3.1 0 1.1-1.1 1.8-2.3 1.8s-2.4-.7-2.4-1.8" />
  </svg>
)
const IconFitness = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 10h2.5M14.5 10H17M5.5 7.5v5M14.5 7.5v5M7.5 10h5" />
  </svg>
)
const IconSettings = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
)

function RailBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick?: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.currentTarget.style.animation = 'none'
        void e.currentTarget.offsetWidth // reflow to restart
        e.currentTarget.style.animation =
          'railPop .35s cubic-bezier(.16,1,.3,1) both'
        onClick?.()
      }}
      style={{
        width: 40,
        height: 40,
        border: 'none',
        borderRadius: 8,
        background: active ? 'rgba(255,240,200,0.08)' : 'transparent',
        color: active ? '#22D3EE' : '#6B6761',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background .2s, color .2s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.color = '#F0EDE5'
          e.currentTarget.style.background = 'rgba(255,240,200,0.06)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = '#6B6761'
          e.currentTarget.style.background = 'transparent'
        }
      }}
    >
      {children}
    </button>
  )
}

export function Calendar() {
  const { logout } = useAuth()
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 640,
  )
  const [view, setView] = useState<View>('week')
  const [cursor, setCursor] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 640
      ? startOfDay(new Date())
      : startOfWeekMonday(new Date()),
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
  const [refresh, setRefresh] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 800,
  )
  const bodyRef = useRef<HTMLDivElement>(null)
  const navDir = useRef(0)
  // Trackpad day-stepping skips the slide so continuous scrolling stays smooth.
  const animateNav = useRef(false)

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
    const draft = {
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      calendar_id: calendars[0]?.id,
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
    setView('week')
    setCursor(isMobile ? startOfDay(new Date()) : startOfWeekMonday(new Date()))
  }
  const shiftByDays = useCallback((days: number) => {
    setCursor((current) => {
      const next = new Date(current)
      next.setDate(next.getDate() + days)
      return next
    })
  }, [])

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  const navBtnStyle: React.CSSProperties = {
    width: 26,
    height: 26,
    background: '#1C1B17',
    border: '1px solid rgba(255,240,200,0.09)',
    borderRadius: 6,
    color: '#A8A49A',
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
        background: '#131210',
        animation: 'fadeUp .4s cubic-bezier(.16,1,.3,1) both',
      }}
    >
      {/* ── Rail ── */}
      <div
        className={`app-rail ${sidebarOpen ? 'open' : 'closed'}`}
        style={{
          width: 64,
          flexShrink: 0,
          background: '#131210',
          borderRight: '1px solid rgba(255,240,200,0.07)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '14px 0 16px',
          gap: 5,
          zIndex: 10,
        }}
      >
        {/* Planet logo */}
        <div
          style={{
            width: 34,
            height: 34,
            marginBottom: 14,
            cursor: 'pointer',
            animation: 'glow 4s ease-in-out infinite',
            flexShrink: 0,
          }}
        >
          <img
            src="/logo-neon-planet.png"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            alt="Second Brain"
          />
        </div>

        <RailBtn active title="Calendar">
          <IconCalendar />
        </RailBtn>
        <RailBtn title="Notes">
          <IconNotes />
        </RailBtn>
        <RailBtn title="Finance">
          <IconFinance />
        </RailBtn>
        <RailBtn title="Fitness">
          <IconFitness />
        </RailBtn>

        <div style={{ flex: 1 }} />

        <RailBtn title="Settings" onClick={handleLogout}>
          <IconSettings />
        </RailBtn>
      </div>

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
            className="cal-topbar"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 28px 14px',
              borderBottom: '1px solid rgba(255,240,200,0.07)',
              flexShrink: 0,
              gap: 12,
              flexWrap: 'wrap',
              animation: 'fadeDown .35s cubic-bezier(.16,1,.3,1) both',
            }}
          >
            {/* Date nav */}
            <div
              className="cal-topbar-nav"
              style={{ display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <button
                onClick={() => setSidebarOpen((open) => !open)}
                aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
                aria-pressed={sidebarOpen}
                style={navBtnStyle}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = '#252420')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = '#1C1B17')
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
                  color: '#F0EDE5',
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
                    (e.currentTarget.style.background = '#252420')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = '#1C1B17')
                  }
                >
                  ‹
                </button>
                <button
                  style={navBtnStyle}
                  onClick={() => shift(1)}
                  aria-label="Next"
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = '#252420')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = '#1C1B17')
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
                  background: 'rgba(255,240,200,0.07)',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 11.5,
                  color: '#A8A49A',
                  cursor: 'pointer',
                  transition: 'background .15s',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'rgba(255,240,200,0.10)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'rgba(255,240,200,0.07)')
                }
              >
                Today
              </button>
            </div>

            {/* View pills */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                background: '#1C1B17',
                border: '1px solid rgba(255,240,200,0.09)',
                borderRadius: 8,
                padding: 3,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 3,
                  left: 3 + VIEWS.indexOf(view) * PILL_WIDTH,
                  width: PILL_WIDTH,
                  height: 'calc(100% - 6px)',
                  background: '#252420',
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
                    color: view === v ? '#F0EDE5' : '#6B6761',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* New event */}
            <button
              className="cal-new-event"
              aria-label="New event"
              onClick={() => createAt(new Date())}
              style={{
                height: 34,
                padding: '0 14px',
                background: 'rgba(34,211,238,0.10)',
                border: '1px solid rgba(34,211,238,0.2)',
                borderRadius: 8,
                color: '#22D3EE',
                fontSize: 12.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: 'pointer',
                transition: 'background .15s',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'rgba(34,211,238,0.16)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = 'rgba(34,211,238,0.10)')
              }
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M10 4v12M4 10h12" />
              </svg>
              <span className="cal-new-event-label">New event</span>
            </button>
          </div>

          {/* View body */}
          <div
            ref={bodyRef}
            style={{
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
              />
            )}
          </div>
        </div>
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
          onDraftChange={setDraftPreview}
        />
      )}
    </div>
  )
}
