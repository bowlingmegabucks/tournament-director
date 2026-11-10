import { HttpError } from '../../shared/errors.ts'
import { loadSuperSweeper } from './loadFinals.ts'
import { loadSweeperResults, toSquadResults, type ResultsDeps } from './loadResults.ts'
import { reportSkipped, requireRatios, type Reporting } from './resultHelpers.ts'
import { workOutSquads } from './squadFlow.ts'
import type { LiveResults } from './types.ts'

/**
 * RES-47, D-242, D-244: what the TV page loads once. Every squad of the tournament is worked out in
 * date order in one pass (each passes its advancers on, RES-06), then each sweeper and the super
 * sweeper, all through the last full game (D-239). A session with no scores is left out. The
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
  for (const squad of squads) {
    requireRatios("A squad's", { finals: squad.finalsRatio, cash: squad.cashRatio })
  }
  const flagged = await deps.dnf.listFlagged([
    ...squads.map((squad) => squad.id),
    ...sweepers.map((sweeper) => sweeper.id),
  ])
  const options = { mode: 'full-game' as const, flagged }

  const worked = await workOutSquads(deps, squads, divisions, options)
  const squadSessions = worked.flatMap((each) => {
    reportSkipped(reporting, each.squad.id, each.skipped)
    const results = toSquadResults(each.squad, each, divisions, 'full-game')
    return results.divisions.length > 0 ? [{ kind: 'squad' as const, results }] : []
  })

  const sweeperSessions = []
  for (const sweeper of sweepers) {
    const results = await loadSweeperResults(deps, reporting, tournamentId, sweeper.id, options)
    if (results.rows.length > 0) sweeperSessions.push({ kind: 'sweeper' as const, results })
  }

  const superSweeper = await loadSuperSweeper(deps, reporting, tournamentId, options).then(
    (results) => (results.rows.length > 0 ? results : null),
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
