import { Router } from 'express'
import { z } from 'zod'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { cacheKey, createTtlCache, LIVE_CACHE_MS } from '../../shared/ttlCache.ts'
import { loadAtLarge, loadSeeding, loadSuperSweeper } from './loadFinals.ts'
import { loadSquadResults, loadSweeperResults, type ResultsDeps } from './loadResults.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid() })

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/results` and `/sweepers/:sessionId/results`
 * (RES-31). Web only, not part of the vendor contract (D-09). Public for good (D-74): viewers who
 * are not signed in watch the standings. An unknown tournament or session is a 404, a stored ratio
 * of 0 or less a 422 (D-83). The answer is kept for `cacheMs` per session, as the finals pages do,
 * so open tabs polling a live squad cost one database pass per window.
 */
export function createResultsRouter(
  kind: 'squad' | 'sweeper',
  deps: ResultsDeps & { logger: Logger },
  cacheMs = LIVE_CACHE_MS,
): Router {
  const router = Router({ mergeParams: true })
  // A bad stored row stays bad on every poll. Say so once per process (D-51).
  const reported = new Set<string>()
  const cached = createTtlCache<unknown>(cacheMs)
  const load = kind === 'squad' ? loadSquadResults : loadSweeperResults

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = params.parse(req.params)
    const logger = requestLogger(res, deps.logger)
    res.json(
      await cached(cacheKey(id, sessionId), () => load(deps, { logger, reported }, id, sessionId)),
    )
  })

  return router
}

const tournamentParams = z.object({ id: z.uuid() })

/**
 * Each finals page works out every squad of the tournament, and viewers poll every 15 seconds, so
 * the answer is kept for `cacheMs` (`LIVE_CACHE_MS`): ten viewers cost one pass, not ten.
 *
 * Mounted at `/v1/tournaments/:id/at-large`, `/seeding`, and `/super-sweeper` (RES-37). Web only,
 * not part of the vendor contract (D-09), and public for good (D-85). An unknown tournament is a
 * 404, a ratio of 0 or less a 422 (D-93).
 */
export function createFinalsRouter(
  kind: 'at-large' | 'seeding' | 'super-sweeper',
  deps: ResultsDeps & { logger: Logger },
  cacheMs = LIVE_CACHE_MS,
): Router {
  const router = Router({ mergeParams: true })
  // A bad stored row stays bad on every poll. Say so once per process (D-51).
  const reported = new Set<string>()
  const cached = createTtlCache<unknown>(cacheMs)
  const load = { 'at-large': loadAtLarge, seeding: loadSeeding, 'super-sweeper': loadSuperSweeper }[
    kind
  ]

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id } = tournamentParams.parse(req.params)
    const logger = requestLogger(res, deps.logger)
    res.json(await cached(cacheKey(id), () => load(deps, { logger, reported }, id)))
  })

  return router
}
