import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from './auth/caller.ts'
import { FieldErrorsError, HttpError } from './errors.ts'
import type { Logger } from './logger.ts'
import { requestLogger } from './requestLogging.ts'
import type { SessionCompleter } from './sessionComplete.ts'
import type { SessionKind } from './sessionDelete.ts'
import type { SessionNotFound } from './sessionEdit.ts'

const idParams = z.object({ id: z.uuid(), sessionId: z.uuid() })

/** "Squad" or "Sweeper". */
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
 * Mounted at `/v1/tournaments/:id/squads` or `/sweepers` for `POST /:sessionId/complete`, behind
 * `squads.write` (D-193). Web only: the legacy API has no such route, so the vendor sees no change
 * (D-09). What may be completed is `planSessionComplete` (D-192); this router only turns its
 * answer into HTTP. A squad answers `{ squad, noShowCount }`, a sweeper `{ sweeper }` (D-190, D-191).
 */
export function createSessionCompleteRouter<Session>(
  completer: SessionCompleter<Session, unknown>,
  logger: Logger,
  kind: SessionKind,
): Router {
  const router = Router({ mergeParams: true })

  router.post('/:sessionId/complete', async (req, res) => {
    const { id, sessionId } = idParams.parse(req.params)
    const outcome = await completer.complete(id, sessionId)
    if ('notFound' in outcome) throw notFound(outcome, kind)
    const ids = { actorId: callerOf(res).user?.id, tournamentId: id, [`${kind}Id`]: sessionId }
    if ('refused' in outcome) {
      requestLogger(res, logger).warn(
        { ...ids, reasons: Object.keys(outcome.refused).length },
        `${sessionName(kind)} complete refused`,
      )
      throw new FieldErrorsError(409, firstOf(outcome.refused), outcome.refused)
    }

    // Who completed what, and for a squad how many no-shows got zeros. The date stays out (D-193).
    requestLogger(res, logger).info(
      kind === 'squad' ? { ...ids, noShowCount: outcome.noShowCount } : ids,
      `${sessionName(kind)} completed`,
    )
    res.json(
      kind === 'squad'
        ? { squad: outcome.completed, noShowCount: outcome.noShowCount }
        : { sweeper: outcome.completed },
    )
  })

  return router
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/complete-info` (or sweepers) for `GET`, behind
 * `squads.write` (D-194). It gets its own path so the group's permission check cannot reach the
 * public `:sessionId/...` reads (lanes, scores, results).
 */
export function createSessionCompleteInfoRouter<Info>(
  completer: SessionCompleter<unknown, Info>,
  kind: SessionKind,
): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = idParams.parse(req.params)
    const info = await completer.getCompleteInfo(id, sessionId)
    if (typeof info === 'object' && info !== null && 'notFound' in info) {
      throw notFound(info as SessionNotFound, kind)
    }
    res.json({ completeInfo: info })
  })

  return router
}
