import { useEffect, useRef, useState } from 'react'
import { apiCall } from '../../lib/api'
import { useSettings } from '../../context/SettingsContext'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { IconButton } from '../../components/IconButton'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { onColor } from './colors'
import {
  CALENDAR_ORDER_KEY,
  orderCalendars,
  storedCalendarOrder,
} from './order'
import type { CalendarData } from './types'

const LONG_PRESS_DELAY = 375
const ROW_GAP = 2 // matches `.calendar-list { gap }` in styles.css

function ColorField({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  const { settings } = useSettings()
  const colorPresets =
    settings.favorite_colors.length > 0
      ? settings.favorite_colors
      : ['#3B6FE0', '#2E9E6E', '#D6932B', '#8B5CF6', '#D9573F']
  const custom = !colorPresets.some(
    (preset) => preset.toLowerCase() === value.toLowerCase(),
  )
  return (
    <Field label="Color">
      <div className="color-swatches">
        {colorPresets.map((preset) => {
          const active = value.toLowerCase() === preset.toLowerCase()
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
              onClick={() => onChange(preset)}
            />
          )
        })}
        <label
          className={`color-custom ${custom ? 'active' : ''}`}
          title="Custom color"
          style={
            {
              background: value,
              '--cc-on': onColor(value),
            } as React.CSSProperties
          }
        >
          <input
            type="color"
            aria-label="Custom color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <PencilIcon />
        </label>
      </div>
    </Field>
  )
}

const PencilIcon = () => (
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
)

interface Props {
  calendars: CalendarData[]
  onChanged: () => void
  open?: boolean
  onClose?: () => void
}

async function errorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null)
  if (typeof data?.detail === 'string') return data.detail
  if (Array.isArray(data?.detail) && typeof data.detail[0]?.msg === 'string')
    return data.detail[0].msg
  return fallback
}

