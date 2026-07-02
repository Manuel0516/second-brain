import { useState } from 'react'
import { Dropdown } from '../../../components/Dropdown'
import { recordValue } from './filters'
import type { DatabaseProperty, Page, ViewConfig } from '../types'

interface CalendarViewProps {
  properties: DatabaseProperty[]
  records: Page[]
  config: ViewConfig & { date_by?: string }
  onOpenRecord: (id: string) => void
  onDateBy: (propertyId: string) => void
}

const pad = (value: number) => String(value).padStart(2, '0')
const keyOf = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** Month grid mapping a date property. Records show as chips on their day. */
export function CalendarView({
  properties,
  records,
  config,
  onOpenRecord,
  onDateBy,
}: CalendarViewProps) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const dateProps = properties.filter((property) => property.type === 'date')
  const dateProperty =
    dateProps.find((property) => property.id === config.date_by) ?? dateProps[0]

  if (!dateProperty) {
    return (
      <p className="notes-board-hint">
        Add a date property to place records on the calendar.
      </p>
    )
  }

  const byDay = new Map<string, Page[]>()
  for (const record of records) {
    const value = recordValue(record, dateProperty.id)
    if (typeof value !== 'string' || !value) continue
    byDay.set(value, [...(byDay.get(value) ?? []), record])
  }

  // Weeks start on Monday, like the calendar module.
  const firstWeekday = (cursor.getDay() + 6) % 7
  const start = new Date(cursor)
  start.setDate(1 - firstWeekday)
  const todayKey = keyOf(new Date())
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })

  return (
    <div className="notes-dbcal">
      <div className="notes-dbcal-nav">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
          }
        >
          ‹
        </button>
        <strong>
          {cursor.toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          })}
        </strong>
        <button
          type="button"
          aria-label="Next month"
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
          }
        >
          ›
        </button>
        {dateProps.length > 1 && (
          <Dropdown
            ariaLabel="Date property"
            value={dateProperty.id}
            onChange={(value) => onDateBy(value)}
            options={dateProps.map((property) => ({
              value: property.id,
              label: property.name,
            }))}
          />
        )}
      </div>
      <div className="notes-dbcal-grid" role="grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => (
          <span key={name} className="notes-dbcal-head">
            {name}
          </span>
        ))}
        {cells.map((day) => {
          const key = keyOf(day)
          const inMonth = day.getMonth() === cursor.getMonth()
          return (
            <div
              key={key}
              role="gridcell"
              className={`notes-dbcal-day${inMonth ? '' : ' outside'}${
                key === todayKey ? ' today' : ''
              }`}
            >
              <span className="notes-dbcal-date">{day.getDate()}</span>
              {(byDay.get(key) ?? []).map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className="notes-dbcal-chip"
                  onClick={() => onOpenRecord(record.id)}
                >
                  {record.icon && (
                    <span aria-hidden="true">{record.icon} </span>
                  )}
                  {record.title || 'Untitled'}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
