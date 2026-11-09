import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../../shared/errors.ts'
import { createSessionEventsRouter } from '../../shared/events/sseRoute.ts'
import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { SquadRepository } from '../squads/repository.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import { loadLanePage, type FindSession, type LanePageDeps } from './loadLanePage.ts'
import { reportLanePageProblems } from './reportProblems.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid() })

interface LaneRouterDeps extends LanePageDeps {
  logger: Logger
}

export function findSquad(squads: SquadRepository): FindSession {
  return async (tournamentId, sessionId) => {
    const squad = (await squads.listByTournament(tournamentId)).find(
      (candidate) => candidate.id === sessionId,
    )
    return squad && { ...squad, kind: 'squad', bonusPins: [] }
  }
}

export function findSweeper(sweepers: SweeperRepository): FindSession {
  return async (tournamentId, sessionId) => {
    const sweeper = (await sweepers.listByTournament(tournamentId)).find(
      (candidate) => candidate.id === sessionId,
    )
    return sweeper && { ...sweeper, kind: 'sweeper' }
  }
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/lanes` and `/sweepers/:sessionId/lanes`. Web
 * only, not part of the vendor contract (D-09). Needs `lanes.read`; the API key cannot reach it
 * (D-59, D-52, D-105). `mergeParams` lets this router see the ids from the mount path.
 */
export function createLaneRouter(
  kind: 'squad' | 'sweeper',
  findSession: FindSession,
  { lanes, tournaments, divisions, logger }: LaneRouterDeps,
): Router {
  const router = Router({ mergeParams: true })
  const label = kind === 'squad' ? 'Squad' : 'Sweeper'
  // A position outside the lanes stays wrong on every visit. Say so once per process (D-61).
  const reported = new Set<string>()

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = params.parse(req.params)
    const { page, skipped, outsideLanes } = await loadLanePage(
      label,
      findSession,
      { lanes, tournaments, divisions },
      id,
      sessionId,
    )

    reportLanePageProblems(reported, requestLogger(res, logger), sessionId, {
      skipped,
      outsideLanes,
    })
    res.json(page)
  })

  return router
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/events` and the sweeper twin: the live stream
 * of one session (D-217). Needs `lanes.read`, like the page it keeps fresh. An unknown tournament
 * or session is a plain 404 before any stream opens.
 */
export function createLaneEventsRouter(
  kind: 'squad' | 'sweeper',
  findSession: FindSession,
  {
    tournaments,
    events,
    logger,
  }: {
    tournaments: LanePageDeps['tournaments']
    events: SessionEvents
    logger: Logger
  },
): Router {
  const label = kind === 'squad' ? 'Squad' : 'Sweeper'
  return createSessionEventsRouter({
    events,
    logger,
    check: async (tournamentId, sessionId) => {
      if (!(await tournaments.get(tournamentId))) {
        throw new HttpError(404, 'Tournament not found')
      }
      if (!(await findSession(tournamentId, sessionId))) {
        throw new HttpError(404, `${label} not found`)
      }
    },
  })
}
