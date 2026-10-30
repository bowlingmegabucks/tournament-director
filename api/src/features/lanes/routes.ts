import { Router } from 'express'
import { z } from 'zod'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { SquadRepository } from '../squads/repository.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import { loadLanePage, type FindSession, type LanePageDeps } from './loadLanePage.ts'

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
 * only, not part of the vendor contract (D-09). Public for 0.2.0; it moves behind auth right after
 * 0.3.0 (D-59, D-52). `mergeParams` lets this router see the ids from the mount path.
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

    const log = requestLogger(res, logger)
    for (const registrationId of skipped) {
      warnOnce(
        reported,
        `division:${sessionId}:${registrationId}`,
        log,
        { registrationId, sessionId },
        'Skipped a lane entry whose division is not in this tournament',
      )
    }
    for (const registrationId of outsideLanes) {
      warnOnce(
        reported,
        `outside:${sessionId}:${registrationId}`,
        log,
        { registrationId, sessionId },
        'A lane position fits no pair of this session',
      )
    }
    res.json(page)
  })

  return router
}

function warnOnce(
  reported: Set<string>,
  key: string,
  log: Logger,
  fields: Record<string, unknown>,
  message: string,
): void {
  if (reported.has(key)) return
  reported.add(key)
  log.warn(fields, message)
}
