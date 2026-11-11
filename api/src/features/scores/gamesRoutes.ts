import { Router } from 'express'
import { z } from 'zod'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { Logger } from '../../shared/logger.ts'
import { loadLanePage, type FindSession, type LanePageDeps } from '../lanes/loadLanePage.ts'
import { reportLanePageProblems } from '../lanes/reportProblems.ts'
import type { DnfStore } from '../dnf/store.ts'
import type { SkipStore } from '../skip/store.ts'
import { buildGamesView } from './gamesView.ts'
import type { ScoreRepository } from './repository.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid() })

interface GamesRouterDeps extends LanePageDeps {
  scores: ScoreRepository
  skipStore: SkipStore
  dnfStore: DnfStore
  logger: Logger
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/scores/games` and the `/sweepers/` twin
 * (SCR-22, D-234). Needs `scores.write`; the API key cannot reach it. Web only (D-09). It is not
 * cached: a keeper saves a score and asks again at once. It checks the session as the lane page
 * does, including the 422 for a pairs setting that cannot seat anyone (LAN-02), since the lane
 * for each game needs real pairs.
 */
export function createGamesRouter(
  kind: 'squad' | 'sweeper',
  findSession: FindSession,
  { lanes, tournaments, divisions, scores, skipStore, dnfStore, logger }: GamesRouterDeps,
): Router {
  const router = Router({ mergeParams: true })
  const label = kind === 'squad' ? 'Squad' : 'Sweeper'
  // A bad stored row stays bad on every call. Say so once per process (D-51, D-61).
  const reported = new Set<string>()

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = params.parse(req.params)
    const storedRead = scores.listScores(sessionId)
    storedRead.catch(() => undefined)
    const loaded = await loadLanePage(
      label,
      findSession,
      { lanes, tournaments, divisions },
      id,
      sessionId,
    )
    const [stored, skip, flagged] = await Promise.all([
      storedRead,
      skipStore.get(sessionId),
      dnfStore.listFlagged([sessionId]),
    ])
    reportLanePageProblems(reported, requestLogger(res, logger), sessionId, loaded)
    res.json(
      buildGamesView(
        loaded.page,
        loaded.entries,
        stored,
        loaded.session.games,
        skip,
        flagged.get(sessionId),
      ),
    )
  })

  return router
}
