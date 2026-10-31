import { HttpError } from '../../shared/errors.ts'
import type { Division } from '../divisions/types.ts'
import type { Squad } from '../squads/types.ts'
import {
  workOutAtLarge,
  workOutSeeding,
  type PlacedEntry,
  type SeedingOutcome,
  type SquadRun,
} from './finals.ts'
import type { ResultsDeps } from './loadResults.ts'
import { compareText, reportSkipped, requireRatios, type Reporting } from './resultHelpers.ts'
import { workOutSquads } from './squadFlow.ts'
import { buildSuperSweeperEntries, workOutSuperSweeper } from './superSweeper.ts'
import { markCashLine, markCutLine } from './ties.ts'
import type {
  AtLargeResults,
  SeedingResults,
  SuperSweeperResults,
  SuperSweeperRow,
} from './types.ts'

interface DivisionRuns {
  division: Division
  runs: SquadRun[]
}

interface TournamentRuns {
  finalsRatio: number
  /** True when there is at least one squad and every one is complete (D-88). */
  complete: boolean
  /** By name, then number. Only divisions with an entry in some squad. */
  divisions: DivisionRuns[]
}

/**
 * Work out every squad of the tournament in date order (RES-06), then group the outcomes by
 * division, each division's runs in squad order. At-large and seeding both start here (RES-12).
 */
async function loadRuns(
  deps: ResultsDeps,
  reporting: Reporting,
  tournamentId: string,
): Promise<TournamentRuns> {
  if (!(await deps.tournaments.get(tournamentId))) throw new HttpError(404, 'Tournament not found')
  const ratios = await deps.tournaments.getRatios(tournamentId)
  if (!ratios) throw new HttpError(404, 'Tournament not found')
  requireRatios("This tournament's", { finals: ratios.finalsRatio })

  const squads = await deps.squads.listByTournament(tournamentId)
  for (const squad of squads) {
    requireRatios("A squad's", { finals: squad.finalsRatio, cash: squad.cashRatio })
  }
  const divisions = await deps.divisions.listByTournament(tournamentId)
  const worked = await workOutSquads(deps, squads, divisions)
  for (const { squad, skipped } of worked) reportSkipped(reporting, squad.id, skipped)

  const divisionById = new Map(divisions.map((division) => [division.id, division]))
  const runsOf = new Map<string, SquadRun[]>()
  for (const { squad, outcomes } of worked) {
    for (const { divisionId, outcome } of outcomes) {
      const run: SquadRun = { squadId: squad.id, squadDate: squad.date, outcome }
      runsOf.set(divisionId, [...(runsOf.get(divisionId) ?? []), run])
    }
  }
  const grouped = [...runsOf.entries()].flatMap(([divisionId, runs]) => {
    const division = divisionById.get(divisionId)
    return division ? [{ division, runs }] : []
  })
  return {
    finalsRatio: ratios.finalsRatio,
    complete: squads.length > 0 && squads.every((squad: Squad) => squad.complete),
    divisions: grouped.toSorted(
      (a, b) =>
        compareText(a.division.name, b.division.name) || a.division.number - b.division.number,
    ),
  }
}

const entriesOf = (placed: readonly PlacedEntry[]) => placed.map((item) => item.entry)

/** RES-12 to RES-17, D-86, D-88, D-91: the at-large advancers of every division. */
export async function loadAtLarge(
  deps: ResultsDeps,
  reporting: Reporting,
  tournamentId: string,
): Promise<AtLargeResults> {
  const { finalsRatio, complete, divisions } = await loadRuns(deps, reporting, tournamentId)
  return {
    complete,
    finalsRatio,
    divisions: divisions.map(({ division, runs }) => {
      const outcome = workOutAtLarge(runs, finalsRatio)
      const marks = markCutLine(entriesOf(outcome.advancers), entriesOf(outcome.others))
      return {
        id: division.id,
        number: division.number,
        name: division.name,
        entries: outcome.entryCount,
        totalSpots: outcome.totalSpots,
        squadAdvancers: outcome.squadAdvancers,
        atLargeSpots: outcome.atLargeSpots,
        rows: outcome.advancers.map(({ entry, squadDate }, index) => ({
          registrationId: entry.registrationId,
          name: entry.name,
          place: index + 1,
          squadDate,
          total: entry.total,
          highGame: entry.highGame,
          previousCasher: outcome.previousCashers.has(entry.bowlerId),
          ties: marks.get(entry.registrationId) ?? [],
        })),
      }
    }),
  }
}

