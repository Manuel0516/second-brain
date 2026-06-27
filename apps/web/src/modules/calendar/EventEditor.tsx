import { useEffect, useState } from 'react'
import { apiCall } from '../../lib/api'
import type { CalendarData, CalendarEvent } from './types'

interface Props {
  calendars: CalendarData[]
  event: Partial<CalendarEvent>
  onClose: () => void
  onSaved: () => void
  onDraftChange?: (event: Partial<CalendarEvent>) => void
}

function localValue(value: string) {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function EventEditor({
  calendars,
  event,
  onClose,
  onSaved,
  onDraftChange,
}: Props) {
  const [form, setForm] = useState({
    title: event.title ?? '',
    calendar_id: event.calendar_id ?? calendars[0]?.id ?? '',
    start_at: localValue(event.start_at ?? ''),
    end_at: localValue(event.end_at ?? event.start_at ?? ''),
    all_day: event.all_day ?? false,
    color_override: event.color_override ?? '',
    rrule: event.rrule ?? '',
    location: event.location ?? '',
    link: event.link ?? '',
    reminder_minutes: event.reminder_minutes?.toString() ?? '',
    description: event.description ?? '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose])

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }))

  const selectedCalendarId = form.calendar_id || calendars[0]?.id || ''

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
      color_override: form.color_override || undefined,
      location: form.location || undefined,
      link: form.link || undefined,
      description: form.description || undefined,
      reminder_minutes: form.reminder_minutes
        ? Number(form.reminder_minutes)
        : undefined,
      rrule:
        form.rrule === 'DAILY' ||
        form.rrule === 'WEEKLY' ||
        form.rrule === 'MONTHLY'
          ? form.rrule
          : undefined,
    })
  }, [event, form, onDraftChange, selectedCalendarId])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!selectedCalendarId) {
      setError('Create or select a calendar before saving this event.')
      return
    }
    if (!form.title.trim()) {
      setError('Add an event title.')
      return
    }
    const start = new Date(form.start_at)
    const end = new Date(form.end_at)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError('Choose a valid start and end time.')
      return
    }
    if (end <= start) {
      setError('The end time must be after the start time.')
      return
    }
    setSaving(true)
    const body = {
      ...form,
      calendar_id: selectedCalendarId,
      title: form.title.trim(),
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      color_override: form.color_override || null,
      rrule: form.rrule || null,
      location: form.location || null,
      link: form.link || null,
      reminder_minutes: form.reminder_minutes
        ? Number(form.reminder_minutes)
        : null,
      description: form.description || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
    const response = await apiCall(
      event.id ? `/api/events/${event.id}` : '/api/events',
      {
        method: event.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    if (response.ok) onSaved()
    else {
      const data = await response.json().catch(() => ({}))
      setError(
        typeof data.detail === 'string'
          ? data.detail
          : 'Could not save the event.',
      )
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!event.id || !window.confirm('Delete this event or repeating series?'))
      return
    const response = await apiCall(`/api/events/${event.id}`, {
      method: 'DELETE',
    })
    if (response.ok) onSaved()
    else setError('Could not delete the event.')
  }

  return (
    <div
      className="calendar-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <aside
        className="event-editor"
        aria-label={event.id ? 'Edit event' : 'New event'}
      >
        <header>
          <h2>{event.id ? 'Edit event' : 'New event'}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <form onSubmit={save}>
          <label>
            Title
            <input
              required
              placeholder="Event title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </label>
          <label>
            Calendar
            <select
              required
              value={selectedCalendarId}
              onChange={(e) => set('calendar_id', e.target.value)}
            >
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              Starts
              <input
                required
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => set('start_at', e.target.value)}
              />
            </label>
            <label>
              Ends
              <input
                required
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => set('end_at', e.target.value)}
              />
            </label>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={(e) => set('all_day', e.target.checked)}
            />{' '}
            All day
          </label>
          <div className="form-row">
            <label>
              Repeats
              <select
                value={form.rrule}
                onChange={(e) => set('rrule', e.target.value)}
              >
                <option value="">Never</option>
                <option value="DAILY">Every day</option>
                <option value="WEEKLY">Every week</option>
                <option value="MONTHLY">Every month</option>
              </select>
            </label>
            <label>
              Event color
              <input
                type="color"
                value={form.color_override || '#3B6FE0'}
                onChange={(e) => set('color_override', e.target.value)}
              />
            </label>
          </div>
          <label>
            Location
            <input
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
          <label>
            Reminder
            <select
              value={form.reminder_minutes}
              onChange={(e) => set('reminder_minutes', e.target.value)}
            >
              <option value="">None</option>
              <option value="5">5 minutes before</option>
              <option value="15">15 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
          </label>
          <label>
            Notes
            <textarea
              rows={5}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            {event.id && (
              <button className="danger" type="button" onClick={remove}>
                Delete
              </button>
            )}
            <span />
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  )
}
