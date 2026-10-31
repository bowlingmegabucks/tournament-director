import { HttpError } from '../../shared/errors.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import type { LaneRepository } from '../lanes/repository.ts'
import type { ScoreRepository } from '../scores/repository.ts'
import type { SquadRepository } from '../squads/repository.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import { toDivisionResult } from './divisionResult.ts'
import { buildResultEntries, sweeperPins, type ResultEntry } from './entries.ts'
import { compareText, reportSkipped, requireRatios, type Reporting } from './resultHelpers.ts'
import { workOutSquads } from './squadFlow.ts'
import { workOutSweeper } from './sweeperResults.ts'
import { markCashLine, markTies } from './ties.ts'
import type { SquadResults, SweeperResults } from './types.ts'

export interface ResultsDeps {
  tournaments: TournamentRepository
  divisions: DivisionRepository
  squads: SquadRepository
  sweepers: SweeperRepository
  lanes: LaneRepository
  scores: ScoreRepository
}

/**
 * RES-01 to RES-11b, D-75, D-81: the results of one squad, division by division.
 *
 * Earlier advancers (RES-06) need the result of every squad before this one, so the squads up to
 * and including this one are worked out in date order (SQD-20, D-45), each passing its advancers on.
 * Each squad uses the scores saved so far, complete or not (RES-01). A later squad is never read.
 */
export async function loadSquadResults(
  deps: ResultsDeps,
  reporting: Reporting,
  tournamentId: string,
  sessionId: string,
): Promise<SquadResults> {
  if (!(await deps.tournaments.get(tournamentId))) throw new HttpError(404, 'Tournament not found')
  const all = await deps.squads.listByTournament(tournamentId)
  const index = all.findIndex((item) => item.id === sessionId)
  const squad = all[index]
  if (!squad) throw new HttpError(404, 'Squad not found')

  const upTo = all.slice(0, index + 1)
  for (const earlier of upTo) {
    requireRatios(earlier.id === sessionId ? "This squad's" : "An earlier squad's", {
      finals: earlier.finalsRatio,
      cash: earlier.cashRatio,
    })
  }

  const divisions = await deps.divisions.listByTournament(tournamentId)
  const worked = await workOutSquads(deps, upTo, divisions)
  const current = worked[index]
  // Stryker disable next-line all: unreachable. `worked` has one entry for each squad up to this one.
  if (!current) throw new HttpError(404, 'Squad not found')
  const { outcomes, skipped, advancedBefore } = current
  // The advancers of every squad before this one decide who is an earlier advancer (RES-06).
  const divisionById = new Map(divisions.map((division) => [division.id, division]))
  reportSkipped(reporting, sessionId, skipped)
  const results = outcomes.flatMap(({ divisionId, outcome }) => {
    const division = divisionById.get(divisionId)
    if (!division) return []
    return [toDivisionResult(division, outcome, markTies(outcome, advancedBefore), advancedBefore)]
  })
  return {
    session: {
      id: squad.id,
      kind: 'squad',
      date: squad.date,
      complete: squad.complete,
      games: squad.games,
    },
    finalsRatio: squad.finalsRatio,
    cashRatio: squad.cashRatio,
    divisions: results.toSorted((a, b) => compareText(a.name, b.name) || a.number - b.number),
  }
}

/**
 * RES-22 to RES-25a: the results of one sweeper, one list for everyone with a score, with each
 * division's bonus pins in the totals (SCR-09).
 */
export async function loadSweeperResults(
  deps: ResultsDeps,
  reporting: Reporting,
  tournamentId: string,
  sessionId: string,
): Promise<SweeperResults> {
  if (!(await deps.tournaments.get(tournamentId))) throw new HttpError(404, 'Tournament not found')
  const sweepers = await deps.sweepers.listByTournament(tournamentId)
  const sweeper = sweepers.find((item) => item.id === sessionId)
  if (!sweeper) throw new HttpError(404, 'Sweeper not found')
  requireRatios("This sweeper's", { cash: sweeper.cashRatio })

  const [divisions, entries, scores] = await Promise.all([
    deps.divisions.listByTournament(tournamentId),
    deps.lanes.listEntries(sessionId),
    deps.scores.listScores(sessionId),
  ])
  const built = buildResultEntries(entries, scores, divisions, sweeperPins(sweeper.bonusPins))
  reportSkipped(reporting, sessionId, built.skipped)

  const outcome = workOutSweeper(built.entries, sweeper.cashRatio)
  const marks = markCashLine(outcome.cashers, outcome.others)
  const toRow = (entry: ResultEntry, index: number, group: 'casher' | 'other') => ({
    registrationId: entry.registrationId,
    name: entry.name,
    place: index + 1,
    group,
    total: entry.total,
    highGame: entry.highGame,
    games: entry.games.length,
    ties: marks.get(entry.registrationId) ?? [],
    divisionName: entry.divisionName,
    bonusPins: entry.pins,
  })

  return {
    session: {
      id: sweeper.id,
      kind: 'sweeper',
      date: sweeper.date,
      complete: sweeper.complete,
      games: sweeper.games,
    },
    cashRatio: sweeper.cashRatio,
    entries: outcome.entryCount,
    cashers: outcome.cashCount,
    cutScore: outcome.cutScore,
    rows: [
      ...outcome.cashers.map((entry, index) => toRow(entry, index, 'casher')),
      ...outcome.others.map((entry, index) => toRow(entry, outcome.cashCount + index, 'other')),
    ],
  }
}
