import { cacheKey, createTtlCache, LIVE_CACHE_MS } from '../../shared/ttlCache.ts'

/**
 * The 5 s cache of the public scores page (D-70, `LIVE_CACHE_MS`), shared by the page's route and
 * the save route, so a save can drop the answer before it tells the screens to ask again (D-232).
 * Without the drop, a refetch inside the window would get the old page.
 */
export interface ScoreCache {
  cached: ReturnType<typeof createTtlCache<unknown>>
  /** Forget the page of one session. */
  drop(tournamentId: string, sessionId: string): void
}

export function createScoreCache(cacheMs = LIVE_CACHE_MS): ScoreCache {
  const cached = createTtlCache<unknown>(cacheMs)
  return {
    cached,
    drop: (tournamentId, sessionId) => {
      cached.drop(cacheKey(tournamentId, sessionId))
    },
  }
}
