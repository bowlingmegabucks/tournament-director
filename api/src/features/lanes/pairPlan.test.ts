import { describe, expect, it } from 'vitest'
import { planPairChange, type PairFacts, type PairRequest } from './pairPlan.ts'

function facts(overrides: Partial<PairFacts> = {}): PairFacts {
  return {
    kind: 'squad',
    tournamentComplete: false,
    sessionComplete: false,
    startingLane: 1,
    numberOfLanes: 7,
    outOfPlay: [],
    entries: [],
    ...overrides,
  }
}

const request = (overrides: Partial<PairRequest> = {}): PairRequest => ({
  lane: 1,
  inPlay: false,
  confirmWarnings: false,
  ...overrides,
})

const seated = (...positions: string[]) =>
  positions.map((position) => ({ registrationId: `id-${position}`, position }))

describe('planPairChange', () => {
  it('takes an empty pair out at once (OOP-03, OOP-04)', () => {
    expect(planPairChange(facts(), request())).toEqual({ type: 'save', unassign: [] })
  })

  it.each([
    [['1A'], '1 bowler on lanes 1-2 will move to unassigned.'],
    [['1A', '2C'], '2 bowlers on lanes 1-2 will move to unassigned.'],
  ])('asks first when bowlers are on the pair: %j (OOP-04)', (positions, message) => {
    expect(planPairChange(facts({ entries: seated(...positions) }), request())).toEqual({
      type: 'confirm',
      message,
    })
  })

  it('names a one-lane pair in the question (OOP-04)', () => {
    expect(planPairChange(facts({ entries: seated('7A') }), request({ lane: 7 }))).toEqual({
      type: 'confirm',
      message: '1 bowler on lane 7 will move to unassigned.',
    })
  })

  it('unassigns only the bowlers on that pair once confirmed (OOP-03)', () => {
    const entries = [...seated('1A', '2C', '3A', 'old'), { registrationId: 'none', position: '' }]

    expect(planPairChange(facts({ entries }), request({ confirmWarnings: true }))).toEqual({
      type: 'save',
      unassign: ['id-1A', 'id-2C'],
    })
  })

  it('asks again when someone the caller was not shown is on the pair (OOP-04)', () => {
    const entries = seated('1A', '2C')

    expect(
      planPairChange(facts({ entries }), request({ confirmWarnings: true, seen: ['id-1A'] })).type,
    ).toBe('confirm')
    expect(
      planPairChange(
        facts({ entries }),
        request({ confirmWarnings: true, seen: ['id-2C', 'id-1A', 'gone'] }),
      ),
    ).toEqual({ type: 'save', unassign: ['id-1A', 'id-2C'] })
  })

  it('does not ask again about an entry the lane page hides (OOP-04)', () => {
    const [shown, hidden] = seated('1A', '2C')
    if (!shown || !hidden) throw new Error('no entries')
    const entries = [shown, { ...hidden, hidden: true }]

    expect(
      planPairChange(facts({ entries }), request({ confirmWarnings: true, seen: ['id-1A'] })),
    ).toEqual({ type: 'save', unassign: ['id-1A', 'id-2C'] })
    expect(planPairChange(facts({ entries }), request()).type).toBe('confirm')
  })

  it('brings a pair back and moves no one (OOP-05)', () => {
    expect(
      planPairChange(facts({ outOfPlay: [1], entries: seated('1A') }), request({ inPlay: true })),
    ).toEqual({ type: 'save', unassign: [] })
  })

  it.each([
    ['out and asked out', [1], false],
    ['in and asked in', [], true],
  ])('writes nothing for a pair already as asked: %s', (_name, outOfPlay, inPlay) => {
    expect(planPairChange(facts({ outOfPlay }), request({ inPlay }))).toEqual({
      type: 'unchanged',
    })
  })

  it.each([
    [{ tournamentComplete: true }, 'This tournament is complete. Lanes cannot change.'],
    [{ sessionComplete: true }, 'This squad is complete. Lanes cannot change.'],
  ])('refuses %j (OOP-06)', (complete, message) => {
    expect(planPairChange(facts(complete), request())).toEqual({ type: 'refused', message })
  })

  it('refuses a lane that starts no pair', () => {
    expect(planPairChange(facts({ kind: 'sweeper' }), request({ lane: 2 }))).toEqual({
      type: 'badLane',
      message: 'Lane 2 is not the first lane of a pair in this sweeper',
    })
  })
})
