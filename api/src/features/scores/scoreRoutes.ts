import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { LiveNotifier } from '../results/liveEvents.ts'
import type { ScoreCache } from './scoreCache.ts'
import { totalOf } from './scorePlan.ts'
import type { ScoreChangeResult, ScoreWriter, SessionKind } from './scoreWriter.ts'

// The game is digits only: "3.5" and "abc" are a 400 before the plan sees them. 0 and a game above
// the session's games are the plan's call, so the message can name the games.
const params = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  registrationId: z.uuid(),
  game: z
    .string()
    .regex(/^\d{1,3}$/, 'Game must be a whole number')
    .transform(Number),
})

// The range is the plan's call (SCR-01); the body only has to hold a number.
const body = z.strictObject({ score: z.number() })

const sessionName = (kind: SessionKind) => (kind === 'squad' ? 'Squad' : 'Sweeper')

export interface ScoreWriteDeps {
  live: LiveNotifier
  writer: ScoreWriter
  cache: ScoreCache
  events: SessionEvents
  logger: Logger
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/scores` and `/sweepers/:sessionId/scores` for
 * `PUT` and `DELETE /:registrationId/:game`, behind `scores.write`; the API key cannot reach them
 * (SCR-19, D-228, D-96). Web only: the legacy API has no such route, so the vendor sees no change
 * (D-09). What may be saved is `planSave` and `planClear`; this router turns the answer into HTTP
 * and, after a change, drops the cached public page and tells every screen of the session (D-232).
 */
export function createScoreWriteRouter(
  kind: SessionKind,
  { live, writer, cache, events, logger }: ScoreWriteDeps,
): Router {
  const router = Router({ mergeParams: true })
  const label = sessionName(kind)

  /** The same answer for a save and a clear. */
  async function change(
    req: { params: unknown },
    res: Parameters<typeof requestLogger>[0],
    score: number | undefined,
  ) {
    const { id, sessionId, registrationId, game } = params.parse(req.params)
    // The counted games before the write, for the TV page (RES-49). Nothing if nobody watches.
    const before = await live.before(id, kind, sessionId)
    const outcome: ScoreChangeResult = await writer.change({
      tournamentId: id,
      kind,
      sessionId,
      registrationId,
      game,
      score,
    })
    if ('notFound' in outcome) {
      const messages = {
        tournament: 'Tournament not found',
        session: `${label} not found`,
        bowler: `Bowler is not registered for this ${kind}`,
      }
      throw new HttpError(404, messages[outcome.notFound])
    }

    const { plan } = outcome
    const ids = {
      actorId: callerOf(res).user?.id,
      tournamentId: id,
      [`${kind}Id`]: sessionId,
      registrationId,
      game,
    }
    const log = requestLogger(res, logger)
    switch (plan.type) {
      case 'invalid':
        throw new HttpError(400, plan.message)
      case 'refused':
        log.info(ids, 'Score change refused')
        throw new HttpError(409, plan.message)
      case 'missing':
        throw new HttpError(404, plan.message)
      case 'unchanged':
        return { scores: plan.scores, total: totalOf(plan.scores) }
      case 'save':
        log.info({ ...ids, filledGames: plan.filled.length }, 'Score saved')
        break
      case 'clear':
        log.info(ids, 'Score cleared')
        break
    }
    // Drop the cached public page first, or a screen that asks again at once gets the old one.
    cache.drop(id, sessionId)
    events.publish(sessionId, 'scores')
    await live.after(before)
    return { scores: plan.scores, total: totalOf(plan.scores) }
  }

  router.put('/:registrationId/:game', jsonBody, async (req, res) => {
    const { score } = body.parse(req.body)
    res.json(await change(req, res, score))
  })

  router.delete('/:registrationId/:game', async (req, res) => {
    res.json(await change(req, res, undefined))
  })

  return router
}
