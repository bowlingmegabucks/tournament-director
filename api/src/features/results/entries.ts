import type { Division } from '../divisions/types.ts'
import { handicap } from '../lanes/handicap.ts'
import type { LaneEntry } from '../lanes/types.ts'
import type { ScoreRow } from '../scores/types.ts'
import type { BonusPins } from '../sweepers/types.ts'

/** What a result needs to know about one bowler in one squad or sweeper. */
export interface ResultEntryInput {
  registrationId: string
  bowlerId: string
  firstName: string
  lastName: string
  /** `First Last`, plus `, Suffix` (BWL-13). */
  name: string
  divisionId: string
  divisionName: string
  /** Scratch pins by game, in game order. Only games with a stored score. */
  games: number[]
  /** Pins added per game: the handicap on a squad (SCR-07), the bonus pins on a sweeper (SCR-09). */
  pins: number
}

/** An entry with the figures that ranking compares (SCR-11). */
export interface ResultEntry extends ResultEntryInput {
  /** SCR-08, SCR-09: scratch pins plus `pins` for each game bowled. */
  total: number
  /** The best scratch game plus `pins` (SCR-11 step 3). 0 when there are no games. */
  highGame: number
  /** The scratch games, best first (SCR-11 step 4). */
  best: number[]
}

export function toResultEntry(input: ResultEntryInput): ResultEntry {
  const best = input.games.toSorted((a, b) => b - a)
  const scratch = input.games.reduce((sum, score) => sum + score, 0)
  const top = best[0]
  return {
    ...input,
    total: scratch + input.pins * input.games.length,
    highGame: top === undefined ? 0 : top + input.pins,
    best,
  }
}

/** SCR-07: a squad entry's pins are the handicap per game. */
export function squadPins(entry: LaneEntry, division: Division): number {
  return handicap(entry.average, division)
}

/** SCR-09: a sweeper entry's pins are the division's bonus pins. A missing row counts as 0. */
export function sweeperPins(bonusPins: readonly BonusPins[]) {
  const byDivision = new Map(bonusPins.map((pins) => [pins.divisionId, pins.bonusPinsPerGame]))
  return (_entry: LaneEntry, division: Division): number => byDivision.get(division.id) ?? 0
}

export interface BuiltEntries {
  entries: ResultEntry[]
  /** Entries with a score whose division is not one of the tournament's (D-51). Left out. */
  skipped: string[]
}

/**
 * RES-02, SCR-10: the entries of one squad or sweeper. A bowler is an entry when they have at least
 * one stored score. Scores link to the bowler, the division to the current registration. A score
 * for a bowler who is not entered in the session is ignored (D-06, D-11).
 */
export function buildResultEntries(
  laneEntries: readonly LaneEntry[],
  scores: readonly ScoreRow[],
  divisions: readonly Division[],
  pinsFor: (entry: LaneEntry, division: Division) => number,
): BuiltEntries {
  const gamesOf = new Map<string, Map<number, number>>()
  for (const { bowlerId, game, score } of scores) {
    const byGame = gamesOf.get(bowlerId) ?? new Map<number, number>()
    byGame.set(game, score)
    gamesOf.set(bowlerId, byGame)
  }
  const divisionById = new Map(divisions.map((division) => [division.id, division]))

  const entries: ResultEntry[] = []
  const skipped: string[] = []
  for (const entry of laneEntries) {
    const stored = gamesOf.get(entry.bowlerId)
    if (!stored) continue
    const division = divisionById.get(entry.divisionId)
    if (!division) {
      skipped.push(entry.registrationId)
      continue
    }
    entries.push(
      toResultEntry({
        registrationId: entry.registrationId,
        bowlerId: entry.bowlerId,
        firstName: entry.firstName,
        lastName: entry.lastName,
        name: entry.name,
        divisionId: division.id,
        divisionName: division.name,
        games: [...stored.entries()].sort(([a], [b]) => a - b).map(([, score]) => score),
        pins: pinsFor(entry, division),
      }),
    )
  }
  return { entries, skipped }
}
