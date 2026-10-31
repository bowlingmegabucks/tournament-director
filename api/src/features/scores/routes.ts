import { Router } from 'express'
import { z } from 'zod'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { createTtlCache, LIVE_CACHE_MS } from '../../shared/ttlCache.ts'
import { loadLanePage, type FindSession, type LanePageDeps } from '../lanes/loadLanePage.ts'
import { reportLanePageProblems } from '../lanes/reportProblems.ts'
import type { ScoreRepository } from './repository.ts'
import { buildScorePage } from './scorePage.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid() })

interface ScoreRouterDeps extends LanePageDeps {
  scores: ScoreRepository
  logger: Logger
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/scores` and `/sweepers/:sessionId/scores`
 * (SCR-16). Web only, not part of the vendor contract (D-09). Public for good (D-70): viewers who
 * are not signed in watch scores come in. It checks the tournament and session as the lane page
 * does, but not the pair size: any session shows its scores (D-73). The answer is kept for
 * `cacheMs` per session, so open tabs polling a live squad cost one database pass per window.
 */
export function createScoreRouter(
  kind: 'squad' | 'sweeper',
  findSession: FindSession,
  { lanes, tournaments, divisions, scores, logger }: ScoreRouterDeps,
  cacheMs = LIVE_CACHE_MS,
): Router {
  const router = Router({ mergeParams: true })
  const label = kind === 'squad' ? 'Squad' : 'Sweeper'
  // A bad stored row stays bad on every poll. Say so once per process (D-51, D-61).
  const reported = new Set<string>()
  const cached = createTtlCache<unknown>(cacheMs)

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = params.parse(req.params)
    res.json(
      await cached(`${id}/${sessionId}`, async () => {
        // Both reads start together. An unknown session still throws a 404 from the lane page, and the
        // score read is then dropped (its failure is ignored so it cannot go unhandled).
        const storedRead = scores.listScores(sessionId)
        storedRead.catch(() => undefined)
        const loaded = await loadLanePage(
          label,
          findSession,
          { lanes, tournaments, divisions },
          id,
          sessionId,
          { checkSeats: false },
        )
        const stored = await storedRead

        reportLanePageProblems(reported, requestLogger(res, logger), sessionId, loaded)
        return buildScorePage(loaded.page, loaded.entries, stored, loaded.session.games)
      }),
    )
  })

  return router
}
