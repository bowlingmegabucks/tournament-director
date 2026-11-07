import { describe, expect, it } from 'vitest'
import {
  changedFields,
  frozenRefusal,
  inFormOrder,
  laneBlockProblem,
  noSessionEditFacts,
  pairOfLane,
  sessionCompleteMessage,
  sessionRefusals,
  sessionWarnings,
  toSessionEditInfo,
  type SessionEditContext,
} from './sessionEdit.ts'

const context = (
  over: Partial<SessionEditContext> & { facts?: Partial<SessionEditContext['facts']> } = {},
): SessionEditContext => ({
  tournament: { completed: false, startDate: '2026-10-23', endDate: '2026-10-25' },
  complete: false,
  stored: { date: '2026-10-24T09:00:00', startingLane: 1, numberOfLanes: 20, maxPerPair: 4 },
  ...over,
  facts: { ...noSessionEditFacts, ...over.facts },
})

describe('changedFields', () => {
  it('keeps only the fields whose value differs and ignores left-out ones (SQD-23)', () => {
    expect(changedFields({ a: 1, b: 2, c: null }, { a: 1, b: 3, c: 4 })).toEqual({ b: 3, c: 4 })
    expect(changedFields({ a: 1, b: null as number | null }, { b: null })).toEqual({})
  })
  it('counts a cleared override as a change (D-183)', () => {
    expect(changedFields({ fee: 60 as number | null }, { fee: null })).toEqual({ fee: null })
  })
})

describe('frozenRefusal', () => {
  it('refuses a complete tournament first (SQD-24, D-181)', () => {
    const frozen = frozenRefusal(
      context({ tournament: { completed: true, startDate: 'a', endDate: 'b' }, complete: true }),
      'Squad',
    )
    expect(frozen).toEqual({ tournament: 'This tournament is complete and cannot be changed' })
  })
  it('refuses a complete session with its own word (SQD-24, D-181)', () => {
    expect(frozenRefusal(context({ complete: true }), 'Sweeper')).toEqual({
      session: 'This sweeper is complete and cannot be changed',
    })
    expect(sessionCompleteMessage('Squad')).toBe('This squad is complete and cannot be changed')
  })
  it('lets an open session of an open tournament through', () => {
    expect(frozenRefusal(context(), 'Squad')).toBeUndefined()
  })
})

describe('laneBlockProblem', () => {
  it('uses the stored value for a lane field not sent (D-179)', () => {
    const stored = context().stored
    expect(laneBlockProblem(stored, { startingLane: 183 })).toEqual({
      numberOfLanes: 'Lanes must end at lane 200 or lower',
    })
    expect(laneBlockProblem(stored, { numberOfLanes: 200 })).toBeUndefined()
    expect(laneBlockProblem({ ...stored, startingLane: 3 }, { numberOfLanes: 200 })).toBeDefined()
    expect(laneBlockProblem(stored, { startingLane: 181 })).toBeUndefined()
  })
  it('does not look when no lane field changes (D-17)', () => {
    const odd = { ...context().stored, startingLane: 199, numberOfLanes: 200 }
    expect(laneBlockProblem(odd, { maxPerPair: 3 })).toBeUndefined()
  })
})

