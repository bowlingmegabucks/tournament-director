import type { Division } from '../divisions/types.ts'
import type { LaneEntry } from '../lanes/types.ts'
import type { ScoreRow } from '../scores/types.ts'
import type { Sweeper } from '../sweepers/types.ts'
import { sweeperPins, toResultEntry, type ResultEntry } from './entries.ts'
import { rankEntries } from './ranking.ts'

/** One sweeper of the tournament with the entries and scores saved so far. */
export interface SweeperInput {
  sweeper: Sweeper
  entries: readonly LaneEntry[]
  scores: readonly ScoreRow[]
}

/** D-90: why a bowler's row carries a tag. */
export interface SweeperFlag {
  /** `missed`: no score in a complete sweeper. `unfinished`: some games, fewer than its `games`. */
  kind: 'missed' | 'unfinished'
  sweeperId: string
  gamesBowled: number
}

export interface SuperSweeperEntry {
  entry: ResultEntry
  /** One total per sweeper, in the order given: scratch plus that sweeper's pins. `null`: open, no score yet. */
  sweeperTotals: (number | null)[]
  flags: SweeperFlag[]
}

export interface SuperSweeperBuilt {
  entries: SuperSweeperEntry[]
  /** Registrations whose division is not one of the tournament's (D-51). Left out. */
  skipped: string[]
}

/** The scratch games of each bowler in one sweeper. A game saved twice keeps the last score. */
function gamesByBowler(scores: readonly ScoreRow[]): Map<string, number[]> {
  const byGame = new Map<string, Map<number, number>>()
  for (const { bowlerId, game, score } of scores) {
    const games = byGame.get(bowlerId) ?? new Map<number, number>()
    games.set(game, score)
    byGame.set(bowlerId, games)
  }
  return new Map([...byGame.entries()].map(([bowlerId, games]) => [bowlerId, [...games.values()]]))
}

interface SweeperScores {
  sweeper: Sweeper
  pins: (entry: LaneEntry, division: Division) => number
  games: Map<string, number[]>
}

/** One bowler's combined entry, or `null` with no game in any sweeper. */
function buildEntry(
  registrant: LaneEntry,
  division: Division,
  perSweeper: readonly SweeperScores[],
): SuperSweeperEntry | null {
  const games: number[] = []
  const highGames: number[] = []
  const sweeperTotals: (number | null)[] = []
  const flags: SweeperFlag[] = []
  let total = 0

  for (const { sweeper, pins, games: stored } of perSweeper) {
    // Complete writes zero rows for a no-show (D-06), so all zeros is a missed sweeper (D-75, D-90).
    const rows = stored.get(registrant.bowlerId) ?? []
    const bowled = rows.every((score) => score === 0) ? [] : rows
    if (bowled.length === 0 && !sweeper.complete) {
      sweeperTotals.push(null)
      continue
    }
    const pinsPerGame = pins(registrant, division)
    const scratch = bowled.reduce((sum, score) => sum + score, 0)
    const sweeperTotal = scratch + pinsPerGame * bowled.length
    const missing = sweeper.complete ? Math.max(sweeper.games - bowled.length, 0) : 0
    if (missing > 0) {
      flags.push({
        kind: bowled.length === 0 ? 'missed' : 'unfinished',
        sweeperId: sweeper.id,
        gamesBowled: bowled.length,
      })
    }
    games.push(...bowled, ...Array.from({ length: missing }, () => 0))
    highGames.push(...bowled.map((score) => score + pinsPerGame))
    sweeperTotals.push(sweeperTotal)
    total += sweeperTotal
  }
  if (games.length === 0) return null

  const base = toResultEntry({
    registrationId: registrant.registrationId,
    bowlerId: registrant.bowlerId,
    firstName: registrant.firstName,
    lastName: registrant.lastName,
    name: registrant.name,
    divisionId: division.id,
    divisionName: division.name,
    games,
    pins: 0,
  })
  // The pins differ by sweeper, so the total and high game are set here, not by `toResultEntry`.
  return { entry: { ...base, total, highGame: Math.max(0, ...highGames) }, sweeperTotals, flags }
}

/**
 * RES-26, RES-27, D-90: one combined entry for each bowler who opted in to the super sweeper.
 * `inputs` are in date order. Each game takes its own sweeper's bonus pins (the RES-27 defect). In a
 * complete sweeper, a bowler with no score or fewer games than the sweeper has gets 0 for each missing
 * game, with no pins, and a flag. Stored scores that are all 0 (the zeros Complete writes for a
 * no-show, D-06) count as no score. An open sweeper adds nothing. A bowler with no game at all is left
 * out. Games bowled for ranking is every game, zero-filled ones included.
 */
export function buildSuperSweeperEntries(
  inputs: readonly SweeperInput[],
  divisions: readonly Division[],
): SuperSweeperBuilt {
  const divisionById = new Map(divisions.map((division) => [division.id, division]))
  const perSweeper = inputs.map(({ sweeper, scores }) => ({
    sweeper,
    pins: sweeperPins(sweeper.bonusPins),
    games: gamesByBowler(scores),
  }))

  const registrants = new Map<string, LaneEntry>()
  for (const { entries } of inputs) {
    for (const entry of entries) {
      if (entry.superSweeper && !registrants.has(entry.registrationId)) {
        registrants.set(entry.registrationId, entry)
      }
    }
  }

  const built: SuperSweeperEntry[] = []
  const skipped: string[] = []
  for (const registrant of registrants.values()) {
    const division = divisionById.get(registrant.divisionId)
    if (!division) {
      skipped.push(registrant.registrationId)
      continue
    }
    const item = buildEntry(registrant, division, perSweeper)
    if (item) built.push(item)
  }
  return { entries: built, skipped }
}

export interface SuperSweeperOutcome {
  /** `N`: the ranked bowlers (RES-26). */
  entryCount: number
  /** `max(floor(N / cashRatio), 1)`, never more than `N` (RES-28). 0 with no entries. */
  cashCount: number
  /** Best first. */
  cashers: SuperSweeperEntry[]
  others: SuperSweeperEntry[]
  /** The last casher's total, `null` with no entries. */
  cutScore: number | null
}

/**
 * RES-28, SCR-11: rank the combined entries and cash the top `max(floor(N / ratio), 1)`. The ratio
 * must be above 0; the caller checks (D-93).
 */
export function workOutSuperSweeper(
  built: readonly SuperSweeperEntry[],
  cashRatio: number,
): SuperSweeperOutcome {
  const byEntry = new Map(built.map((item) => [item.entry, item]))
  const ranked = rankEntries(built.map((item) => item.entry)).flatMap((entry) => {
    const item = byEntry.get(entry)
    return item ? [item] : []
  })
  const entryCount = ranked.length
  const cashCount = Math.min(Math.max(Math.floor(entryCount / cashRatio), 1), entryCount)
  const cashers = ranked.slice(0, cashCount)
  return {
    entryCount,
    cashCount,
    cashers,
    others: ranked.slice(cashCount),
    cutScore: cashers.at(-1)?.entry.total ?? null,
  }
}
