import { describe, expect, it } from 'vitest'
import { createDivision, createLaneEntry } from '../../test/factories.ts'
import { buildLanePage, type LaneSession } from '../lanes/lanePage.ts'
import type { LaneEntry } from '../lanes/types.ts'
import { buildScorePage } from './scorePage.ts'
import { scorePageSchema, type ScoreRow } from './types.ts'

const open = createDivision({ number: 1, name: 'Open' })
const scratch = createDivision({ number: 2, name: 'Scratch' })

function session(overrides: Partial<LaneSession> = {}): LaneSession {
  return {
    kind: 'squad',
    id: '2f6d8b3a-4c55-4d0e-8a11-9b7e5c3d1f02',
    date: '2026-10-24T09:00:00',
    complete: false,
    startingLane: 1,
    numberOfLanes: 10,
    maxPerPair: 5,
    bonusPins: [],
    ...overrides,
  }
}

function entry(position: string, overrides: Partial<LaneEntry> = {}): LaneEntry {
  return createLaneEntry({ divisionId: open.id, position, ...overrides })
}

function scoresFor(bowler: LaneEntry, ...pins: number[]): ScoreRow[] {
  return pins.map((score, index) => ({ bowlerId: bowler.bowlerId, game: index + 1, score }))
}

function build(
  entries: LaneEntry[],
  scores: ScoreRow[],
  games = 3,
  over: Partial<LaneSession> = {},
) {
  const { page } = buildLanePage(session(over), entries, [open, scratch])
  return buildScorePage(page, entries, scores, games)
}

describe('buildScorePage', () => {
  it('groups bowlers by lane pair, lane then letter (SCR-13, LAN-04)', () => {
    const entries = [entry('4C'), entry('2C'), entry('1B'), entry('1A')]

    const page = build(entries, [])

    expect(page.pairs.map((pair) => pair.firstLane)).toEqual([1, 3])
    expect(page.pairs[0]?.bowlers.map((bowler) => bowler.position)).toEqual(['1A', '1B', '2C'])
    expect(page.pairs[1]?.bowlers.map((bowler) => bowler.position)).toEqual(['4C'])
  })

  it('leaves out a pair with no bowler (D-73)', () => {
    const page = build([entry('9A')], [])

    expect(page.pairs.map((pair) => pair.firstLane)).toEqual([9])
  })

  it('puts each game score in its column and leaves a missing game null (D-69)', () => {
    const bowler = entry('1A')
    const scores = [
      { bowlerId: bowler.bowlerId, game: 2, score: 198 },
      ...scoresFor(bowler, 212).slice(0, 1),
    ]

    const [row] = build([bowler], scores).pairs[0]?.bowlers ?? []

    expect(row?.scores).toEqual([212, 198, null])
  })

  it('keeps a stored 0 as 0, not as no score (D-69, SQD-15)', () => {
    const bowler = entry('1A')

    const [row] = build([bowler], scoresFor(bowler, 0, 0, 0)).pairs[0]?.bowlers ?? []

    expect(row?.scores).toEqual([0, 0, 0])
    expect(row?.total).toBe(0)
  })

  it('totals the scratch scores present, with no handicap (D-68, D-69)', () => {
    const bowler = entry('1A', { average: 150 })

    const [row] = build([bowler], scoresFor(bowler, 200, 150)).pairs[0]?.bowlers ?? []

    expect(row?.total).toBe(350)
  })

  it('gives a bowler with no scores a total of 0 and every game null', () => {
    const [row] = build([entry('1A')], []).pairs[0]?.bowlers ?? []

    expect(row).toMatchObject({ scores: [null, null, null], total: 0 })
  })

  it("shows the bowler's current division name (SCR-10)", () => {
    const [row] = build([entry('1A', { divisionId: scratch.id })], []).pairs[0]?.bowlers ?? []

    expect(row?.divisionName).toBe('Scratch')
  })

  it('adds columns for a stored game past the game count (D-69)', () => {
    const bowler = entry('1A')
    const other = entry('1B')

    const page = build([bowler, other], scoresFor(bowler, 200, 190, 180, 170))

    expect(page.session.games).toBe(4)
    expect(page.pairs[0]?.bowlers.map((row) => row.scores.length)).toEqual([4, 4])
    expect(page.pairs[0]?.bowlers[0]?.total).toBe(740)
  })

  it('uses the session game count when no stored game is higher (D-69)', () => {
    const bowler = entry('1A')

    const page = build([bowler], scoresFor(bowler, 200), 5)

    expect(page.session.games).toBe(5)
  })

  it('ignores a score for a bowler who is not entered in the session', () => {
    const bowler = entry('1A')
    const stranger = { bowlerId: '9b1d6c0e-7a31-4e55-8f02-3c4d5e6f7a88', game: 6, score: 300 }

    const page = build([bowler], [stranger])

    expect(page.session.games).toBe(3)
    expect(page.pairs[0]?.bowlers[0]?.total).toBe(0)
  })

  it('does not widen the columns for a score of a bowler with no lane', () => {
    const waiting = entry('')

    const page = build([waiting], scoresFor(waiting, 1, 2, 3, 4, 5, 6))

    expect(page.session.games).toBe(3)
  })

  it('counts bowlers with no lane and does not list them (D-71)', () => {
    const page = build([entry('1A'), entry(''), entry('')], [])

    expect(page.noLane).toBe(2)
    expect(page.pairs.flatMap((pair) => pair.bowlers)).toHaveLength(1)
  })

  it('lists a bowler whose position fits no pair under other, with scores and the raw text (D-61, D-71)', () => {
    const lost = entry('99A')

    const page = build([lost], scoresFor(lost, 150, 160, 170))

    expect(page.pairs).toEqual([])
    expect(page.other).toHaveLength(1)
    expect(page.other[0]).toMatchObject({ position: '99A', scores: [150, 160, 170], total: 480 })
  })

  it('widens the columns for a score of a bowler under other', () => {
    const lost = entry('99A')

    expect(build([lost], scoresFor(lost, 1, 2, 3, 4)).session.games).toBe(4)
  })

  it('carries the session facts (SCR-14)', () => {
    const page = build([], [], 3, { complete: true, kind: 'sweeper' })

    expect(page.session).toEqual({
      id: '2f6d8b3a-4c55-4d0e-8a11-9b7e5c3d1f02',
      kind: 'sweeper',
      date: '2026-10-24T09:00:00',
      complete: true,
      games: 3,
    })
  })

  it('builds a page that fits its schema, with no private fields (BWL-17)', () => {
    const bowler = entry('1A', { average: 199 })

    const page = build([bowler], scoresFor(bowler, 200))

    expect(scorePageSchema.safeParse(page).success).toBe(true)
    const row = page.pairs[0]?.bowlers[0]
    expect(Object.keys(row ?? {}).sort()).toEqual([
      'divisionName',
      'name',
      'position',
      'registrationId',
      'scores',
      'total',
    ])
  })
})