describe('sessionRefusals', () => {
  it('refuses a date outside the tournament (SQD-03, SQD-24)', () => {
    expect(sessionRefusals(context(), { date: '2026-10-22T09:00:00' }, 'Squad')).toEqual({
      date: 'Squad date must be after tournament start',
    })
    expect(sessionRefusals(context(), { date: '2026-10-26T09:00:00' }, 'Sweeper')).toEqual({
      date: 'Sweeper date must be before tournament end',
    })
    expect(sessionRefusals(context(), { date: '2026-10-25T23:00:00' }, 'Squad')).toEqual({})
  })
  it('refuses lanes that leave a bowler below the start or above the end (D-182)', () => {
    const c = context({ facts: { assignedLanes: [3, 4, 19] } })
    expect(sessionRefusals(c, { startingLane: 5 }, 'Squad')).toEqual({
      startingLane: 'Lane 3 has a bowler assigned. Move them first.',
    })
    expect(sessionRefusals(c, { numberOfLanes: 12 }, 'Squad')).toEqual({
      numberOfLanes: 'Lane 19 has a bowler assigned. Move them first.',
    })
    expect(sessionRefusals(c, { startingLane: 3, numberOfLanes: 18 }, 'Squad')).toEqual({})
  })
  it('allows lanes that still hold every bowler (D-182)', () => {
    const c = context({ facts: { assignedLanes: [3, 19] } })
    expect(sessionRefusals(c, { numberOfLanes: 24 }, 'Squad')).toEqual({})
  })
  it('refuses a max per pair below the fullest pair, naming the pair (D-182)', () => {
    const c = context({ facts: { assignedLanes: [15, 15, 16, 16, 3] } })
    expect(sessionRefusals(c, { maxPerPair: 3 }, 'Squad')).toEqual({
      maxPerPair: 'Pair 15-16 holds 4 bowlers. Move them first.',
    })
    expect(sessionRefusals(c, { maxPerPair: 4 }, 'Squad')).toEqual({})
  })
  it('names the lowest pair on a tie (D-182)', () => {
    const c = context({ facts: { assignedLanes: [7, 8, 3, 4] } })
    expect(sessionRefusals(c, { maxPerPair: 2 }, 'Squad')).toEqual({})
    expect(sessionRefusals(c, { maxPerPair: 1 as number }, 'Squad')).toEqual({
      maxPerPair: 'Pair 3-4 holds 2 bowlers. Move them first.',
    })
  })
  it('does not check a field that did not change (D-17)', () => {
    const c = context({ facts: { assignedLanes: [3, 3, 3, 3, 3] } })
    expect(sessionRefusals(c, { date: undefined }, 'Squad')).toEqual({})
  })
  it('ignores scores in other sessions: only this session facts count (D-180)', () => {
    const c = context({ facts: { hasScores: false } })
    expect(sessionRefusals(c, { numberOfLanes: 2 }, 'Squad')).toEqual({})
  })
})

describe('sessionWarnings', () => {
  it('warns about the date with the entry count (SQD-25)', () => {
    expect(sessionWarnings(context({ facts: { entryCount: 12 } }), { date: 'x' })).toEqual([
      {
        field: 'date',
        message: '12 bowlers are entered. They planned around this time. Tell them.',
      },
    ])
    expect(
      sessionWarnings(context({ facts: { entryCount: 1 } }), { date: 'x' })[0]?.message,
    ).toMatch(/^1 bowler is entered\./)
  })
  it('does not warn without entries or without a change (SQD-25)', () => {
    expect(sessionWarnings(context(), { date: 'x' })).toEqual([])
    expect(sessionWarnings(context({ facts: { entryCount: 3 } }), {})).toEqual([])
  })
  it('warns once for the lanes, on the first changed lane field (SQD-25)', () => {
    const c = context({ facts: { assignedLanes: [1, 2] } })
    const warnings = sessionWarnings(c, { numberOfLanes: 24, maxPerPair: 5 })
    expect(warnings).toEqual([
      {
        field: 'numberOfLanes',
        message:
          '2 bowlers have lane assignments. They keep their lanes, but recap sheets use the lanes and bowlers per pair, so check them.',
      },
    ])
    expect(
      sessionWarnings(context({ facts: { assignedLanes: [1] } }), { startingLane: 1 })[0]?.message,
    ).toMatch(/^1 bowler has a lane assignment\./)
  })
  it('does not warn for lanes with no assignments (SQD-25)', () => {
    expect(sessionWarnings(context(), { numberOfLanes: 24 })).toEqual([])
  })
})

describe('toSessionEditInfo (SQD-26)', () => {
  it('summarizes the assigned lanes', () => {
    expect(
      toSessionEditInfo({ entryCount: 5, hasScores: true, assignedLanes: [15, 16, 15, 3] }),
    ).toEqual({
      entryCount: 5,
      assignmentCount: 4,
      hasScores: true,
      lowestAssignedLane: 3,
      highestAssignedLane: 16,
      fullestPair: 3,
    })
  })
  it('gives null for the lane facts with no assignments', () => {
    expect(toSessionEditInfo(noSessionEditFacts)).toEqual({
      entryCount: 0,
      assignmentCount: 0,
      hasScores: false,
      lowestAssignedLane: null,
      highestAssignedLane: null,
      fullestPair: null,
    })
  })
})

describe('pairOfLane and inFormOrder', () => {
  it('pairs an odd lane with the even lane after it', () => {
    expect([pairOfLane(1), pairOfLane(2), pairOfLane(15), pairOfLane(16)]).toEqual([1, 1, 15, 15])
  })
  it('sorts by form order, bonus pins by their group, unknown last', () => {
    const sorted = inFormOrder(
      [
        { field: 'zzz', message: 'z' },
        { field: 'bonusPins.abc', message: 'p' },
        { field: 'date', message: 'd' },
      ],
      ['date', 'bonusPins'],
    )
    expect(sorted.map((w) => w.field)).toEqual(['date', 'bonusPins.abc', 'zzz'])
  })
})
