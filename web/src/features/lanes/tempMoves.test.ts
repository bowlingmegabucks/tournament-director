import { describe, expect, it } from 'vitest'
import { createLaneBowler, createLanePage, createLanePair } from '../../mocks/data'
import { applyMoves, planMove, type Move } from './tempMoves'

const at = (position: string, name = position) => createLaneBowler({ name, position })

describe('planMove (D-56, D-57, temporary)', () => {
  const waiting = createLaneBowler()

  it('puts the first bowler on A of the first lane', () => {
    expect(planMove(waiting, createLanePair(1))).toEqual({ firstLane: 1, position: '1A' })
  })

  it.each([
    [['1A'], '2C'],
    [['1A', '2C'], '1B'],
    [['1A', '1B', '2C'], '2D'],
    [['1A', '1B', '2C', '2D'], '2E'],
  ])('with %j taken the next seat is %s (D-56)', (taken, expected) => {
    const pair = createLanePair(
      1,
      taken.map((position) => at(position)),
    )

    expect(planMove(waiting, pair).position).toBe(expected)
  })

  it('takes the freed seat and renumbers no one (D-56)', () => {
    const pair = createLanePair(1, [at('1A'), at('1B')])

    expect(planMove(waiting, pair).position).toBe('2C')
  })

  it('works out the lanes from the pair (D-56)', () => {
    const pair = createLanePair(11, [at('11A')])

    expect(planMove(waiting, pair)).toEqual({ firstLane: 11, position: '12C' })
  })

  it('counts a legacy letter in the pair as taken (D-61)', () => {
    expect(planMove(waiting, createLanePair(1, [at('2B')])).position).toBe('1A')
    expect(planMove(waiting, createLanePair(1, [at('1A'), at('2B')])).position).toBe('2C')
  })

  it('does not take a seat from the bowler who is already in the pair', () => {
    const mover = at('2C')

    expect(planMove(mover, createLanePair(1, [at('1A'), mover])).position).toBe('2C')
  })

  it('puts every seat on the one lane of a one-lane pair', () => {
    const pair = { firstLane: 5, lanes: [5], capacity: 5, bowlers: [at('5A')] }

    expect(planMove(waiting, pair)).toEqual({ firstLane: 5, position: '5C' })
  })

  it('clears the lane for unassigned (D-57)', () => {
    expect(planMove(at('1A'), 'unassigned')).toEqual({ firstLane: null, position: '' })
  })
})

