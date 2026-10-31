import { HttpError } from '../../shared/errors.ts'
import type { Logger } from '../../shared/logger.ts'
import { warnOnce } from '../../shared/warnOnce.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import type { Division } from '../divisions/types.ts'
import type { LaneRepository } from '../lanes/repository.ts'
import type { LaneEntry } from '../lanes/types.ts'
import type { ScoreRepository } from '../scores/repository.ts'
import type { ScoreRow } from '../scores/types.ts'
import type { SquadRepository } from '../squads/repository.ts'
import type { Squad } from '../squads/types.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import { toDivisionResult } from './divisionResult.ts'
import { buildResultEntries, squadPins, sweeperPins, type ResultEntry } from './entries.ts'
import { workOutDivision } from './squadResults.ts'
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

/** Where to say that a stored entry was left out, once per process for each `reported` set (D-51). */
interface Reporting {
  logger: Logger
  reported: Set<string>
}

// Ignores case and accents, as the database collation does (BWL-14).
const compareText = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' })

/**
 * D-83: a stored ratio of 0 or less cannot work out a result (legacy divides by zero). The save
 * screens refuse one, so only an old row can hold it.
 */
function requireRatios(subject: string, ratios: Record<string, number>): void {
  for (const [name, value] of Object.entries(ratios)) {
    if (value <= 0) {
      throw new HttpError(
        422,
        `${subject} ${name} ratio is ${value}, so results cannot be worked out. Set a ratio of 1 or more.`,
      )
    }
  }
}

function reportSkipped(
  { logger, reported }: Reporting,
  sessionId: string,
  skipped: readonly string[],
) {
  for (const registrationId of skipped) {
    warnOnce(
      reported,
      `${sessionId}:${registrationId}`,
      logger,
      { registrationId, sessionId },
      'Skipped a result entry whose division is not in this tournament',
    )
  }
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
  const index = all.findIndex((squad) => squad.id === sessionId)
  const squad = all[index]
  if (!squad) throw new HttpError(404, 'Squad not found')

  const upTo = all.slice(0, index + 1)
  for (const earlier of upTo) {
    requireRatios(earlier.id === sessionId ? "This squad's" : "An earlier squad's", {
      finals: earlier.finalsRatio,
      cash: earlier.cashRatio,
    })
  }

  const read = async (item: Squad) => ({
    squad: item,
    entries: await deps.lanes.listEntries(item.id),
    scores: await deps.scores.listScores(item.id),
  })
  const [divisions, earlierReads, current] = await Promise.all([
    deps.divisions.listByTournament(tournamentId),
    Promise.all(upTo.slice(0, index).map(read)),
    read(squad),
  ])
  const divisionById = new Map(divisions.map((division) => [division.id, division]))

  // The advancers of every squad before this one, in date order (RES-06). A bowler's division is
  // that of the current registration, and a bowler is in one division, so one set serves them all.
  const advancedBefore = new Set<string>()
  for (const earlier of earlierReads) {
    const { outcomes } = workOutSquad(earlier, divisions, advancedBefore)
    for (const { outcome } of outcomes) {
      for (const advancer of outcome.advancers) advancedBefore.add(advancer.bowlerId)
    }
  }

  const { outcomes, skipped } = workOutSquad(current, divisions, advancedBefore)
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
