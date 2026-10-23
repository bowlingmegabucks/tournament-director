import { describe, expect, it } from 'vitest'
import {
  formatFee,
  formatLanes,
  formatPerPair,
  formatPins,
  formatRatio,
  formatSessionDate,
  withOverride,
} from './sessionFormat'

describe('formatSessionDate', () => {
  it.each([
    ['2026-10-24T09:00:00', 'Sat 10/24/2026 9:00 AM'],
    ['2026-10-24T13:05:00', 'Sat 10/24/2026 1:05 PM'],
    ['2026-10-25T00:30:00', 'Sun 10/25/2026 12:30 AM'],
    ['2026-10-25T12:00:00', 'Sun 10/25/2026 12:00 PM'],
    ['2026-10-25T23:59:00', 'Sun 10/25/2026 11:59 PM'],
  ])('shows %s as %s (SQD-21)', (value, text) => {
    expect(formatSessionDate(value)).toBe(text)
  })

  it('gives the same weekday and clock in any time zone (D-44)', () => {
    // Midnight must stay on its own date, whatever the machine's zone.
    expect(formatSessionDate('2026-01-01T00:00:00')).toBe('Thu 01/01/2026 12:00 AM')
  })

  it('returns text it cannot read as it is', () => {
    expect(formatSessionDate('soon')).toBe('soon')
    expect(formatSessionDate('2026-10-24')).toBe('2026-10-24')
    // A zone or extra text means the API changed; show it as sent rather than guess.
    expect(formatSessionDate('2026-10-24T09:00:00Z')).toBe('2026-10-24T09:00:00Z')
    expect(formatSessionDate('on 2026-10-24T09:00:00')).toBe('on 2026-10-24T09:00:00')
  })
})

describe('formatLanes', () => {
  it('shows the range and the count (SQD-21)', () => {
    expect(formatLanes(1, 24)).toBe('1 to 24 (24 lanes)')
    expect(formatLanes(11, 10)).toBe('11 to 20 (10 lanes)')
    expect(formatLanes(1, 2)).toBe('1 to 2 (2 lanes)')
  })

  it('names a single lane', () => {
    expect(formatLanes(5, 1)).toBe('Lane 5')
  })

  it('says Not set for the legacy default of 0 lanes', () => {
    expect(formatLanes(0, 0)).toBe('Not set')
    expect(formatLanes(1, -2)).toBe('Not set')
  })

  it('says Not set when the first lane is the legacy default of 0, not a range from lane 0', () => {
    expect(formatLanes(0, 24)).toBe('Not set')
    expect(formatLanes(-1, 4)).toBe('Not set')
    expect(formatLanes(1, 24)).toBe('1 to 24 (24 lanes)')
  })
})

describe('other formats', () => {
  it('formats bowlers per pair, fees, and ratios', () => {
    expect(formatPerPair(4)).toBe('Up to 4')
    expect(formatFee(50)).toBe('$50.00')
    expect(formatFee(47.5)).toBe('$47.50')
    expect(formatFee(0)).toBe('$0.00')
    expect(formatRatio(7)).toBe('1 in 7.0')
    expect(formatRatio(4.5)).toBe('1 in 4.5')
  })

  it('signs bonus pins', () => {
    expect(formatPins(10)).toBe('+10')
    expect(formatPins(-5)).toBe('-5')
    expect(formatPins(0)).toBe('0')
  })

  it('marks an override and leaves a default plain (D-43)', () => {
    expect(withOverride('$60.00', true)).toBe('$60.00 (override)')
    expect(withOverride('$50.00', false)).toBe('$50.00')
  })
})
