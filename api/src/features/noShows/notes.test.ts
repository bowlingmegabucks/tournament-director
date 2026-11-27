import { describe, expect, it } from 'vitest'
import { shortSessionTime, systemNote } from './notes.ts'

describe('shortSessionTime', () => {
  it.each([
    ['2026-11-26T08:00:00', '11/26 8:00 AM'],
    ['2026-01-05T00:30:00', '1/5 12:30 AM'],
    ['2026-11-26T12:00:00', '11/26 12:00 PM'],
    ['2026-11-26T18:05:00', '11/26 6:05 PM'],
  ])('writes %s as %s', (stored, text) => {
    expect(shortSessionTime(stored)).toBe(text)
  })
})

describe('systemNote (NSH-11)', () => {
  it('says who moved, from and to', () => {
    expect(systemNote('Maria Chen', '2026-11-26T08:00:00', '2026-11-27T08:00:00')).toBe(
      'Maria Chen moved from the 11/26 8:00 AM squad to the 11/27 8:00 AM squad after completion.',
    )
  })

  it('says who was refunded', () => {
    expect(systemNote('Maria Chen', '2026-11-26T08:00:00', null)).toBe(
      'Maria Chen refunded from the 11/26 8:00 AM squad after completion.',
    )
  })

  it('fits the 200 characters a note holds', () => {
    expect(systemNote('x'.repeat(300), '2026-11-26T08:00:00', null)).toHaveLength(200)
  })
})
