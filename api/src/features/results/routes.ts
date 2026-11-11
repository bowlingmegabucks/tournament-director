import { Router } from 'express'
import { z } from 'zod'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { cacheKey, createTtlCache, LIVE_CACHE_MS } from '../../shared/ttlCache.ts'
import { createScoreCache, type ScoreCache } from '../scores/scoreCache.ts'
import { loadAtLarge, loadSeeding, loadSuperSweeper } from './loadFinals.ts'
import { loadLiveResults } from './loadLiveResults.ts'
import { loadSquadResults, loadSweeperResults, type ResultsDeps } from './loadResults.ts'
import type { RankMode } from './fullGame.ts'
import { rankModeSchema, type SquadResults } from './types.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid() })

/**
 * `?mode=` picks the ranking (RES-45, D-239): the steady `full-game` is the default. `?division=` keeps
 * one division of a squad (RES-48): the TV fetches only the division that changed. A bad value is a 400.
 */
const query = z.object({
  mode: rankModeSchema.default('full-game'),
  division: z.uuid().optional(),
})

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/results` and `/sweepers/:sessionId/results`
 * (RES-31). Web only, not part of the vendor contract (D-09). Public for good (D-74): viewers who
 * are not signed in watch the standings. An unknown tournament or session is a 404, a stored ratio
 * of 0 or less a 422 (D-83). The answer is kept for the cache's window per session and mode, so open
 * tabs on a live squad cost one database pass per window. It shares the scores page's cache (D-232):
 * a save drops every answer of its session, and the key ends with the session id so `dropSession` finds it.
 * The division filter cuts the cached answer, so one pass serves every division.
 */
export function createResultsRouter(
  kind: 'squad' | 'sweeper',
  deps: ResultsDeps & { logger: Logger },
  cache: ScoreCache = createScoreCache(),
): Router {
  const router = Router({ mergeParams: true })
  // A bad stored row stays bad on every poll. Say so once per process (D-51).
  const reported = new Set<string>()
  const load = kind === 'squad' ? loadSquadResults : loadSweeperResults

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = params.parse(req.params)
    const { mode, division } = query.parse(req.query)
    const logger = requestLogger(res, deps.logger)
    const answer = await cache.cached(cacheKey('results', mode, id, sessionId), () =>
      load(deps, { logger, reported }, id, sessionId, { mode }),
    )
    res.json(division && isSquadAnswer(answer) ? onlyDivision(answer, division) : answer)
  })

  return router
}

/** The cache holds either kind of answer; only a squad's has divisions. */
function isSquadAnswer(answer: unknown): answer is SquadResults {
  return typeof answer === 'object' && answer !== null && 'divisions' in answer
}

/** The answer with only one division of a squad. An id that is not in it leaves none (D-77). */
function onlyDivision(answer: SquadResults, divisionId: string): SquadResults {
  return { ...answer, divisions: answer.divisions.filter((item) => item.id === divisionId) }
}

const tournamentParams = z.object({ id: z.uuid() })

/** `?mode=` of the super sweeper (RES-45, D-252). The other finals pages ignore it. */
const finalsQuery = z.object({ mode: rankModeSchema.default('full-game') })

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
  const loadAnswer = {
    'at-large': (logger: Logger, id: string) => loadAtLarge(deps, { logger, reported }, id),
    seeding: (logger: Logger, id: string) => loadSeeding(deps, { logger, reported }, id),
    'super-sweeper': (logger: Logger, id: string, mode: RankMode) =>
      loadSuperSweeper(deps, { logger, reported }, id, { mode }),
  }[kind]

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id } = tournamentParams.parse(req.params)
    // Only the super sweeper has a ranking mode (D-252). At-large and seeding stay as they are (D-247).
    const { mode } = finalsQuery.parse(req.query)
    const logger = requestLogger(res, deps.logger)
    const key = kind === 'super-sweeper' ? cacheKey(id, mode) : cacheKey(id)
    res.json(await cached(key, () => loadAnswer(logger, id, mode)))
  })

  return router
}

/**
 * Mounted at `/v1/tournaments/:id/live-results` (RES-47). The TV page's first load: every squad,
 * sweeper, and the super sweeper, ranked through the last full game, in one answer (D-244). Web
 * only, not part of the vendor contract (D-09), and public (D-242). An unknown tournament is a 404,
 * a ratio of 0 or less a 422. It shares the scores page's cache (D-232), so a save, a flag, or a
 * complete drops it before the TV is told to ask again (`dropTournament`).
 */
export function createLiveResultsRouter(
  deps: ResultsDeps & { logger: Logger },
  cache: ScoreCache = createScoreCache(),
): Router {
  const router = Router({ mergeParams: true })
  // A bad stored row stays bad on every poll. Say so once per process (D-51).
  const reported = new Set<string>()

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id } = tournamentParams.parse(req.params)
    const logger = requestLogger(res, deps.logger)
    res.json(
      await cache.cached(cacheKey('live-results', id), () =>
        loadLiveResults(deps, { logger, reported }, id),
      ),
    )
  })

  return router
}
