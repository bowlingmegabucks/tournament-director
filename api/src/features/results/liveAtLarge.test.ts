import { describe, expect, it } from 'vitest'
import {
  createDivision,
  createLaneEntry,
  createResultEntry,
  createSquad,
} from '../../test/factories.ts'
import type { LaneEntry } from '../lanes/types.ts'
import { projectedSquad, workOutLiveAtLarge } from './liveAtLarge.ts'
import type { WorkedSquad } from './squadFlow.ts'
import { workOutDivision } from './squadResults.ts'

const open = createDivision({ number: 1, name: 'Open' })

/** A squad of the Open division, worked out from one list of games for each bowler. */
function worked(
  games: number[][],
  { complete = true, finalsRatio = 7, date = '2026-10-24T09:00:00', pins = 0 } = {},
): WorkedSquad {
  const squad = createSquad({ date, complete, finalsRatio, games: 3 })
  return {
    squad,
    entries: [],
    advancedBefore: new Set(),
    flagged: new Set(),
    skipped: [],
    outcomes:
      games.length === 0
        ? []
        : [
            {
              divisionId: open.id,
              throughGame: 3,
              outcome: workOutDivision({
                entries: games.map((each) =>
                  createResultEntry({ divisionId: open.id, games: each, pins }),
                ),
                advancedBefore: new Set(),
                finalsRatio,
                cashRatio: 5,
                games: 3,
                complete,
              }),
            },
          ],
  }
}

/** `count` bowlers, each a game apart, so every total differs. */
const field = (count: number, top = 280) =>
  Array.from({ length: count }, (_, index) => [top - index, 200, 200])

const lanes = (count: number, position = '1A'): LaneEntry[] =>
  Array.from({ length: count }, () => createLaneEntry({ divisionId: open.id, position }))

const run = (squads: WorkedSquad[], last: LaneEntry[] = [], ratio = 7) =>
  workOutLiveAtLarge(squads, last, [open], ratio)

describe('workOutLiveAtLarge (RES-57 to RES-60)', () => {
  it('is empty until a squad is complete', () => {
    expect(run([worked(field(20), { complete: false })])).toEqual([])
    expect(run([])).toEqual([])
  })

  it('counts complete squads only, up to the first open one', () => {
    // 20 of 7: 2 advance, 2 spots. A later complete squad waits for the open one before it.
    const result = run([
      worked(field(20)),
      worked(field(20), { complete: false }),
      worked(field(20)),
    ])

    expect(result).toMatchObject([{ spots: 0, projected: false }])
    expect(
      run([worked(field(13)), worked(field(13)), worked([], { complete: false }), worked([])]),
    ).toMatchObject([{ spots: 1, projected: false }])
  })

  it('gives the last bowler in', () => {
    // Two squads of 13: 3 spots, 2 advance, 1 at large: the best of those who missed out.
    const result = run([worked(field(13)), worked(field(13, 270))])

    expect(result).toEqual([
      {
        divisionId: open.id,
        divisionName: 'Open',
        spots: 1,
        projected: false,
        handicap: false,
        line: { total: 679, games: 3, highGame: 279, tieBreaker: null, fullTie: false },
      },
    ])
  })

  it.each([
    [0, 5],
    [6, 6],
    [7, 5],
    [20, 6],
    [21, 5],
    [22, 5],
  ])('projects %i lanes on the last squad to %i spots', (assigned, spots) => {
    const complete = Array.from({ length: 6 }, () => worked(field(20)))
    const last = worked([], { complete: false })

    const result = run([...complete, last], lanes(assigned))

    expect(result).toMatchObject([{ spots, projected: true }])
  })

  it('does not count a bowler with no lane', () => {
    const complete = Array.from({ length: 6 }, () => worked(field(20)))

    const result = run([...complete, worked([], { complete: false })], lanes(6, ''))

    expect(result).toMatchObject([{ spots: 5, projected: true }])
  })

  it('takes the advancers of the last squad by its own ratio', () => {
    const complete = Array.from({ length: 6 }, () => worked(field(20)))
    // 14 lanes at a ratio of 14: 1 advancer, 19 finals spots, 13 taken.
    const last = worked([], { complete: false, finalsRatio: 14 })

    expect(run([...complete, last], lanes(14))).toMatchObject([{ spots: 6 }])
  })

  it('does not project a one-squad tournament', () => {
    expect(projectedSquad([worked(field(20), { complete: false })])).toBeUndefined()
  })

  it('shows a division only on the last squad with no spot', () => {
    const result = run([worked([]), worked([], { complete: false })], lanes(10))

    expect(result).toMatchObject([{ spots: 0, projected: true, line: null }])
  })

  it('marks a handicap division and includes the pins in the high game', () => {
    const handicap = { ...open, handicapPercentage: 90 }
    const squads = [worked(field(13), { pins: 10 }), worked(field(13, 270), { pins: 10 })]

    const [result] = workOutLiveAtLarge(squads, [], [handicap], 7)

    expect(result).toMatchObject({ handicap: true, line: { total: 709, highGame: 289 } })
  })

  it('names the 2nd-best game when it decided the last spot', () => {
    // Both on 660 with a 250 high game; 210 beats 205 for the one at-large spot.
    const first = [[300, 300, 300], [250, 210, 200], ...field(11, 205)]
    const second = [[300, 300, 300], [250, 205, 205], ...field(11, 204)]

    const [result] = run([worked(first), worked(second)])

    expect(result?.line).toMatchObject({
      total: 660,
      highGame: 250,
      tieBreaker: { rank: 2, score: 210 },
      fullTie: false,
    })
  })

  it('says a full tie for the last spot', () => {
    const squad = () => worked([[300, 300, 300], [250, 210, 200], ...field(11, 205)])

    const [result] = run([squad(), squad()])

    expect(result?.line).toMatchObject({ total: 660, tieBreaker: null, fullTie: true })
  })

  it('has no figure when the spots outnumber the bowlers', () => {
    // 14 entries, 13 of them no-shows: 2 spots, 1 advancer, nobody for the other.
    const games = [[200, 200, 200], ...Array.from({ length: 13 }, () => [0, 0, 0])]

    expect(run([worked(games)])).toMatchObject([{ spots: 1, line: null }])
  })
})
