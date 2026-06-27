const MINUTES_PER_DAY = 24 * 60

export const MIN_ROW_HEIGHT = 28
export const MAX_ROW_HEIGHT = 110
export const DEFAULT_ROW_HEIGHT = 48

export function startOfDay(date: Date) {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  return day
}

export function startOfWeekMonday(date: Date) {
  const start = startOfDay(date)
  const offset = start.getDay() === 0 ? -6 : 1 - start.getDay()
  start.setDate(start.getDate() + offset)
  return start
}

export function daysOf(view: 'day' | 'week' | 'month', cursor: Date) {
  if (view === 'day') return [startOfDay(cursor)]
  const start = startOfDay(cursor)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

export function clampRowHeight(value: number) {
  return Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, value))
}

export function minuteAtPointer(
  clientY: number,
  top: number,
  rowHeight: number,
) {
  return Math.max(
    0,
    Math.min(
      MINUTES_PER_DAY - 1,
      Math.floor(((clientY - top) / rowHeight) * 60),
    ),
  )
}

export function shiftIsoRange(
  startAt: string,
  endAt: string,
  deltaMinutes: number,
) {
  const offset = deltaMinutes * 60_000
  return {
    start_at: new Date(new Date(startAt).getTime() + offset).toISOString(),
    end_at: new Date(new Date(endAt).getTime() + offset).toISOString(),
  }
}

export function resizeIsoRange(
  startAt: string,
  endAt: string,
  deltaMinutes: number,
) {
  const start = new Date(startAt)
  const proposedEnd = new Date(endAt).getTime() + deltaMinutes * 60_000
  return {
    start_at: start.toISOString(),
    end_at: new Date(
      Math.max(start.getTime() + 60_000, proposedEnd),
    ).toISOString(),
  }
}
