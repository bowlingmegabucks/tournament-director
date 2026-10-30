import { describe, expect, it } from 'vitest'
import { formatHandicap, formatHandicapTotal, formatSheetDate, formatSheetTime } from './format'

describe('formatSheetDate (RPT-05)', () => {
  it('writes month, day, and year, with no time zone shift', () => {
    expect(formatSheetDate('2026-10-24T23:30:00')).toBe('10/24/2026')
  })

  it('leaves text that is not a session date as it is', () => {
    expect(formatSheetDate('soon')).toBe('soon')
  })
})

describe('formatSheetTime (RPT-05)', () => {
  it.each([
    ['2026-10-24T09:00:00', '09:00 AM'],
    ['2026-10-24T19:05:00', '07:05 PM'],
    ['2026-10-24T00:30:00', '12:30 AM'],
    ['2026-10-24T12:00:00', '12:00 PM'],
    ['2026-10-24T11:59:00', '11:59 AM'],
  ])('writes %s as %s', (value, expected) => {
    expect(formatSheetTime(value)).toBe(expected)
  })

  it('leaves text that is not a session date as it is', () => {
    expect(formatSheetTime('soon')).toBe('soon')
  })
})

describe('formatHandicap (RPT-05a)', () => {
  it.each([
    [47, '47'],
    [1, '1'],
    [0, '-'],
    [-3, '-'],
  ])('shows %i as %s', (handicap, expected) => {
    expect(formatHandicap(handicap)).toBe(expected)
  })
})

describe('formatHandicapTotal (RPT-05a)', () => {
  it('multiplies the handicap by the games', () => {
    expect(formatHandicapTotal(47, 6)).toBe('282')
  })

  it('shows a dash when the handicap is 0 or less', () => {
    expect(formatHandicapTotal(0, 6)).toBe('-')
    expect(formatHandicapTotal(-2, 6)).toBe('-')
  })
})
