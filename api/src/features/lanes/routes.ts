import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../../shared/errors.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import type { SquadRepository } from '../squads/repository.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import { buildLanePage, type LaneSession } from './lanePage.ts'
import { MAX_SEATS, MIN_SEATS } from './positions.ts'
import type { LaneRepository } from './repository.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid() })

interface LaneRouterDeps {
  lanes: LaneRepository
  tournaments: TournamentRepository
  divisions: DivisionRepository
  logger: Logger
}

/** Finds one session of the tournament, as a `LaneSession`. Squad or sweeper, so the route is one handler. */
export type FindSession = (
  tournamentId: string,
  sessionId: string,
) => Promise<(LaneSession & { games: number }) | undefined>

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
    // An unknown tournament is a 404 and stops here, so a random id costs one query (as TRN-15).
    const tournament = await tournaments.get(id)
    if (!tournament) throw new HttpError(404, 'Tournament not found')
    const session = await findSession(id, sessionId)
    if (!session) throw new HttpError(404, `${label} not found`)
    // LAN-02, D-56: the page supports 2 to 5 seats a pair. Squad setup allows other values (Q-10).
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
    const { page, skipped, outsideLanes } = buildLanePage(session, entries, tournamentDivisions)

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
