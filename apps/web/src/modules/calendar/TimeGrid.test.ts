import { describe, expect, it } from 'vitest'

import {
  clampRowHeight,
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
  it('maps the pointer to a precise minute and clamps it to the day', () => {
    expect(minuteAtPointer(24, 0, 48)).toBe(30)
    expect(minuteAtPointer(48 + 12, 0, 48)).toBe(75)
    expect(minuteAtPointer(-10, 0, 48)).toBe(0)
    expect(minuteAtPointer(24 * 48 + 10, 0, 48)).toBe(1439)
  })
})

describe('clampRowHeight', () => {
  it('keeps the row height within the zoom bounds', () => {
    expect(clampRowHeight(10)).toBe(28)
    expect(clampRowHeight(48)).toBe(48)
    expect(clampRowHeight(500)).toBe(110)
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
