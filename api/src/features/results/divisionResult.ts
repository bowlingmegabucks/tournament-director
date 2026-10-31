import type { Division } from '../divisions/types.ts'
import type { DivisionOutcome } from './squadResults.ts'
import type { Tie } from './ties.ts'
import type { DivisionResult, SquadRow } from './types.ts'

/**
 * RES-10, RES-11a, D-75, D-76, D-81: the rows of one division, ready to send. Places number the
 * advancers, then the cashers, then the others, with no repeat (SCR-12). Bowlers listed apart
 * carry no place.
 */
export function toDivisionResult(
  division: Pick<Division, 'id' | 'number' | 'name'>,
  outcome: DivisionOutcome,
  marks: ReadonlyMap<string, Tie[]>,
  advancedBefore: ReadonlySet<string>,
): DivisionResult {
  const { advancers, cashers, others, cutTotal } = outcome

  const grouped = [
    ...advancers.map((entry) => ({ entry, group: 'advancer' as const })),
    ...cashers.map((entry) => ({ entry, group: 'casher' as const })),
    ...others.map((entry) => ({ entry, group: 'other' as const })),
  ]
  const rows: SquadRow[] = grouped.map(({ entry, group }, index) => ({
    registrationId: entry.registrationId,
    name: entry.name,
    place: index + 1,
    group,
    total: entry.total,
    highGame: entry.highGame,
    games: entry.games.length,
    handicap: entry.pins,
    // D-81: only an earlier advancer at or above the cut, who would have advanced.
    advancedEarlier:
      advancedBefore.has(entry.bowlerId) && cutTotal !== undefined && entry.total >= cutTotal,
    ties: marks.get(entry.registrationId) ?? [],
  }))

  const everyone = [
    ...grouped.map(({ entry }) => entry),
    ...outcome.didNotFinish,
    ...outcome.noShows,
  ]
  const gameCounts = new Set(rows.map((row) => row.games))

  return {
    id: division.id,
    number: division.number,
    name: division.name,
    entries: outcome.entryCount,
    showHandicap: everyone.some((entry) => entry.pins > 0),
    showGames: gameCounts.size > 1,
    rows,
    didNotFinish: outcome.didNotFinish.map((entry) => ({
      registrationId: entry.registrationId,
      name: entry.name,
      total: entry.total,
      highGame: entry.highGame,
      games: entry.games.length,
      handicap: entry.pins,
    })),
    noShows: outcome.noShows.map((entry) => ({
      registrationId: entry.registrationId,
      name: entry.name,
    })),
  }
}
