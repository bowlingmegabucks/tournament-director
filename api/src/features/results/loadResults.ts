import { HttpError } from '../../shared/errors.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import type { Division } from '../divisions/types.ts'
import type { LaneRepository } from '../lanes/repository.ts'
import type { DnfStore } from '../dnf/store.ts'
import type { ScoreRepository } from '../scores/repository.ts'
import type { SquadRepository } from '../squads/repository.ts'
import type { Squad } from '../squads/types.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import { toDivisionResult } from './divisionResult.ts'
import { buildResultEntries, sweeperPins, type ResultEntry } from './entries.ts'
import { limitToCountedGames, type RankMode } from './fullGame.ts'
import { compareText, reportSkipped, requireRatios, type Reporting } from './resultHelpers.ts'
import { workOutSquads, type FlowOptions, type WorkedSquad } from './squadFlow.ts'
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
  dnf: DnfStore
}

/** What the results routes pass on: the ranking mode (D-239) and the DNF flags (D-248). */
export type ResultsOptions = FlowOptions

/**
 * One worked squad as the page reads it: each division with its rows, lines, and counted games
 * (RES-10, RES-40). The one-squad route and the TV feed both draw it.
 */
export function toSquadResults(
  squad: Squad,
  worked: WorkedSquad,
  divisions: readonly Division[],
  mode: RankMode,
): SquadResults {
  const { outcomes, advancedBefore, flagged } = worked
  // The advancers of every squad before this one decide who is an earlier advancer (RES-06).
  const divisionById = new Map(divisions.map((division) => [division.id, division]))
  const results = outcomes.flatMap(({ divisionId, outcome, throughGame }) => {
    const division = divisionById.get(divisionId)
    if (!division) return []
    return [
      toDivisionResult(
        division,
        outcome,
        markTies(outcome, advancedBefore),
        advancedBefore,
        throughGame,
        flagged,
      ),
    ]
  })
  return {
    session: {
      id: squad.id,
      kind: 'squad',
      date: squad.date,
      complete: squad.complete,
      games: squad.games,
    },
    mode,
    finalsRatio: squad.finalsRatio,
    cashRatio: squad.cashRatio,
    divisions: results.toSorted((a, b) => compareText(a.name, b.name) || a.number - b.number),
  }
}

/**
 * RES-01 to RES-11b, D-75, D-81: the results of one squad, division by division.
 * `options.mode` is `live` unless it says `full-game` (RES-40).
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
  options: ResultsOptions = {},
): Promise<SquadResults> {
  if (!(await deps.tournaments.get(tournamentId))) throw new HttpError(404, 'Tournament not found')
  const [all, divisions] = await Promise.all([
    deps.squads.listByTournament(tournamentId),
    deps.divisions.listByTournament(tournamentId),
  ])
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

  const flagged = options.flagged ?? (await deps.dnf.listFlagged(upTo.map((item) => item.id)))
  const worked = await workOutSquads(deps, upTo, divisions, { ...options, flagged })
  const current = worked[index]
  // Stryker disable next-line all: unreachable. `worked` has one entry for each squad up to this one.
  if (!current) throw new HttpError(404, 'Squad not found')
  reportSkipped(reporting, sessionId, current.skipped)
  return toSquadResults(squad, current, divisions, options.mode ?? 'live')
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
  options: ResultsOptions = {},
): Promise<SweeperResults> {
  if (!(await deps.tournaments.get(tournamentId))) throw new HttpError(404, 'Tournament not found')
  const sweepers = await deps.sweepers.listByTournament(tournamentId)
  const sweeper = sweepers.find((item) => item.id === sessionId)
  if (!sweeper) throw new HttpError(404, 'Sweeper not found')
  requireRatios("This sweeper's", { cash: sweeper.cashRatio })

  const [divisions, entries, scores, flaggedBySession] = await Promise.all([
    deps.divisions.listByTournament(tournamentId),
    deps.lanes.listEntries(sessionId),
    deps.scores.listScores(sessionId),
    options.flagged ?? deps.dnf.listFlagged([sessionId]),
  ])
  // D-248: a flag counts only while the sweeper is open.
  const flagged = sweeper.complete
    ? new Set<string>()
    : (flaggedBySession.get(sessionId) ?? new Set<string>())
  const built = buildResultEntries(entries, scores, divisions, sweeperPins(sweeper.bonusPins))
  reportSkipped(reporting, sessionId, built.skipped)

  // RES-41: an open sweeper counts the games every bowler in it has; a complete one counts them all.
  const mode: RankMode = options.mode ?? 'live'
  const limited =
    mode === 'full-game' && !sweeper.complete
      ? limitToCountedGames(built.entries, () => 'sweeper', flagged)
      : undefined
  const outcome = workOutSweeper(limited?.entries ?? built.entries, sweeper.cashRatio)
  const marks = markCashLine(outcome.cashers, outcome.others)
  const toRow = (entry: ResultEntry, index: number, group: 'casher' | 'other') => ({
    registrationId: entry.registrationId,
    name: entry.name,
    place: index + 1,
    group,
    total: entry.total,
    games: entry.games.length,
    ties: marks.get(entry.registrationId) ?? [],
    divisionName: entry.divisionName,
    bonusPins: entry.pins,
    scores: entry.gameScores,
    dnf: flagged.has(entry.registrationId),
  })

  return {
    session: {
      id: sweeper.id,
      kind: 'sweeper',
      date: sweeper.date,
      complete: sweeper.complete,
      games: sweeper.games,
    },
    mode,
    throughGame: limited
      ? (limited.through.get('sweeper') ?? 0)
      : mode === 'full-game'
        ? sweeper.games
        : null,
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
