import type { Division } from '../divisions/types.ts'
import type { LaneEntry } from '../lanes/types.ts'
import { workOutAtLarge, type SquadRun } from './finals.ts'
import { compareText } from './resultHelpers.ts'
import type { WorkedSquad } from './squadFlow.ts'
import { markCutLine } from './ties.ts'
import type { LiveAtLarge } from './types.ts'

/**
 * RES-57: the squads whose scores are official, in date order: every complete squad up to the first
 * open one. A later squad completed out of order waits, because who advances there depends on who
 * advanced before it (RES-06).
 */
function countedSquads(worked: readonly WorkedSquad[]): readonly WorkedSquad[] {
  const open = worked.findIndex(({ squad }) => !squad.complete)
  return open === -1 ? worked : worked.slice(0, open)
}

/**
 * RES-59: the open squad the figure is projected for: the last by date, when it is the only open one
 * and there is another before it.
 */
export function projectedSquad(worked: readonly WorkedSquad[]): WorkedSquad | undefined {
  return worked.length >= 2 && countedSquads(worked).length === worked.length - 1
    ? worked.at(-1)
    : undefined
}

/** `L` of each division: bowlers with a lane on the squad (RES-59). */
function lanesByDivision(entries: readonly LaneEntry[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { divisionId, position } of entries) {
    if (position !== '') counts.set(divisionId, (counts.get(divisionId) ?? 0) + 1)
  }
  return counts
}

/** RES-60: the figure of the last bowler in, `null` when the spots are none or not all filled. */
function lineOf(
  pool: ReturnType<typeof workOutAtLarge>['others'],
  spots: number,
): LiveAtLarge['line'] {
  const last = pool[spots - 1]?.entry
  if (!last) return null
  const tie = markCutLine(
    pool.slice(0, spots).map((item) => item.entry),
    pool.slice(spots).map((item) => item.entry),
  ).get(last.registrationId)?.[0]
  const rank = tie?.decidedBy?.kind === 'game' ? tie.decidedBy.rank : 1
  return {
    total: last.total,
    games: last.games.length,
    highGame: last.highGame,
    // Rank 1 is the high game already shown; later ones are scratch games (SCR-11).
    tieBreaker: rank > 1 ? { rank, score: last.best[rank - 1] ?? 0 } : null,
    fullTie: tie?.outcome === 'full',
  }
}

/**
 * RES-57 to RES-60: the at-large figure of each division for the TV page, from the official squads
 * only. While just the last squad is open it is projected: that squad's bowlers with a lane add to
 * the entries, and its own advancers come off the spots. Empty until a squad is complete. No names
 * and no bowler ids: the TV needs the figure only.
 */
export function workOutLiveAtLarge(
  worked: readonly WorkedSquad[],
  lastEntries: readonly LaneEntry[],
  divisions: readonly Division[],
  finalsRatio: number,
): LiveAtLarge[] {
  const counted = countedSquads(worked)
  if (counted.length === 0) return []
  const last = projectedSquad(worked)
  const lanes = last ? lanesByDivision(lastEntries) : new Map<string, number>()

  return divisions
    .toSorted((a, b) => compareText(a.name, b.name) || a.number - b.number)
    .flatMap((division) => {
      const runs: SquadRun[] = counted.flatMap(({ squad, outcomes }) =>
        outcomes
          .filter((each) => each.divisionId === division.id)
          .map(({ outcome }) => ({ squadId: squad.id, squadDate: squad.date, outcome })),
      )
      const waiting = lanes.get(division.id) ?? 0
      if (runs.length === 0 && waiting === 0) return []
      const outcome = workOutAtLarge(runs, finalsRatio)
      const spots = last
        ? Math.max(
            Math.floor((outcome.entryCount + waiting) / finalsRatio) -
              (outcome.squadAdvancers + Math.floor(waiting / last.squad.finalsRatio)),
            0,
          )
        : outcome.atLargeSpots
      return [
        {
          divisionId: division.id,
          divisionName: division.name,
          spots,
          projected: last !== undefined,
          handicap: division.handicapPercentage !== null,
          line: lineOf([...outcome.advancers, ...outcome.others], spots),
        },
      ]
    })
}
