import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { FieldErrorsError, HttpError } from '../../shared/errors.ts'
import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { LiveNotifier } from '../results/liveEvents.ts'
import type { TournamentWriter } from './writer.ts'

const idParams = z.object({ id: z.uuid() })

/**
 * Mounted at `/v1/tournaments/:id/complete` for `POST`, behind `tournaments.write` (D-256). Web
 * only: the legacy API has no such route (D-09). What may be completed is `planComplete` (D-257);
 * this router turns its answer into HTTP and tells the pages that show a closed session.
 */
export function createTournamentCompleteRouter(
  writer: TournamentWriter,
  logger: Logger,
  events: SessionEvents,
  live?: LiveNotifier,
): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.post('/', async (req, res) => {
    const { id } = idParams.parse(req.params)
    const outcome = await writer.complete(id)
    if ('notFound' in outcome) throw new HttpError(404, 'Tournament not found')
    const actorId = callerOf(res).user?.id
    if ('refused' in outcome) {
      requestLogger(res, logger).warn(
        { actorId, tournamentId: id, reasons: Object.keys(outcome.refused).length },
        'Tournament complete refused',
      )
      // The first line is the message; `errors` holds them all.
      // Stryker disable next-line StringLiteral: the fallback never shows, since a refusal has a reason.
      const message = Object.values(outcome.refused)[0]?.split('\n')[0] ?? ''
      throw new FieldErrorsError(409, message, outcome.refused)
    }

    const { squadsCompleted, sweepersCompleted, noShowCount, closed } = outcome.completed
    // Who completed what, in counts. The name stays out (D-256).
    requestLogger(res, logger).info(
      { actorId, tournamentId: id, squadsCompleted, sweepersCompleted, noShowCount },
      'Tournament completed',
    )
    for (const session of closed) {
      // Every open lane page drops to read only, and score pages stop asking (D-10, D-219).
      events.publish(session.id, 'lanes')
      live?.completed(id, session.kind, session.id)
    }
    res.json({ completed: true, squadsCompleted, sweepersCompleted, noShowCount })
  })

  return router
}

/**
 * Mounted at `/v1/tournaments/:id/complete-info` for `GET`, behind `tournaments.write` (D-259). Its
 * own path keeps the group's permission off the public tournament reads.
 */
export function createTournamentCompleteInfoRouter(writer: TournamentWriter): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id } = idParams.parse(req.params)
    const info = await writer.getCompleteInfo(id)
    if ('notFound' in info) throw new HttpError(404, 'Tournament not found')
    res.json({ completeInfo: info })
  })

  return router
}
