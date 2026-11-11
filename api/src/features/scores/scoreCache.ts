import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
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
  /** Forget the page of one session when only its id is known (an event carries no tournament). */
  dropSession(sessionId: string): void
  /** Forget the TV feed of one tournament (D-244). */
  dropTournament(tournamentId: string): void
}

export function createScoreCache(cacheMs = LIVE_CACHE_MS): ScoreCache {
  const cached = createTtlCache<unknown>(cacheMs)
  return {
    cached,
    drop: (tournamentId, sessionId) => {
      cached.drop(cacheKey(tournamentId, sessionId))
    },
    dropSession: (sessionId) => {
      const suffix = `/${cacheKey(sessionId)}`
      cached.dropWhere((key) => key.endsWith(suffix))
    },
    dropTournament: (tournamentId) => {
      cached.drop(cacheKey('live-results', tournamentId))
    },
  }
}

/**
 * The same events, but every message first drops the session's cached scores page. The page shows
 * lanes, entries, the complete flag, and scores, so any change a screen is told about makes the
 * cached page old. Dropping first means the refetch that follows gets the new page.
 */
export function dropCacheOnPublish(events: SessionEvents, cache: ScoreCache): SessionEvents {
  return {
    ...events,
    publish(sessionId, kind, detail) {
      cache.dropSession(sessionId)
      events.publish(sessionId, kind, detail)
    },
  }
}
