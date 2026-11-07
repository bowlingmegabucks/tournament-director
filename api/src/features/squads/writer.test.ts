import { describe, expect, it } from 'vitest'
import type { NewSquad } from './createRequest.ts'
import { toCreatedSquad } from './writer.ts'

const defaults = { entryFee: 50, finalsRatio: 6, cashRatio: 4, games: 5 }

const input = (overrides: Partial<NewSquad> = {}): NewSquad => ({
  date: '2026-10-24T09:00:00',
  startingLane: 1,
  numberOfLanes: 24,
  maxPerPair: 4,
  entryFee: null,
  finalsRatio: null,
  cashRatio: null,
  ...overrides,
})

describe('toCreatedSquad', () => {
  it('shows the tournament values with the override flags false when the input leaves them blank (TRN-12, D-43)', () => {
    expect(toCreatedSquad('id-1', input(), defaults)).toEqual({
      id: 'id-1',
      date: '2026-10-24T09:00:00',
      complete: false,
      startingLane: 1,
      numberOfLanes: 24,
      maxPerPair: 4,
      entryFee: 50,
      entryFeeOverridden: false,
      finalsRatio: 6,
      finalsRatioOverridden: false,
      cashRatio: 4,
      cashRatioOverridden: false,
      games: 5,
    })
  })

  it('keeps each value the input sets and flags only that one (SQD-07)', () => {
    const squad = toCreatedSquad('id-2', input({ entryFee: 75, cashRatio: 0 }), defaults)

    expect(squad).toMatchObject({
      entryFee: 75,
      entryFeeOverridden: true,
      finalsRatio: 6,
      finalsRatioOverridden: false,
      cashRatio: 0,
      cashRatioOverridden: true,
      complete: false,
    })
  })
})
