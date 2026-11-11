import type { Division } from '../divisions/types.ts'
import type { LaneRepository } from '../lanes/repository.ts'
import type { LaneEntry } from '../lanes/types.ts'
import type { ScoreRepository } from '../scores/repository.ts'
import type { ScoreRow } from '../scores/types.ts'
import type { Squad } from '../squads/types.ts'
import { buildResultEntries, squadPins, type ResultEntry } from './entries.ts'
import { limitToCountedGames, type RankMode } from './fullGame.ts'
import { workOutDivision, type DivisionOutcome } from './squadResults.ts'

export interface SquadFlowDeps {
  lanes: LaneRepository
  scores: ScoreRepository
}

interface SquadRead {
  squad: Squad
  entries: readonly LaneEntry[]
  scores: readonly ScoreRow[]
}

export interface FlowOptions {
  /** `live` (the default) counts every saved score; `full-game` counts the last full game (D-239). */
  mode?: RankMode
  /** Registrations flagged DNF, by session id (D-248). Only a squad that is not complete uses them. */
  flagged?: ReadonlyMap<string, ReadonlySet<string>>
}

const noFlags: ReadonlySet<string> = new Set()

/**
 * Work out each division of one squad that has an entry. In `full-game` mode an open squad counts
 * only the games every bowler of a division has (RES-40); a complete squad counts them all (RES-43).
 */
function workOutSquad(
  { squad, entries, scores }: SquadRead,
  divisions: readonly Division[],
  advancedBefore: ReadonlySet<string>,
  { mode = 'live', flagged }: FlowOptions,
) {
  const built = buildResultEntries(entries, scores, divisions, squadPins)
  const steady = mode === 'full-game' && !squad.complete
  const limited = steady
    ? limitToCountedGames(
        built.entries,
        (entry) => entry.divisionId,
        flagged?.get(squad.id) ?? noFlags,
        built.waiting,
      )
    : undefined
  const byDivision = new Map<string, ResultEntry[]>()
  for (const entry of limited?.entries ?? built.entries) {
    byDivision.set(entry.divisionId, [...(byDivision.get(entry.divisionId) ?? []), entry])
  }
  const outcomes = [...byDivision.entries()].map(([divisionId, list]) => ({
    divisionId,
    /** The games counted in this division: `null` in live mode, all the squad's games once it is complete. */
    throughGame: limited
      ? (limited.through.get(divisionId) ?? 0)
      : mode === 'full-game'
        ? squad.games
        : null,
    outcome: workOutDivision({
      entries: list,
      advancedBefore,
      finalsRatio: squad.finalsRatio,
      cashRatio: squad.cashRatio,
      games: squad.games,
      complete: squad.complete,
    }),
  }))
  return { outcomes, skipped: built.skipped }
}

/** One squad worked out, with the bowlers who advanced before it (RES-06). */
export interface WorkedSquad {
  squad: Squad
  /** Bowlers who advanced in an earlier squad of the tournament. */
  advancedBefore: ReadonlySet<string>
  outcomes: { divisionId: string; throughGame: number | null; outcome: DivisionOutcome }[]
  /** Registrations flagged DNF while the squad is open (D-248). Empty once it is complete. */
  flagged: ReadonlySet<string>
  /** Registrations with a score whose division is not one of the tournament's (D-51). */
  skipped: string[]
}

/**
 * RES-06: work out `squads`, which must be in date order (SQD-20, D-45), each passing its advancers
 * on to the next. Each squad uses the scores saved so far, complete or not (RES-01).
 */
export async function workOutSquads(
  deps: SquadFlowDeps,
  squads: readonly Squad[],
  divisions: readonly Division[],
  options: FlowOptions = {},
): Promise<WorkedSquad[]> {
  const reads = await Promise.all(
    squads.map(async (squad) => {
      const [entries, scores] = await Promise.all([
        deps.lanes.listEntries(squad.id),
        deps.scores.listScores(squad.id),
      ])
      return { squad, entries, scores }
    }),
  )
  const advanced = new Set<string>()
  return reads.map((read) => {
    const advancedBefore = new Set(advanced)
    const { outcomes, skipped } = workOutSquad(read, divisions, advancedBefore, options)
    for (const { outcome } of outcomes) {
      for (const advancer of outcome.advancers) advanced.add(advancer.bowlerId)
    }
    const flagged = read.squad.complete ? noFlags : (options.flagged?.get(read.squad.id) ?? noFlags)
    return { squad: read.squad, advancedBefore, outcomes, skipped, flagged }
  })
}
