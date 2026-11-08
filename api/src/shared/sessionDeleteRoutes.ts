import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from './auth/caller.ts'
import { FieldErrorsError, HttpError } from './errors.ts'
import type { Logger } from './logger.ts'
import { requestLogger } from './requestLogging.ts'
import type { SessionDeleter, SessionKind } from './sessionDelete.ts'
import type { SessionNotFound } from './sessionEdit.ts'

const idParams = z.object({ id: z.uuid(), sessionId: z.uuid() })

/** "Squad not found" or "Sweeper not found". */
const sessionName = (kind: SessionKind) => (kind === 'squad' ? 'Squad' : 'Sweeper')

function notFound(outcome: SessionNotFound, kind: SessionKind): HttpError {
  return new HttpError(
    404,
    outcome.notFound === 'tournament' ? 'Tournament not found' : `${sessionName(kind)} not found`,
  )
}

/** The first message, for clients that show only one line. */
// Stryker disable next-line StringLiteral: a refusal always carries a message, so the fallback never shows.
const firstOf = (errors: Record<string, string>) => Object.values(errors)[0] ?? ''

/**
 * Mounted at `/v1/tournaments/:id/squads` or `/sweepers` for `DELETE /:sessionId`, behind
 * `squads.write` (D-187). Web only: the legacy API has no such route, so the vendor sees no change
 * (D-09). What may be deleted is `planSessionDelete` (D-186); this router only turns its answer
 * into HTTP.
 */
export function createSessionDeleteRouter(
  deleter: SessionDeleter,
  logger: Logger,
  kind: SessionKind,
): Router {
  const router = Router({ mergeParams: true })

  router.delete('/:sessionId', async (req, res) => {
    const { id, sessionId } = idParams.parse(req.params)
    const outcome = await deleter.remove(id, sessionId)
    if ('notFound' in outcome) throw notFound(outcome, kind)
    const ids = {
      actorId: callerOf(res).user?.id,
      tournamentId: id,
      [`${kind}Id`]: sessionId,
    }
    if ('refused' in outcome) {
      requestLogger(res, logger).warn(
        { ...ids, reasons: Object.keys(outcome.refused).length },
        `${sessionName(kind)} delete refused`,
      )
      throw new FieldErrorsError(409, firstOf(outcome.refused), outcome.refused)
    }

    // Who deleted what. The date stays out of the log (D-189).
    requestLogger(res, logger).info(ids, `${sessionName(kind)} deleted`)
    res.status(204).end()
  })

  return router
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/delete-info` (or sweepers) for `GET`, behind
 * `squads.write` (D-188). It gets its own path so the group's permission check cannot reach the
 * public `:sessionId/...` reads (lanes, scores, results).
 */
export function createSessionDeleteInfoRouter(deleter: SessionDeleter, kind: SessionKind): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = idParams.parse(req.params)
    const info = await deleter.getDeleteInfo(id, sessionId)
    if ('notFound' in info) throw notFound(info, kind)
    res.json({ deleteInfo: info })
  })

  return router
}
