import { amountsFor } from '../payouts/amounts.ts'
import { HttpError } from '../../shared/errors.ts'
import { loadSuperSweeper } from './loadFinals.ts'
import { loadSweeperResults, toSquadResults, type ResultsDeps } from './loadResults.ts'
import { reportSkipped, requireRatios, type Reporting } from './resultHelpers.ts'
import { workOutSquads } from './squadFlow.ts'
import type { LiveResults } from './types.ts'

/**
 * RES-47, D-242, D-244: what the TV page loads once. Every squad of the tournament is worked out in
 * date order in one pass (each passes its advancers on, RES-06), then each sweeper and the super
 * sweeper, all through the last full game (D-239). A division or sweeper with no counted game yet
 * (someone entered has not bowled game 1) is left out, and so is a session with no scores. The
 * super sweeper is `null` when it has no rows, or when its cash ratio cannot work (D-93): a bad
 * ratio there must not blank the squads on the screen, so it is logged and skipped. A bad ratio in
 * a squad or sweeper is the 422 of the other routes (D-83).
 */
export async function loadLiveResults(
  deps: ResultsDeps,
  reporting: Reporting,
  tournamentId: string,
): Promise<LiveResults> {
  const tournament = await deps.tournaments.get(tournamentId)
  if (!tournament) throw new HttpError(404, 'Tournament not found')
  const [squads, sweepers, divisions] = await Promise.all([
    deps.squads.listByTournament(tournamentId),
    deps.sweepers.listByTournament(tournamentId),
    deps.divisions.listByTournament(tournamentId),
  ])
  const [flagged, payouts] = await Promise.all([
    deps.dnf.listFlagged([
      ...squads.map((squad) => squad.id),
      ...sweepers.map((sweeper) => sweeper.id),
    ]),
    // Read once for every squad, sweeper, and the super sweeper (PAY-20).
    deps.payouts.listAmounts(tournamentId),
  ])
  const options = { mode: 'full-game' as const, flagged, payouts }

  const worked = await workOutSquads(deps, squads, divisions, options)
  const squadSessions = worked.flatMap((each) => {
    reportSkipped(reporting, each.squad.id, each.skipped)
    const all = toSquadResults(
      each.squad,
      each,
      divisions,
      'full-game',
      amountsFor(payouts, 'squad', each.squad.id),
    )
    // A division shows only once everyone in it has bowled game 1 (RES-40); its later games show
    // as the Results tab shows them.
    const results = { ...all, divisions: all.divisions.filter((each) => each.throughGame !== 0) }
    if (results.divisions.length === 0) return []
    // Only a squad that shows on the screen needs working ratios: an empty one with a bad ratio
    // must not blank the rest (D-83 still holds for a squad with scores).
    requireRatios("A squad's", { finals: each.squad.finalsRatio, cash: each.squad.cashRatio })
    return [{ kind: 'squad' as const, results }]
  })

  // The sweepers are independent reads, so they run together.
  const sweeperResults = await Promise.all(
    sweepers.map((sweeper) =>
      loadSweeperResults(deps, reporting, tournamentId, sweeper.id, options),
    ),
  )
  const sweeperSessions = sweeperResults.flatMap((results) =>
    // A sweeper shows only once everyone in it has bowled game 1, like a division.
    results.rows.length > 0 && results.throughGame !== 0
      ? [{ kind: 'sweeper' as const, results }]
      : [],
  )

  const superSweeper = await loadSuperSweeper(deps, reporting, tournamentId, options).then(
    // The super sweeper shows once any of its sweepers has a counted game.
    (results) =>
      results.rows.length > 0 && results.sweepers.some((sweeper) => (sweeper.throughGame ?? 0) > 0)
        ? results
        : null,
    (error: unknown) => {
      if (!(error instanceof HttpError) || error.status !== 422) throw error
      reporting.logger.warn({ tournamentId }, 'The super sweeper is left out of the live results')
      return null
    },
  )

  return {
    tournament: { id: tournament.id, name: tournament.name },
    generatedAt: new Date().toISOString(),
    sessions: [...squadSessions, ...sweeperSessions],
    superSweeper,
  }
}
