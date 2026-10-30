import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../../shared/errors.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import { buildLanePage } from '../lanes/lanePage.ts'
import { MAX_SEATS, MIN_SEATS } from '../lanes/positions.ts'
import type { LaneRepository } from '../lanes/repository.ts'
import type { FindSession } from '../lanes/routes.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import { buildRecapSheets } from './recapSheets.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid() })

interface RecapRouterDeps {
  lanes: LaneRepository
  tournaments: TournamentRepository
  divisions: DivisionRepository
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/recap-sheets` and `/sweepers/:sessionId/recap-sheets`
 * (RPT-08). Web only, not part of the vendor contract (D-09). Public for 0.2.0; it moves behind
 * auth right after 0.3.0 (D-66, D-52). It reads the saved positions only (D-65). The lane route
 * logs the odd positions it finds, so this one adds no warning of its own.
 */
export function createRecapSheetRouter(
  kind: 'squad' | 'sweeper',
  findSession: FindSession,
  { lanes, tournaments, divisions }: RecapRouterDeps,
): Router {
  const router = Router({ mergeParams: true })
  const label = kind === 'squad' ? 'Squad' : 'Sweeper'

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = params.parse(req.params)
    const tournament = await tournaments.get(id)
    if (!tournament) throw new HttpError(404, 'Tournament not found')
    const session = await findSession(id, sessionId)
    if (!session) throw new HttpError(404, `${label} not found`)
    // The same limit as the lane page (LAN-02, D-56): the recap sheets follow its pairs.
    if (session.maxPerPair < MIN_SEATS || session.maxPerPair > MAX_SEATS) {
      throw new HttpError(
        422,
        `Bowlers per pair must be ${MIN_SEATS} to ${MAX_SEATS} to assign lanes`,
      )
    }

    const [entries, tournamentDivisions] = await Promise.all([
      lanes.listEntries(sessionId),
      divisions.listByTournament(id),
    ])
    const { page } = buildLanePage(session, entries, tournamentDivisions)
    res.json(buildRecapSheets(page, session.games))
  })

  return router
}
