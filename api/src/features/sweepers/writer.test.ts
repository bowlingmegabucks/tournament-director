import { describe, expect, it } from 'vitest'
import type { NewSweeper } from './createRequest.ts'
import { pinRows, toCreatedSweeper } from './writer.ts'

const input = (bonusPins: Record<string, number>): NewSweeper => ({
  date: '2026-10-24T18:00:00',
  startingLane: 1,
  numberOfLanes: 24,
  maxPerPair: 4,
  entryFee: 20,
  games: 3,
  cashRatio: 5,
  bonusPins,
})

describe('pinRows', () => {
  it('keeps the divisions with pins other than 0, and drops 0 (SQD-13, D-176)', () => {
    expect(pinRows(input({ a: 10, b: 0, c: 6 }))).toEqual([
      { divisionId: 'a', bonusPinsPerGame: 10 },
      { divisionId: 'c', bonusPinsPerGame: 6 },
    ])
  })

  it('is empty when no division has pins', () => {
    expect(pinRows(input({}))).toEqual([])
    expect(pinRows(input({ a: 0 }))).toEqual([])
  })
})

describe('toCreatedSweeper', () => {
  const divisions = [
    { id: 'w', name: 'Women', number: 2 },
    { id: 'o', name: 'Open', number: 1 },
    { id: 's2', name: 'Seniors', number: 3 },
    { id: 's1', name: 'Abled', number: 3 },
  ]

  it('lists the nonzero pins in division order, then by name (D-45, D-176)', () => {
    const sweeper = toCreatedSweeper('id-1', input({ w: 6, o: 10, s2: 4, s1: 3 }), divisions)

    expect(sweeper.bonusPins.map((pins) => [pins.divisionName, pins.bonusPinsPerGame])).toEqual([
      ['Open', 10],
      ['Women', 6],
      ['Abled', 3],
      ['Seniors', 4],
    ])
  })

  it('leaves out a division with 0 pins or none named', () => {
    const sweeper = toCreatedSweeper('id-1', input({ o: 0, w: 6 }), divisions)

    expect(sweeper.bonusPins).toEqual([
      { divisionId: 'w', divisionName: 'Women', bonusPinsPerGame: 6 },
    ])
  })

  it('is open and carries its own fee, games, and cash ratio (SQD-07, D-43)', () => {
    expect(toCreatedSweeper('id-1', input({}), [])).toEqual({
      id: 'id-1',
      date: '2026-10-24T18:00:00',
      complete: false,
      startingLane: 1,
      numberOfLanes: 24,
      maxPerPair: 4,
      entryFee: 20,
      games: 3,
      cashRatio: 5,
      bonusPins: [],
    })
  })
})
