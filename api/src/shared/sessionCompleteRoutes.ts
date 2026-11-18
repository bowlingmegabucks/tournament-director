import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { callerOf } from './auth/caller.ts'
import { FieldErrorsError, HttpError, WarningsError } from './errors.ts'
import { jsonBodyUpTo } from './jsonBody.ts'
import type { SessionEvents } from './events/sessionEvents.ts'
import type { LiveNotifier } from '../features/results/liveEvents.ts'
import type { Logger } from './logger.ts'
import { requestLogger } from './requestLogging.ts'
import type { SessionCompleter } from './sessionComplete.ts'
import type { SessionKind } from './sessionDelete.ts'
import type { SessionNotFound } from './sessionEdit.ts'

const idParams = z.object({ id: z.uuid(), sessionId: z.uuid() })
// Sent only to confirm a warning (D-297). No body at all is the same as not confirming.
const confirmBody = z.object({ confirmWarnings: z.boolean().optional() }).optional()

/**
 * How many handicap bowlers with scores have an average no director checked (AVG-18, D-297). The
 * routes ask before they complete and in the info the dialog reads.
 */
export type UnverifiedCounter = (tournamentId: string, sessionId: string) => Promise<number>

/** "Squad" or "Sweeper". */
const sessionName = (kind: SessionKind) => (kind === 'squad' ? 'Squad' : 'Sweeper')

function notFound(outcome: SessionNotFound, kind: SessionKind): HttpError {
  return new HttpError(
    404,
    outcome.notFound === 'tournament' ? 'Tournament not found' : `${sessionName(kind)} not found`,
  )
}

/** Tell a not-found answer from the info, which never holds a `notFound` key. */
function isNotFound(value: unknown): value is SessionNotFound {
  return typeof value === 'object' && value !== null && 'notFound' in value
}

/** The first message, for clients that show only one line. */
// Stryker disable next-line StringLiteral: a refusal always carries a message, so the fallback never shows.
const firstOf = (errors: Record<string, string>) => Object.values(errors)[0] ?? ''

/**
 * Mounted at `/v1/tournaments/:id/squads` or `/sweepers` for `POST /:sessionId/complete`, behind
 * `squads.write` (D-193). Web only: the legacy API has no such route, so the vendor sees no change
 * (D-09). What may be completed is `planSessionComplete` (D-192); this router only turns its
 * answer into HTTP. A squad answers `{ squad, noShowCount }`, a sweeper `{ sweeper }` (D-190, D-191).
 * With `unverified`, a session whose handicap bowlers bowled on unchecked averages answers `409` with
 * `warnings` until the caller sends `confirmWarnings: true` (AVG-18, D-297).
 */
export function createSessionCompleteRouter<Session>(
  completer: SessionCompleter<Session, unknown>,
  logger: Logger,
  kind: SessionKind,
  events: SessionEvents,
  live?: LiveNotifier,
  unverified?: UnverifiedCounter,
): Router {
  const router = Router({ mergeParams: true })

  /** Turn a not-found or a refusal into its HTTP answer. */
  function refuse(
    outcome: SessionNotFound | { refused: Record<string, string> },
    req: Request,
    res: Response,
  ): never {
    if ('notFound' in outcome) throw notFound(outcome, kind)
    const { id, sessionId } = idParams.parse(req.params)
    requestLogger(res, logger).warn(
      {
        actorId: callerOf(res).user?.id,
        tournamentId: id,
        [`${kind}Id`]: sessionId,
        reasons: Object.keys(outcome.refused).length,
      },
      `${sessionName(kind)} complete refused`,
    )
    throw new FieldErrorsError(409, firstOf(outcome.refused), outcome.refused)
  }

  router.post('/:sessionId/complete', jsonBodyUpTo('1kb'), async (req, res) => {
    const { id, sessionId } = idParams.parse(req.params)
    const body = confirmBody.parse(req.body)
    // A session that cannot be completed gets its real answer, not a warning about completing it.
    const early = await completer.check?.(id, sessionId)
    if (early) refuse(early, req, res)
    const unchecked = (await unverified?.(id, sessionId)) ?? 0
    if (unchecked > 0 && body?.confirmWarnings !== true) {
      const noun =
        unchecked === 1
          ? 'bowler with scores has an average'
          : 'bowlers with scores have an average'
      const message = `${unchecked} handicap ${noun} that is not verified. Once the ${kind} is complete, a later change to an average changes finished results and payouts.`
      requestLogger(res, logger).warn(
        { actorId: callerOf(res).user?.id, tournamentId: id, [`${kind}Id`]: sessionId, unchecked },
        `${sessionName(kind)} complete needs a confirm`,
      )
      throw new WarningsError(409, message, [{ field: 'average', message }], {
        unverifiedBowlers: unchecked,
      })
    }
    const outcome = await completer.complete(id, sessionId)
    if ('notFound' in outcome || 'refused' in outcome) refuse(outcome, req, res)
    const ids = { actorId: callerOf(res).user?.id, tournamentId: id, [`${kind}Id`]: sessionId }

    // Who completed what, and for a squad how many no-shows got zeros. The date stays out (D-193).
    requestLogger(res, logger).info(
      kind === 'squad' ? { ...ids, noShowCount: outcome.noShowCount } : ids,
      `${sessionName(kind)} completed`,
    )
    // Every open lane page drops to read only, and score pages stop asking (D-10, D-219).
    events.publish(sessionId, 'lanes')
    // The TV page shows the session as official now (RES-49).
    live?.completed(id, kind, sessionId)
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
  unverified?: UnverifiedCounter,
): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = idParams.parse(req.params)
    const info = await completer.getCompleteInfo(id, sessionId)
    if (isNotFound(info)) throw notFound(info, kind)
    // How many handicap bowlers with scores are on an unchecked average, so the dialog says so (D-297).
    const unverifiedBowlers = (await unverified?.(id, sessionId)) ?? 0
    res.json({ completeInfo: { ...info, unverifiedBowlers } })
  })

  return router
}