describe('applyMoves', () => {
  const pat = createLaneBowler({ name: 'Pat Nguyen' })
  const carl = createLaneBowler({ name: 'Carl Dubois' })
  const joe = at('1A', 'Joe Fontaine')
  const dana = at('2C', 'Dana Abbott')
  const tom = at('3A', 'Tom Delgado')
  const lost = at('31A', 'Hal Dixon')
  const page = createLanePage({
    pairs: [createLanePair(1, [joe, dana]), createLanePair(3, [tom]), createLanePair(5)],
    unassigned: [carl, pat],
    other: [lost],
  })
  const none = new Map<string, Move>()

  it('gives back the same page when nothing moved', () => {
    expect(applyMoves(page, none)).toBe(page)
  })

  it('moves an unassigned bowler into a pair, sorted lane then letter (LAN-04)', () => {
    const moves = new Map([[pat.registrationId, { firstLane: 3, position: '3B' }]])

    const result = applyMoves(page, moves)

    expect(result.pairs[1]?.bowlers.map((bowler) => bowler.name)).toEqual([
      'Tom Delgado',
      'Pat Nguyen',
    ])
    expect(result.pairs[1]?.bowlers[1]?.position).toBe('3B')
    expect(result.unassigned.map((bowler) => bowler.name)).toEqual(['Carl Dubois'])
  })

  it('sorts a bowler between the ones already in the pair', () => {
    const moves = new Map([[pat.registrationId, { firstLane: 1, position: '1B' }]])

    const result = applyMoves(page, moves)

    expect(result.pairs[0]?.bowlers.map((bowler) => bowler.position)).toEqual(['1A', '1B', '2C'])
  })

  it('puts a lower letter before a higher one on the same lane (LAN-04)', () => {
    const lone = createLanePage({
      pairs: [createLanePair(1, [at('1B', 'Bea')])],
      unassigned: [pat],
    })

    const result = applyMoves(
      lone,
      new Map([[pat.registrationId, { firstLane: 1, position: '1A' }]]),
    )

    expect(result.pairs[0]?.bowlers.map((bowler) => bowler.position)).toEqual(['1A', '1B'])
  })

  it('moves a bowler from one pair to another and frees the old seat', () => {
    const moves = new Map([[joe.registrationId, { firstLane: 5, position: '5A' }]])

    const result = applyMoves(page, moves)

    expect(result.pairs[0]?.bowlers.map((bowler) => bowler.name)).toEqual(['Dana Abbott'])
    expect(result.pairs[2]?.bowlers.map((bowler) => bowler.position)).toEqual(['5A'])
  })

  it('moves a bowler back to unassigned, sorted by last name, then first (D-58)', () => {
    const moves = new Map([[joe.registrationId, { firstLane: null, position: '' }]])

    const result = applyMoves(page, moves)

    expect(result.unassigned.map((bowler) => bowler.name)).toEqual([
      'Carl Dubois',
      'Joe Fontaine',
      'Pat Nguyen',
    ])
    expect(result.unassigned[1]?.position).toBe('')
    expect(result.pairs[0]?.bowlers.map((bowler) => bowler.name)).toEqual(['Dana Abbott'])
  })

  it('sorts a returning bowler by first name when the last names match', () => {
    const amy = createLaneBowler({ firstName: 'Amy', lastName: 'Dubois', position: '1B' })
    const zed = createLaneBowler({ firstName: 'Zed', lastName: 'Dubois' })
    const same = createLanePage({
      pairs: [createLanePair(1, [amy])],
      unassigned: [zed, createLaneBowler({ firstName: 'Bo', lastName: 'Adams' })],
    })

    const result = applyMoves(
      same,
      new Map([[amy.registrationId, { firstLane: null, position: '' }]]),
    )

    expect(result.unassigned.map((bowler) => bowler.firstName)).toEqual(['Bo', 'Amy', 'Zed'])
  })

  it('sorts last names without regard to case, then by registration id', () => {
    const lower = createLaneBowler({
      firstName: 'Al',
      lastName: 'adams',
      registrationId: 'b',
      position: '1B',
    })
    const upper = createLaneBowler({ firstName: 'Al', lastName: 'Adams', registrationId: 'a' })
    const tie = createLanePage({ pairs: [createLanePair(1, [lower])], unassigned: [upper] })

    const result = applyMoves(
      tie,
      new Map([[lower.registrationId, { firstLane: null, position: '' }]]),
    )

    expect(result.unassigned.map((bowler) => bowler.registrationId)).toEqual(['a', 'b'])
  })

  it('applies several moves and leaves the other positions alone', () => {
    const moves = new Map<string, Move>([
      [pat.registrationId, { firstLane: 5, position: '5A' }],
      [carl.registrationId, { firstLane: 5, position: '6C' }],
    ])

    const result = applyMoves(page, moves)

    expect(result.pairs[2]?.bowlers.map((bowler) => bowler.name)).toEqual([
      'Pat Nguyen',
      'Carl Dubois',
    ])
    expect(result.unassigned).toEqual([])
    expect(result.other).toEqual([lost])
  })

  it('does not change the page it was given', () => {
    const before = structuredClone(page)

    applyMoves(page, new Map([[pat.registrationId, { firstLane: 3, position: '3B' }]]))

    expect(page).toEqual(before)
  })
})
