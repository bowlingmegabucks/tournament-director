import { useQuery } from '@tanstack/react-query'
import { retryUnlessFinal } from '../../shared/session'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { fetchScores } from './api'
import type { SessionKind } from './types'

/**
 * How often the Scores tab asks again, until a push channel exists (D-72, Q-33). TanStack Query
 * pauses the timer while the tab is in the background, and a complete session does not ask again.
 */
export const SCORE_REFRESH_MS = 15_000

export const scoreKeys = {
  page: (kind: SessionKind, tournamentId: string, sessionId: string) =>
    [...tournamentKeys.detail(tournamentId), `${kind}s`, sessionId, 'scores'] as const,
}

export function useScores(kind: SessionKind, tournamentId: string, sessionId: string) {
  return useQuery({
    queryKey: scoreKeys.page(kind, tournamentId, sessionId),
    queryFn: () => fetchScores(kind, tournamentId, sessionId),
    retry: retryUnlessFinal,
    // A complete session cannot change (D-10), so it stops asking.
    refetchInterval: (query) => (query.state.data?.session.complete ? false : SCORE_REFRESH_MS),
  })
}
