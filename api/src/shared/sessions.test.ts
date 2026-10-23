import { describe, expect, it } from 'vitest'
import { compareSessions, localDateTime, localDateTimeSchema, toNumber } from './sessions.ts'

describe('localDateTime', () => {
  it('keeps the stored wall-clock time and drops the zone (API-04)', () => {
    expect(localDateTime(new Date('2026-10-24T09:05:00.000Z'))).toBe('2026-10-24T09:05:00')
  })

  it('gives undefined for an unreadable date', () => {
    expect(localDateTime(new Date('nonsense'))).toBeUndefined()
  })
})

describe('localDateTimeSchema', () => {
  it.each(['2026-10-24T09:00:00'])('accepts %s', (value) => {
    expect(localDateTimeSchema.safeParse(value).success).toBe(true)
  })

  it.each(['2026-10-24', '2026-10-24T09:00:00Z', '2026-10-24 09:00:00', 'x2026-10-24T09:00:00'])(
    'rejects %s',
    (value) => {
      expect(localDateTimeSchema.safeParse(value).success).toBe(false)
    },
  )
})

describe('compareSessions', () => {
  const base = { date: '2026-10-24T09:00:00', startingLane: 1, id: 'b' }

  it('orders by date first (SQD-20)', () => {
    const later = { ...base, date: '2026-10-24T13:00:00', startingLane: 1, id: 'a' }
    expect(compareSessions(base, later)).toBeLessThan(0)
    expect(compareSessions(later, base)).toBeGreaterThan(0)
  })

  it('breaks a date tie by starting lane (SQD-20, D-45)', () => {
    const higher = { ...base, startingLane: 13, id: 'a' }
    expect(compareSessions(base, higher)).toBeLessThan(0)
    expect(compareSessions(higher, base)).toBeGreaterThan(0)
  })

  it('breaks a lane tie by id (SQD-20, D-45)', () => {
    const lower = { ...base, id: 'a' }
    expect(compareSessions(lower, base)).toBeLessThan(0)
    expect(compareSessions(base, lower)).toBeGreaterThan(0)
  })

  it('treats the same session as equal', () => {
    expect(compareSessions(base, { ...base })).toBe(0)
  })
})

describe('toNumber', () => {
  it('reads a decimal and passes NULL through', () => {
    expect(toNumber({ toNumber: () => 7.5 })).toBe(7.5)
    expect(toNumber(null)).toBeNull()
  })
})
