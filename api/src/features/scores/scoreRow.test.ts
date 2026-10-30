import { describe, expect, it } from 'vitest'
import { toScoreRow } from './scoreRow.ts'

const bowlerId = '5a9e3c71-8d24-4b6f-9c10-2e7a4f6b8d33'

describe('toScoreRow', () => {
  it('fits a stored score (D-69)', () => {
    expect(toScoreRow({ bowlerId, game: 2, score: 212 })).toMatchObject({
      success: true,
      data: { bowlerId, game: 2, score: 212 },
    })
  })

  it.each([0, 250, 301])(
    'fits a score of %i: entry rules run on save, not on read (SCR-01)',
    (score) => {
      expect(toScoreRow({ bowlerId, game: 1, score }).success).toBe(true)
    },
  )

  it.each([
    ['a game below 1', { game: 0 }],
    ['a negative game', { game: -1 }],
    ['a fractional game', { game: 1.5 }],
    ['a fractional score', { score: 200.5 }],
    ['a bowler id that is not a UUID', { bowlerId: 'nope' }],
  ])('does not fit with %s (D-69)', (_name, overrides) => {
    expect(toScoreRow({ bowlerId, game: 1, score: 200, ...overrides }).success).toBe(false)
  })
})
