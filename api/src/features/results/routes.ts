import { Router } from 'express'
import { z } from 'zod'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { loadSquadResults, loadSweeperResults, type ResultsDeps } from './loadResults.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid() })

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/results` and `/sweepers/:sessionId/results`
 * (RES-31). Web only, not part of the vendor contract (D-09). Public for good (D-74): viewers who
 * are not signed in watch the standings. An unknown tournament or session is a 404, a stored ratio
 * of 0 or less a 422 (D-83).
 */
export function createResultsRouter(
  kind: 'squad' | 'sweeper',
  deps: ResultsDeps & { logger: Logger },
): Router {
  const router = Router({ mergeParams: true })
  // A bad stored row stays bad on every poll. Say so once per process (D-51).
  const reported = new Set<string>()
  const load = kind === 'squad' ? loadSquadResults : loadSweeperResults

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = params.parse(req.params)
    const logger = requestLogger(res, deps.logger)
    res.json(await load(deps, { logger, reported }, id, sessionId))
  })

  return router
}
