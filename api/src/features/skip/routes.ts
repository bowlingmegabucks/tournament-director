import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { FindSession } from '../lanes/loadLanePage.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import { skipSchema, type SkipStore } from './store.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid() })
const body = z.strictObject({ skip: skipSchema })

export interface SkipRouterDeps {
  store: SkipStore
  findSession: FindSession
  tournaments: TournamentRepository
  events: SessionEvents
  logger: Logger
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/skip` and `/sweepers/:sessionId/skip` (SCR-23,
 * D-235). `GET` needs `lanes.read` and `PUT` needs `scores.write`; the mount lists each method on
 * its own, and the API key reaches neither. Web only: the legacy API has no such route, so the
 * vendor sees no change (D-09). A `PUT` on a complete session or tournament is a 409 (D-231) and
 * a change tells every open lane and entry page to ask again (D-218).
 */
export function createSkipRouter(
  kind: 'squad' | 'sweeper',
  { store, findSession, tournaments, events, logger }: SkipRouterDeps,
): Router {
  const router = Router({ mergeParams: true })
  const label = kind === 'squad' ? 'Squad' : 'Sweeper'

  /** The tournament, then the session, as every other session route checks them. */
  async function load(tournamentId: string, sessionId: string) {
    const tournament = await tournaments.getSettings(tournamentId)
    if (!tournament) throw new HttpError(404, 'Tournament not found')
    const session = await findSession(tournamentId, sessionId)
    if (!session) throw new HttpError(404, `${label} not found`)
    return { tournament, session }
  }

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = params.parse(req.params)
    await load(id, sessionId)
    res.json({ skip: await store.get(sessionId) })
  })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.put('/', jsonBody, async (req, res) => {
    const { id, sessionId } = params.parse(req.params)
    const { skip } = body.parse(req.body)
    const { tournament, session } = await load(id, sessionId)
    if (tournament.completed || session.complete) {
      requestLogger(res, logger).info(
        { actorId: callerOf(res).user?.id, tournamentId: id, [`${kind}Id`]: sessionId },
        `Skip change refused: ${kind} or tournament complete`,
      )
      throw new HttpError(409, `This ${kind} is complete. The skip cannot change.`)
    }

    const before = await store.get(sessionId)
    if (before !== skip) {
      await store.set(sessionId, skip)
      requestLogger(res, logger).info(
        { actorId: callerOf(res).user?.id, tournamentId: id, [`${kind}Id`]: sessionId, skip },
        'Skip changed',
      )
      // Lanes per game change, so every open lane and entry page asks again.
      events.publish(sessionId, 'lanes')
    }
    res.json({ skip })
  })

  return router
}
