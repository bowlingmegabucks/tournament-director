import { describe, expect, it } from 'vitest'
import { createDivision, createLaneEntry } from '../../test/factories.ts'
import { countUnverifiedBowlers } from './unverifiedCount.ts'

const handicap = createDivision({ handicapBase: 220, handicapPercentage: 90 })
const scratch = createDivision()
const entry = (divisionId: string, averageStatus: 'unverified' | 'verified' | 'adjusted') =>
  createLaneEntry({ divisionId, averageStatus })
const scoreOf = (bowlerId: string) => ({ bowlerId, game: 1, score: 200 })

describe('countUnverifiedBowlers (AVG-18, D-297)', () => {
  it('counts handicap bowlers with a score and an unchecked average', () => {
    const a = entry(handicap.id, 'unverified')
    const b = entry(handicap.id, 'unverified')
    expect(
      countUnverifiedBowlers([a, b], [scoreOf(a.bowlerId), scoreOf(b.bowlerId)], [handicap]),
    ).toBe(2)
  })

  it('leaves out a bowler with no score yet', () => {
    expect(countUnverifiedBowlers([entry(handicap.id, 'unverified')], [], [handicap])).toBe(0)
  })

  it.each(['verified', 'adjusted'] as const)('leaves out a %s average', (status) => {
    const bowler = entry(handicap.id, status)
    expect(countUnverifiedBowlers([bowler], [scoreOf(bowler.bowlerId)], [handicap])).toBe(0)
  })

  it('leaves out a bowler in a scratch division', () => {
    const bowler = entry(scratch.id, 'unverified')
    expect(countUnverifiedBowlers([bowler], [scoreOf(bowler.bowlerId)], [scratch])).toBe(0)
  })

  it('leaves out a bowler whose division is unknown', () => {
    const bowler = entry(handicap.id, 'unverified')
    expect(countUnverifiedBowlers([bowler], [scoreOf(bowler.bowlerId)], [])).toBe(0)
  })
})