function seedingRows(seeding: SeedingOutcome) {
  const marks = markCutLine(entriesOf(seeding.finalists), entriesOf(seeding.others))
  const toRow = (item: PlacedEntry, seed: number, group: 'finalist' | 'other') => ({
    registrationId: item.entry.registrationId,
    name: item.entry.name,
    seed,
    group,
    squadDate: item.squadDate,
    total: item.entry.total,
    highGame: item.entry.highGame,
    handicap: item.entry.pins,
    previousCasher: seeding.previousCashers.has(item.entry.bowlerId),
    ties: marks.get(item.entry.registrationId) ?? [],
  })
  return [
    ...seeding.finalists.map((item, index) => toRow(item, index + 1, 'finalist')),
    ...seeding.others.map((item, index) =>
      toRow(item, seeding.finalists.length + index + 1, 'other'),
    ),
  ]
}

/** RES-18 to RES-21a, D-88, D-92: the finals seeding of every division. */
export async function loadSeeding(
  deps: ResultsDeps,
  reporting: Reporting,
  tournamentId: string,
): Promise<SeedingResults> {
  const { finalsRatio, complete, divisions } = await loadRuns(deps, reporting, tournamentId)
  return {
    complete,
    finalsRatio,
    divisions: divisions.map(({ division, runs }) => {
      const atLarge = workOutAtLarge(runs, finalsRatio)
      const seeding = workOutSeeding(runs, atLarge)
      const rows = seedingRows(seeding)
      return {
        id: division.id,
        number: division.number,
        name: division.name,
        entries: atLarge.entryCount,
        finalists: seeding.finalists.length,
        atLarge: atLarge.advancers.length,
        showHandicap: rows.some((row) => row.handicap > 0),
        rows,
      }
    }),
  }
}

/**
 * RES-26 to RES-29a, D-90, D-93: the super sweeper. One combined entry for each bowler who opted
 * in, one column for each sweeper, a missed sweeper scored as zero and tagged.
 */
export async function loadSuperSweeper(
  deps: ResultsDeps,
  reporting: Reporting,
  tournamentId: string,
): Promise<SuperSweeperResults> {
  if (!(await deps.tournaments.get(tournamentId))) throw new HttpError(404, 'Tournament not found')
  const ratios = await deps.tournaments.getRatios(tournamentId)
  if (!ratios) throw new HttpError(404, 'Tournament not found')
  // D-17, D-93: old tournaments may hold the legacy 0.
  requireRatios("This tournament's super sweeper", { cash: ratios.superSweeperCashRatio })

  const [sweepers, divisions] = await Promise.all([
    deps.sweepers.listByTournament(tournamentId),
    deps.divisions.listByTournament(tournamentId),
  ])
  const inputs = await Promise.all(
    sweepers.map(async (sweeper) => ({
      sweeper,
      entries: await deps.lanes.listEntries(sweeper.id),
      scores: await deps.scores.listScores(sweeper.id),
    })),
  )
  const built = buildSuperSweeperEntries(inputs, divisions)
  reportSkipped(reporting, tournamentId, built.skipped)
  const outcome = workOutSuperSweeper(built.entries, ratios.superSweeperCashRatio)
  const marks = markCashLine(
    outcome.cashers.map((item) => item.entry),
    outcome.others.map((item) => item.entry),
  )
  const toRow = (
    item: (typeof outcome.cashers)[number],
    index: number,
    group: 'casher' | 'other',
  ): SuperSweeperRow => ({
    registrationId: item.entry.registrationId,
    name: item.entry.name,
    place: index + 1,
    group,
    total: item.entry.total,
    highGame: item.entry.highGame,
    games: item.entry.games.length,
    ties: marks.get(item.entry.registrationId) ?? [],
    divisionName: item.entry.divisionName,
    sweeperTotals: item.sweeperTotals,
    flags: item.flags,
  })

  return {
    complete: sweepers.length > 0 && sweepers.every((sweeper) => sweeper.complete),
    cashRatio: ratios.superSweeperCashRatio,
    entries: outcome.entryCount,
    cashers: outcome.cashCount,
    cutScore: outcome.cutScore,
    sweepers: sweepers.map(({ id, date, games, complete }) => ({ id, date, games, complete })),
    rows: [
      ...outcome.cashers.map((item, index) => toRow(item, index, 'casher')),
      ...outcome.others.map((item, index) => toRow(item, outcome.cashCount + index, 'other')),
    ],
  }
}
