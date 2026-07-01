// Shared source of truth for the user's saved calendar order (set by dragging
// rows in the sidebar, consumed there and in the event editor's calendar picker).

export const CALENDAR_ORDER_KEY = 'sb-calendar-order'

export function storedCalendarOrder(): string[] {
  try {
    const order = JSON.parse(localStorage.getItem(CALENDAR_ORDER_KEY) ?? '[]')
    return Array.isArray(order)
      ? order.filter((id) => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

// Sort calendars by the saved order; ids missing from the order fall to the end.
export function orderCalendars<T extends { id: string }>(
  calendars: T[],
  order: string[] = storedCalendarOrder(),
): T[] {
  return [...calendars].sort((a, b) => {
    const ai = order.indexOf(a.id)
    const bi = order.indexOf(b.id)
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi)
  })
}
