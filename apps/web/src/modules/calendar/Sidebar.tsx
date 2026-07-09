import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiCall, apiErrorMessage } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../context/SettingsContext'
import { Field } from '../../components/Field'
import { IconButton } from '../../components/IconButton'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Popover } from '../../components/Popover'
import { SidebarShell } from '../../components/SidebarShell'
import { onColor } from './colors'
import {
  CALENDAR_ORDER_KEY,
  orderCalendars,
  storedCalendarOrder,
} from './order'
import type { CalendarData } from './types'
import { ShareManager } from '../../components/ShareManager'

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

export function Sidebar({ calendars, onChanged, open = true, onClose }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
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
  const menuAnchorRef = useRef<HTMLElement>(null)
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
      setError(
        await apiErrorMessage(response, 'Could not update the calendar.'),
      )
  }

  const patchOwnShare = async (calendar: CalendarData, values: object) => {
    setError('')
    const response = await apiCall(`/api/calendars/${calendar.id}/my-share`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (response.ok) onChanged()
    else
      setError(
        await apiErrorMessage(
          response,
          'Could not update your view of this calendar.',
        ),
      )
  }

  const leaveCalendar = async (calendar: CalendarData) => {
    if (!user) return
    setError('')
    const response = await apiCall(
      `/api/calendars/${calendar.id}/shares/${user.id}`,
      { method: 'DELETE' },
    )
    if (response.ok) {
      setMenuFor(null)
      onChanged()
    } else
      setError(await apiErrorMessage(response, 'Could not leave the calendar.'))
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
      setError(
        await apiErrorMessage(response, 'Could not delete the calendar.'),
      )
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
      setError(
        await apiErrorMessage(response, 'Could not create the calendar.'),
      )
  }

  return (
    <SidebarShell
      title="Calendars"
      open={open}
      actions={
        <>
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
        </>
      }
    >
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
                calendar.effective_role && calendar.effective_role !== 'owner'
                  ? patchOwnShare(calendar, { visible: !calendar.is_visible })
                  : patch(calendar, { is_visible: !calendar.is_visible })
              }
            />
            <span className="calendar-name">
              {calendar.name}
              {calendar.effective_role &&
                calendar.effective_role !== 'owner' && (
                  <small> · {calendar.effective_role}</small>
                )}
            </span>
            <button
              type="button"
              className="calendar-menu-btn"
              aria-label={`${calendar.name} options`}
              aria-haspopup="dialog"
              aria-expanded={menuFor === calendar.id}
              onPointerDown={(pointer) => startReorder(pointer, calendar)}
              onPointerMove={moveReorder}
              onPointerUp={finishReorder}
              onPointerCancel={cancelReorder}
              onClick={(event) => {
                if (suppressMenuClickRef.current === calendar.id) {
                  suppressMenuClickRef.current = null
                  return
                }
                menuAnchorRef.current = event.currentTarget.parentElement
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
            {menuFor === calendar.id &&
              calendar.effective_role !== 'viewer' &&
              calendar.effective_role !== 'editor' && (
                <Popover
                  anchorRef={menuAnchorRef}
                  open
                  onClose={() => setMenuFor(null)}
                  className="cal-card calendar-menu"
                  role="dialog"
                  ariaLabel={`Edit ${calendar.name}`}
                >
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
                    <ShareManager
                      resource="calendars"
                      resourceId={calendar.id}
                      collaborators={calendar.collaborators ?? []}
                      owner
                      ownerEmail={calendar.owner_email}
                      onChanged={onChanged}
                    />
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
                </Popover>
              )}
            {menuFor === calendar.id &&
              (calendar.effective_role === 'viewer' ||
                calendar.effective_role === 'editor') && (
                <Popover
                  anchorRef={menuAnchorRef}
                  open
                  onClose={() => setMenuFor(null)}
                  className="cal-card calendar-menu"
                  role="dialog"
                  ariaLabel={`${calendar.name} options`}
                >
                  <div className="cal-card-head">
                    <h3>Shared calendar</h3>
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
                  <ColorField
                    value={calendar.color}
                    onChange={(c) => patchOwnShare(calendar, { color: c })}
                  />
                  <div className="cal-card-actions">
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void leaveCalendar(calendar)}
                    >
                      Leave
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setMenuFor(null)}
                    >
                      Done
                    </button>
                  </div>
                </Popover>
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
          onClick={() => navigate('/settings/calendar')}
        >
          <span className="integration-icon" aria-hidden="true">
            G
          </span>
          <span className="integration-label">Others?</span>
          <span className="integration-status">Set up</span>
        </button>
      </div>
    </SidebarShell>
  )
}
