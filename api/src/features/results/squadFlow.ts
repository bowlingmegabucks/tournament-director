import type { Division } from '../divisions/types.ts'
import type { LaneRepository } from '../lanes/repository.ts'
import type { LaneEntry } from '../lanes/types.ts'
import type { ScoreRepository } from '../scores/repository.ts'
import type { ScoreRow } from '../scores/types.ts'
import type { Squad } from '../squads/types.ts'
import { buildResultEntries, squadPins, type ResultEntry } from './entries.ts'
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

/** Work out each division of one squad that has an entry. */
function workOutSquad(
  { squad, entries, scores }: SquadRead,
  divisions: readonly Division[],
  advancedBefore: ReadonlySet<string>,
) {
  const built = buildResultEntries(entries, scores, divisions, squadPins)
  const byDivision = new Map<string, ResultEntry[]>()
  for (const entry of built.entries) {
    byDivision.set(entry.divisionId, [...(byDivision.get(entry.divisionId) ?? []), entry])
  }
  const outcomes = [...byDivision.entries()].map(([divisionId, list]) => ({
    divisionId,
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
  outcomes: { divisionId: string; outcome: DivisionOutcome }[]
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
    const { outcomes, skipped } = workOutSquad(read, divisions, advancedBefore)
    for (const { outcome } of outcomes) {
      for (const advancer of outcome.advancers) advanced.add(advancer.bowlerId)
    }
    return { squad: read.squad, advancedBefore, outcomes, skipped }
  })
}
