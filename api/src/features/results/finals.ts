import type { ResultEntry } from './entries.ts'
import { rankEntries } from './ranking.ts'
import type { DivisionOutcome } from './squadResults.ts'

/** One squad's outcome for one division. Runs go in date order, so a tie goes to the earlier squad (RES-14). */
export interface SquadRun {
  squadId: string
  squadDate: string
  outcome: DivisionOutcome
}

/** An entry with the squad it was bowled in. */
export interface PlacedEntry {
  entry: ResultEntry
  squadId: string
  squadDate: string
}

export interface AtLargeOutcome {
  /** `E`: the division's entries summed over every squad. A bowler in 3 squads counts 3 times (RES-12). */
  entryCount: number
  /** `S = floor(E / finalsRatio)` (RES-12). */
  totalSpots: number
  /** `Q`: advancers from all squads (RES-13). */
  squadAdvancers: number
  /** `max(S - Q, 0)` (RES-13, RES-15). */
  atLargeSpots: number
  /** The top `atLargeSpots` of the pool, best first (RES-15). */
  advancers: PlacedEntry[]
  /** The rest of the pool, best first. */
  others: PlacedEntry[]
  /** Bowlers who cashed in any squad (RES-16, D-07). */
  previousCashers: ReadonlySet<string>
}

/** The highest total of each bowler. A tie keeps the earliest squad (RES-14). */
function bestPerBowler(
  runs: readonly SquadRun[],
  pick: (outcome: DivisionOutcome) => readonly ResultEntry[],
): Map<string, PlacedEntry> {
  const best = new Map<string, PlacedEntry>()
  for (const { squadId, squadDate, outcome } of runs) {
    for (const entry of pick(outcome)) {
      const found = best.get(entry.bowlerId)
      if (!found || entry.total > found.entry.total) {
        best.set(entry.bowlerId, { entry, squadId, squadDate })
      }
    }
  }
  return best
}

/** The placed entries in the rank order of `SCR-11`. */
function rankPlaced(placed: Iterable<PlacedEntry>): PlacedEntry[] {
  const list = [...placed]
  const byEntry = new Map(list.map((item) => [item.entry, item]))
  return rankEntries(list.map((item) => item.entry)).flatMap((entry) => {
    const item = byEntry.get(entry)
    return item ? [item] : []
  })
}

/**
 * RES-12 to RES-16, D-86, D-91: the at-large advancers of one division. The total spots come from
 * the tournament finals ratio (a squad's own ratio is ignored). The pool holds every casher and
 * non-qualifier of every squad, less anyone who advanced in any squad; a bowler who did not finish
 * or did not show is not in it (D-75). Each bowler is in it once, with their best squad.
 */
export function workOutAtLarge(runs: readonly SquadRun[], finalsRatio: number): AtLargeOutcome {
  const entryCount = runs.reduce((sum, run) => sum + run.outcome.entryCount, 0)
  const totalSpots = Math.floor(entryCount / finalsRatio)
  const squadAdvancers = runs.reduce((sum, run) => sum + run.outcome.advancers.length, 0)
  const atLargeSpots = Math.max(totalSpots - squadAdvancers, 0)

  const advancedAnywhere = new Set(
    runs.flatMap((run) => run.outcome.advancers.map((entry) => entry.bowlerId)),
  )
  const pool = bestPerBowler(runs, (outcome) => [...outcome.cashers, ...outcome.others])
  const ranked = rankPlaced(
    [...pool.values()].filter((item) => !advancedAnywhere.has(item.entry.bowlerId)),
  )
  const previousCashers = new Set(
    runs.flatMap((run) => run.outcome.cashers.map((entry) => entry.bowlerId)),
  )
  return {
    entryCount,
    totalSpots,
    squadAdvancers,
    atLargeSpots,
    advancers: ranked.slice(0, atLargeSpots),
    others: ranked.slice(atLargeSpots),
    previousCashers,
  }
}

export interface SeedingOutcome {
  /** Squad advancers and at-large advancers, seeds 1, 2, 3 in rank order (RES-18, RES-20). */
  finalists: PlacedEntry[]
  /** Everyone else, best first, numbered on from the last seed (RES-20). */
  others: PlacedEntry[]
  /** Finalists who came through at-large and cashed in a squad (RES-21). */
  previousCashers: ReadonlySet<string>
}

/**
 * RES-18 to RES-21: the finals seeding of one division. Each bowler takes their best entry across
 * all squads, not necessarily the squad they advanced from (RES-19). A bowler who did not finish or
 * did not show is not listed (D-75).
 */
export function workOutSeeding(runs: readonly SquadRun[], atLarge: AtLargeOutcome): SeedingOutcome {
  const finalistIds = new Set([
    ...runs.flatMap((run) => run.outcome.advancers.map((entry) => entry.bowlerId)),
    ...atLarge.advancers.map((item) => item.entry.bowlerId),
  ])
  const best = bestPerBowler(runs, (outcome) => [
    ...outcome.advancers,
    ...outcome.cashers,
    ...outcome.others,
  ])
  const all = [...best.values()]
  const atLargeIds = new Set(atLarge.advancers.map((item) => item.entry.bowlerId))
  return {
    finalists: rankPlaced(all.filter((item) => finalistIds.has(item.entry.bowlerId))),
    others: rankPlaced(all.filter((item) => !finalistIds.has(item.entry.bowlerId))),
    previousCashers: new Set(
      [...atLarge.previousCashers].filter((bowlerId) => atLargeIds.has(bowlerId)),
    ),
  }
}
