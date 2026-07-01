import { describe, expect, it } from 'vitest'

import {
  clampRowHeight,
  eventSegmentForDay,
  minuteAtPointer,
  resizeIsoRange,
  shiftIsoRange,
} from './time'
import { occurrenceKey } from './types'

describe('occurrenceKey', () => {
  it('distinguishes expanded occurrences that share a series id', () => {
    expect(
      occurrenceKey({ id: 'series-1', start_at: '2026-06-27T10:00:00Z' }),
    ).not.toBe(
      occurrenceKey({ id: 'series-1', start_at: '2026-07-04T10:00:00Z' }),
    )
  })
})

describe('minuteAtPointer', () => {
  it('snaps the pointer to the nearest 5 minutes and clamps it to the day', () => {
    expect(minuteAtPointer(24, 0, 48)).toBe(30)
    expect(minuteAtPointer(48 + 12, 0, 48)).toBe(75)
    // 34px → ~42.5 min, snaps to the nearest 5-minute block.
    expect(minuteAtPointer(34, 0, 48)).toBe(45)
    expect(minuteAtPointer(-10, 0, 48)).toBe(0)
    expect(minuteAtPointer(24 * 48 + 10, 0, 48)).toBe(1435)
  })
})

describe('clampRowHeight', () => {
  it('keeps the row height within the zoom bounds', () => {
    expect(clampRowHeight(10)).toBe(28)
    expect(clampRowHeight(48)).toBe(48)
    expect(clampRowHeight(500)).toBe(110)
  })
})

describe('eventSegmentForDay', () => {
  it('splits a cross-midnight event between its two day columns', () => {
    const startAt = new Date(2026, 5, 27, 23).toISOString()
    const endAt = new Date(2026, 5, 28, 2).toISOString()

    expect(eventSegmentForDay(startAt, endAt, new Date(2026, 5, 27))).toEqual({
      start: new Date(2026, 5, 27, 23),
      end: new Date(2026, 5, 28, 0),
    })
    expect(eventSegmentForDay(startAt, endAt, new Date(2026, 5, 28))).toEqual({
      start: new Date(2026, 5, 28, 0),
      end: new Date(2026, 5, 28, 2),
    })
  })

  it('excludes an event from days it does not overlap', () => {
    expect(
      eventSegmentForDay(
        new Date(2026, 5, 27, 23).toISOString(),
        new Date(2026, 5, 28, 2).toISOString(),
        new Date(2026, 5, 29),
      ),
    ).toBeNull()
  })
})

describe('event time transforms', () => {
  it('moves an event while preserving its duration', () => {
    expect(
      shiftIsoRange('2026-06-27T10:00:00.000Z', '2026-06-27T11:30:00.000Z', 90),
    ).toEqual({
      start_at: '2026-06-27T11:30:00.000Z',
      end_at: '2026-06-27T13:00:00.000Z',
    })
  })

  it('resizes an event without allowing a zero duration', () => {
    expect(
      resizeIsoRange(
        '2026-06-27T10:00:00.000Z',
        '2026-06-27T11:00:00.000Z',
        -120,
      ).end_at,
    ).toBe('2026-06-27T10:01:00.000Z')
  })
})
