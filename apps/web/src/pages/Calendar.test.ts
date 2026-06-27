import { describe, expect, it } from 'vitest'

import { daysOf, startOfWeekMonday } from '../modules/calendar/time'

describe('daysOf', () => {
  it('starts a seven-day range on the cursor rather than forcing Monday', () => {
    const cursor = new Date(2026, 5, 27, 15, 30)
    const days = daysOf('week', cursor)

    expect(days).toHaveLength(7)
    expect(days[0].getDate()).toBe(27)
    expect(days[6].getDate()).toBe(3)
    expect(days.every((day) => day.getHours() === 0)).toBe(true)
  })
})

describe('startOfWeekMonday', () => {
  it('restores Today to Monday of the current week', () => {
    const monday = startOfWeekMonday(new Date(2026, 5, 27, 15, 30))

    expect(monday.getDay()).toBe(1)
    expect(monday.getDate()).toBe(22)
    expect(monday.getHours()).toBe(0)
  })
})
