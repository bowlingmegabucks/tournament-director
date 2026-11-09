import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { LaneWriter, SessionKind } from './writer.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid(), registrationId: z.uuid() })

/**
 * The first lane of the target pair, or `null` to take the bowler off the lanes (D-216). The
 * highest first lane is 199 (SQD-06, D-168). Whether it starts a pair of this session is the
 * plan's call, so the message can name the session.
 */
const body = z.strictObject({ lane: z.number().int().min(1).max(199).nullable() })

const sessionName = (kind: SessionKind) => (kind === 'squad' ? 'Squad' : 'Sweeper')

export interface LaneMoveDeps {
  writer: LaneWriter
  events: SessionEvents
  logger: Logger
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/lanes` and `/sweepers/:sessionId/lanes` for
 * `PUT /:registrationId`, behind `lanes.assign`; the API key cannot reach it (D-216, D-96). Web
 * only: the legacy API has no such route, so the vendor sees no change (D-09). What may move, and
 * to which seat, is `planLaneMove` (LAN-05, LAN-06, LAN-09, LAN-13, D-56); this router turns its
 * answer into HTTP and, after a write, tells every open screen of the session (D-217, D-219).
 */
export function createLaneMoveRouter(
  kind: SessionKind,
  { writer, events, logger }: LaneMoveDeps,
): Router {
  const router = Router({ mergeParams: true })
  const label = sessionName(kind)

  router.put('/:registrationId', jsonBody, async (req, res) => {
    const { id, sessionId, registrationId } = params.parse(req.params)
    const { lane } = body.parse(req.body)

    const outcome = await writer.move({
      tournamentId: id,
      kind,
      sessionId,
      registrationId,
      lane,
    })
    if ('notFound' in outcome) {
      throw new HttpError(
        404,
        outcome.notFound === 'tournament' ? 'Tournament not found' : `${label} not found`,
      )
    }

    // Ids and the lane only: never a name (api-observability).
    const ids = {
      actorId: callerOf(res).user?.id,
      tournamentId: id,
      [`${kind}Id`]: sessionId,
      registrationId,
    }
    const log = requestLogger(res, logger)
    switch (outcome.type) {
      case 'notOnSession':
        throw new HttpError(404, `Bowler is not registered for this ${kind}`)
      case 'refused':
        log.info(ids, `Lane move refused: ${kind} or tournament complete`)
        throw new HttpError(409, outcome.message)
      case 'full':
        log.info({ ...ids, lane }, 'Lane move refused: pair full')
        throw new HttpError(409, outcome.message)
      case 'badSeats':
        throw new HttpError(422, outcome.message)
      case 'badLane':
        throw new HttpError(400, outcome.message)
      case 'unchanged':
        res.json({ position: outcome.position })
        return
      case 'move':
        log.info({ ...ids, lane }, 'Lane assignment saved')
        // After the commit; a failed send is logged by the hub and never fails the save (D-219).
        events.publish(sessionId, 'lanes')
        res.json({ position: outcome.position })
    }
  })

  return router
}