export function Sidebar({ calendars, onChanged, open = true, onClose }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#8B5CF6')
  const [error, setError] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CalendarData | null>(null)
  const [calendarOrder, setCalendarOrder] =
    useState<string[]>(storedCalendarOrder)
  const [dragging, setDragging] = useState<{ id: string; y: number } | null>(
    null,
  )
  const listRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    id: string
    pointerId: number
    startY: number
    y: number
    rowHeight: number
    homeIndex: number
    active: boolean
    timer: ReturnType<typeof setTimeout>
  } | null>(null)
  const suppressMenuClickRef = useRef<string | null>(null)

  const orderedCalendars = orderCalendars(calendars, calendarOrder)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const preventScrollWhileDragging = (event: TouchEvent) => {
      if (dragRef.current?.active) event.preventDefault()
    }
    list.addEventListener('touchmove', preventScrollWhileDragging, {
      passive: false,
    })
    return () => {
      list.removeEventListener('touchmove', preventScrollWhileDragging)
      if (dragRef.current) clearTimeout(dragRef.current.timer)
    }
  }, [])

  const reorder = (id: string, targetId: string) => {
    setCalendarOrder((current) => {
      const next = [...orderedCalendars]
      const from = next.findIndex((calendar) => calendar.id === id)
      const to = next.findIndex((calendar) => calendar.id === targetId)
      if (from < 0 || to < 0 || from === to) return current
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      const ids = next.map((calendar) => calendar.id)
      localStorage.setItem(CALENDAR_ORDER_KEY, JSON.stringify(ids))
      return ids
    })
  }

  const startReorder = (
    pointer: React.PointerEvent<HTMLButtonElement>,
    calendar: CalendarData,
  ) => {
    if (pointer.button !== 0) return
    pointer.currentTarget.setPointerCapture(pointer.pointerId)
    const pending = {
      id: calendar.id,
      pointerId: pointer.pointerId,
      startY: pointer.clientY,
      y: pointer.clientY,
      rowHeight:
        ((
          pointer.currentTarget.closest('.calendar-row') as HTMLElement | null
        )?.getBoundingClientRect().height || 40) + ROW_GAP,
      homeIndex: orderedCalendars.findIndex((c) => c.id === calendar.id),
      active: false,
      timer: 0 as unknown as ReturnType<typeof setTimeout>,
    }
    pending.timer = setTimeout(() => {
      if (dragRef.current !== pending) return
      pending.active = true
      suppressMenuClickRef.current = calendar.id
      setMenuFor(null)
      setDragging({ id: calendar.id, y: 0 })
    }, LONG_PRESS_DELAY)
    dragRef.current = pending
  }

  const moveReorder = (pointer: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointer.pointerId) return
    current.y = pointer.clientY

    // Before the long-press fires, any real movement is a scroll — bail out.
    if (!current.active) {
      if (Math.abs(current.startY - pointer.clientY) > 8) {
        clearTimeout(current.timer)
        dragRef.current = null
      }
      return
    }

    pointer.preventDefault()
    const ids = orderedCalendars.map((c) => c.id)
    const rawOffset = current.y - current.startY
    const fromIndex = ids.indexOf(current.id)
    // Where the finger has dragged the row, measured in row slots from home.
    const toIndex = Math.max(
      0,
      Math.min(
        ids.length - 1,
        current.homeIndex + Math.round(rawOffset / current.rowHeight),
      ),
    )
    if (toIndex !== fromIndex) {
      ids.splice(fromIndex, 1)
      ids.splice(toIndex, 0, current.id)
      setCalendarOrder(ids)
      localStorage.setItem(CALENDAR_ORDER_KEY, JSON.stringify(ids))
    }
    // Keep the lifted row under the finger: subtract the slots it has shifted.
    const residual =
      rawOffset - (toIndex - current.homeIndex) * current.rowHeight
    setDragging({ id: current.id, y: residual })
  }

  const finishReorder = (pointer: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointer.pointerId) return
    clearTimeout(current.timer)
    dragRef.current = null
    setDragging(null)
    // The order was already committed live during the drag; nothing to do.
  }

  const cancelReorder = () => {
    if (dragRef.current) clearTimeout(dragRef.current.timer)
    dragRef.current = null
    setDragging(null)
  }

  const patch = async (calendar: CalendarData, values: object) => {
    setError('')
    const response = await apiCall(`/api/calendars/${calendar.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (response.ok) onChanged()
    else
      setError(await errorMessage(response, 'Could not update the calendar.'))
  }

  const deleteCalendar = async (calendar: CalendarData) => {
    setError('')
    const response = await apiCall(`/api/calendars/${calendar.id}`, {
      method: 'DELETE',
    })
    if (response.ok) {
      setConfirmDelete(null)
      setMenuFor(null)
      onChanged()
    } else {
      setConfirmDelete(null)
      setError(await errorMessage(response, 'Could not delete the calendar.'))
    }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const response = await apiCall('/api/calendars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })
    if (response.ok) {
      setName('')
      setAdding(false)
      onChanged()
    } else
      setError(await errorMessage(response, 'Could not create the calendar.'))
  }

  return (
    <aside className={`calendar-sidebar ${open ? '' : 'closed'}`}>
      <div className="sidebar-title">
        <span>Calendars</span>
        <div className="sidebar-title-actions">
          <IconButton
            icon="+"
            label="Add calendar"
            onClick={() => setAdding(!adding)}
            size="md"
          />
          <IconButton
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            }
            label="Close navigation"
            onClick={() => onClose?.()}
            size="md"
            className="sidebar-close"
          />
        </div>
      </div>
      {adding && (
        <form className="cal-card" onSubmit={create}>
          <div className="cal-card-head">
            <h3>New calendar</h3>
            <button
              type="button"
              className="cal-card-close"
              aria-label="Close"
              onClick={() => {
                setAdding(false)
                setName('')
                setError('')
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
          <Field label="Name">
            <input
              required
              placeholder="Calendar name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <ColorField value={color} onChange={setColor} />
          <div className="cal-card-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setAdding(false)
                setName('')
                setError('')
              }}
            >
              Cancel
            </button>
            <button type="submit" className="primary">
              Save
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {menuFor && (
        <div
          className="calendar-menu-overlay"
          role="presentation"
          onClick={() => setMenuFor(null)}
        />
      )}
      <div className="calendar-list" ref={listRef}>
        {orderedCalendars.map((calendar, index) => (
          <div
            key={calendar.id}
            className={`calendar-row ${dragging?.id === calendar.id ? 'reordering' : ''}`}
            data-calendar-id={calendar.id}
            style={{
              transform:
                dragging?.id === calendar.id
                  ? `translateY(${dragging.y}px) scale(1.03)`
                  : undefined,
            }}
          >
            <button
              className="visibility"
              aria-label={`${calendar.is_visible ? 'Hide' : 'Show'} ${calendar.name}`}
              style={{
                background: calendar.is_visible
                  ? calendar.color
                  : 'transparent',
                borderColor: calendar.color,
              }}
              onClick={() =>
                patch(calendar, { is_visible: !calendar.is_visible })
              }
            />
            <span className="calendar-name">{calendar.name}</span>
            <button
              type="button"
              className="calendar-menu-btn"
              aria-label={`${calendar.name} options`}
              aria-haspopup="menu"
              aria-expanded={menuFor === calendar.id}
              onPointerDown={(pointer) => startReorder(pointer, calendar)}
              onPointerMove={moveReorder}
              onPointerUp={finishReorder}
              onPointerCancel={cancelReorder}
              onClick={() => {
                if (suppressMenuClickRef.current === calendar.id) {
                  suppressMenuClickRef.current = null
                  return
                }
                setMenuFor((current) =>
                  current === calendar.id ? null : calendar.id,
                )
              }}
              onKeyDown={(event) => {
                if (!event.altKey) return
                const offset = event.key === 'ArrowUp' ? -1 : 1
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                const target = orderedCalendars[index + offset]
                if (!target) return
                event.preventDefault()
                reorder(calendar.id, target.id)
              }}
            >
              ⋯
            </button>
            {menuFor === calendar.id && (
              <Card className="calendar-menu" animate={false}>
                <div className="cal-card-head">
                  <h3>Edit calendar</h3>
                  <IconButton
                    icon={
                      <svg
                        width="16"
                        height="16"
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
                    onClick={() => setMenuFor(null)}
                    size="sm"
                  />
                </div>
                <Field label="Name">
                  <input
                    aria-label={`${calendar.name} name`}
                    defaultValue={calendar.name}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setMenuFor(null)
                    }}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value !== calendar.name &&
                      patch(calendar, { name: e.target.value })
                    }
                  />
                </Field>
                <ColorField
                  value={calendar.color}
                  onChange={(c) => patch(calendar, { color: c })}
                />
                <div className="cal-card-actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setConfirmDelete(calendar)}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setMenuFor(null)}
                  >
                    Done
                  </button>
                </div>
              </Card>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={confirmDelete !== null}
        message={`Delete "${confirmDelete?.name}"?`}
        detail="All events in this calendar will be permanently deleted. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && void deleteCalendar(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
        danger
      />
      <div className="integration">
        <span className="integration-title">Integrations</span>
        <button
          type="button"
          className="integration-button"
          disabled
          title="Google OAuth will be added in the sync phase"
        >
          <span className="integration-icon" aria-hidden="true">
            G
          </span>
          <span className="integration-label">Import from Google Calendar</span>
          <span className="integration-status">Soon</span>
        </button>
      </div>
    </aside>
  )
}
