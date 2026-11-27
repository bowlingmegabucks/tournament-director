import { createDivision, createLaneEntry, createSquad } from '../../test/factories.ts'
import type { LaneEntry } from '../lanes/types.ts'
import type { ScoreRow } from '../scores/types.ts'
import type { Squad } from '../squads/types.ts'
import type { Snapshot } from './fallout.ts'

/** Finals 1 in 7, cash 1 in 5: 21 entries give 3 and 1, 20 give 2 and 2, 19 give 2 and 1. */
export const ratios = { finalsRatio: 7, cashRatio: 5 }

export const open = createDivision({ number: 1, name: 'Open' })

export const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const letters = ['Amy', 'Ben', 'Cal', 'Dee', 'Eve']

/**
 * Bowler `n` (0 is the best). The same person in two squads keeps the bowler id and the
 * registration id.
 */
export function person(n: number): LaneEntry {
  const name = letters[n] ?? `Field${String(n).padStart(2, '0')}`
  return createLaneEntry({
    registrationId: idOf(100 + n),
    bowlerId: idOf(500 + n),
    name: `${name} Lane`,
    firstName: name,
    lastName: 'Lane',
    divisionId: open.id,
    average: null,
  })
}

export const noShow = createLaneEntry({
  registrationId: idOf(900),
  bowlerId: idOf(901),
  name: 'Nora Noshow',
  firstName: 'Nora',
  lastName: 'Noshow',
  divisionId: open.id,
  average: null,
})

export const squadOne = createSquad({
  id: idOf(1),
  date: '2026-11-26T08:00:00',
  complete: true,
  ...ratios,
})
export const squadTwo = createSquad({
  id: idOf(2),
  date: '2026-11-26T13:00:00',
  complete: true,
  ...ratios,
})
export const openSquad = createSquad({
  id: idOf(3),
  date: '2026-11-27T08:00:00',
  complete: false,
  ...ratios,
})

export interface Bowled {
  entry: LaneEntry
  /** The same score in each of three games. 0 is a no-show. */
  score: number
}

/** `count` bowlers, best first: `person(0)` has 250 a game, each next one 2 less. */
export const field = (count: number, from = 0): Bowled[] =>
  Array.from({ length: count }, (_, index) => ({
    entry: person(from + index),
    score: 250 - index * 2,
  }))

export const scoresOf = ({ entry, score }: Bowled): ScoreRow[] =>
  [1, 2, 3].map((game) => ({ bowlerId: entry.bowlerId, game, score }))

export function snapshotOf(squads: [Squad, Bowled[]][]): Snapshot {
  return {
    squads: squads.map(([squad]) => squad),
    divisions: [open],
    finalsRatio: ratios.finalsRatio,
    entries: new Map(squads.map(([squad, bowled]) => [squad.id, bowled.map((b) => b.entry)])),
    scores: new Map(squads.map(([squad, bowled]) => [squad.id, bowled.flatMap(scoresOf)])),
  }
}
