import { describe, expect, it } from 'vitest'
import { planLaneMove, type MoveFacts } from './movePlan.ts'

const mine = 'a0000000-0000-4000-8000-000000000001'

function facts(overrides: Partial<MoveFacts> = {}): MoveFacts {
  return {
    kind: 'squad',
    tournamentComplete: false,
    sessionComplete: false,
    startingLane: 1,
    numberOfLanes: 8,
    maxPerPair: 4,
    entries: [{ registrationId: mine, position: '' }],
    ...overrides,
  }
}

const others = (...positions: string[]) =>
  positions.map((position, index) => ({
    registrationId: `b0000000-0000-4000-8000-00000000000${index}`,
    position,
  }))

describe('planLaneMove', () => {
  it('refuses a registration not on the session (LAN-05)', () => {
    expect(planLaneMove(facts(), 'c0000000-0000-4000-8000-000000000009', 1)).toEqual({
      type: 'notOnSession',
    })
  })

  it('checks the entry before the pair, so a stranger gets a 404 not a 400 (LAN-05)', () => {
    expect(planLaneMove(facts(), 'c0000000-0000-4000-8000-000000000009', 99).type).toBe(
      'notOnSession',
    )
  })

  it('refuses on a complete session (LAN-13, D-10)', () => {
    expect(planLaneMove(facts({ sessionComplete: true }), mine, 1)).toEqual({
      type: 'refused',
      message: 'This squad is complete. Lanes cannot change.',
    })
  })

  it('says sweeper for a sweeper (LAN-13)', () => {
    expect(planLaneMove(facts({ kind: 'sweeper', sessionComplete: true }), mine, 1)).toEqual({
      type: 'refused',
      message: 'This sweeper is complete. Lanes cannot change.',
    })
  })

  it('refuses on a complete tournament, and says so first (LAN-13, D-130)', () => {
    expect(
      planLaneMove(facts({ tournamentComplete: true, sessionComplete: true }), mine, 1),
    ).toEqual({ type: 'refused', message: 'This tournament is complete. Lanes cannot change.' })
  })

  it('takes seat A of the first lane for the first bowler in a pair (D-56)', () => {
    expect(planLaneMove(facts(), mine, 3)).toEqual({ type: 'move', position: '3A' })
  })

  it('fills the pair in the order A, C, B, D, E (D-56)', () => {
    const seat = (...taken: string[]) =>
      planLaneMove(
        facts({
          maxPerPair: 5,
          entries: [{ registrationId: mine, position: '' }, ...others(...taken)],
        }),
        mine,
        1,
      )
    expect(seat()).toEqual({ type: 'move', position: '1A' })
    expect(seat('1A')).toEqual({ type: 'move', position: '2C' })
    expect(seat('1A', '2C')).toEqual({ type: 'move', position: '1B' })
    expect(seat('1A', '2C', '1B')).toEqual({ type: 'move', position: '2D' })
    expect(seat('1A', '2C', '1B', '2D')).toEqual({ type: 'move', position: '2E' })
  })

  it('gives a freed seat to the next bowler without renumbering anyone (D-56)', () => {
    const result = planLaneMove(
      facts({ entries: [{ registrationId: mine, position: '' }, ...others('1A', '1B')] }),
      mine,
      1,
    )
    expect(result).toEqual({ type: 'move', position: '2C' })
  })

  it('counts a legacy letter as taken (D-61)', () => {
    const result = planLaneMove(
      facts({ entries: [{ registrationId: mine, position: '' }, ...others('2B')] }),
      mine,
      1,
    )
    expect(result).toEqual({ type: 'move', position: '1A' })
    const second = planLaneMove(
      facts({ entries: [{ registrationId: mine, position: '' }, ...others('1A', '2B')] }),
      mine,
      1,
    )
    expect(second).toEqual({ type: 'move', position: '2C' })
  })

  it('refuses a full pair and names it (Q-28, D-57)', () => {
    const result = planLaneMove(
      facts({
        maxPerPair: 2,
        entries: [{ registrationId: mine, position: '' }, ...others('1A', '2C')],
      }),
      mine,
      1,
    )
    expect(result).toEqual({
      type: 'full',
      message: 'Lanes 1-2 are full (2 of 2). Pick another pair.',
    })
  })

  it('treats a legacy pair over its limit as full (D-61)', () => {
    const result = planLaneMove(
      facts({
        maxPerPair: 2,
        entries: [{ registrationId: mine, position: '' }, ...others('1A', '1B', '2C')],
      }),
      mine,
      1,
    )
    expect(result).toMatchObject({ type: 'full' })
  })

  it('names a one-lane pair in the singular (LAN-03)', () => {
    const result = planLaneMove(
      facts({
        numberOfLanes: 3,
        maxPerPair: 2,
        entries: [{ registrationId: mine, position: '' }, ...others('3A', '3B')],
      }),
      mine,
      3,
    )
    expect(result).toEqual({
      type: 'full',
      message: 'Lane 3 is full (2 of 2). Pick another pair.',
    })
  })

  it('seats every letter of a one-lane pair on its only lane (LAN-03)', () => {
    const result = planLaneMove(
      facts({
        numberOfLanes: 3,
        entries: [{ registrationId: mine, position: '' }, ...others('3A')],
      }),
      mine,
      3,
    )
    expect(result).toEqual({ type: 'move', position: '3C' })
  })

  it('changes nothing when the bowler is already in the pair (LAN-06)', () => {
    const result = planLaneMove(
      facts({ entries: [{ registrationId: mine, position: '2C' }, ...others('1A')] }),
      mine,
      1,
    )
    expect(result).toEqual({ type: 'unchanged', position: '2C' })
  })

  it('does not count the bowler against their own pair when it is full (LAN-06)', () => {
    const result = planLaneMove(
      facts({
        maxPerPair: 2,
        entries: [{ registrationId: mine, position: '1A' }, ...others('2C')],
      }),
      mine,
      1,
    )
    expect(result).toEqual({ type: 'unchanged', position: '1A' })
  })

  it('frees the old seat on a move to another pair (D-56)', () => {
    const result = planLaneMove(
      facts({ entries: [{ registrationId: mine, position: '1A' }, ...others('3A')] }),
      mine,
      3,
    )
    expect(result).toEqual({ type: 'move', position: '4C' })
  })

  it('unassigns on a null lane (LAN-09)', () => {
    expect(
      planLaneMove(facts({ entries: [{ registrationId: mine, position: '3A' }] }), mine, null),
    ).toEqual({ type: 'move', position: '' })
  })

  it('changes nothing when an unassigned bowler is unassigned again (LAN-06, LAN-09)', () => {
    expect(planLaneMove(facts(), mine, null)).toEqual({ type: 'unchanged', position: '' })
  })

  it('lets a bowler be unassigned even when the pair size is bad (LAN-09)', () => {
    expect(
      planLaneMove(
        facts({ maxPerPair: 6, entries: [{ registrationId: mine, position: '1A' }] }),
        mine,
        null,
      ),
    ).toEqual({ type: 'move', position: '' })
  })

  it.each([1, 6])('refuses to assign when bowlers per pair is %i (LAN-02)', (maxPerPair) => {
    expect(planLaneMove(facts({ maxPerPair }), mine, 1)).toEqual({
      type: 'badSeats',
      message: 'Bowlers per pair must be 2 to 5 to assign lanes',
    })
  })

  it.each([2, 0, 9, 100])('refuses lane %i: not the first lane of a pair', (lane) => {
    expect(planLaneMove(facts(), mine, lane)).toEqual({
      type: 'badLane',
      message: `Lane ${lane} is not the first lane of a pair in this squad`,
    })
  })

  it('counts a position outside the pair as no one in it (D-61)', () => {
    const result = planLaneMove(
      facts({
        maxPerPair: 2,
        entries: [{ registrationId: mine, position: '' }, ...others('Other', '3A')],
      }),
      mine,
      1,
    )
    expect(result).toEqual({ type: 'move', position: '1A' })
  })

  it('works from a starting lane above 1 (LAN-03)', () => {
    const result = planLaneMove(facts({ startingLane: 11, numberOfLanes: 4 }), mine, 13)
    expect(result).toEqual({ type: 'move', position: '13A' })
  })
})
