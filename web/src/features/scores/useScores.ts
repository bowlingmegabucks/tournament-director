import { useQuery } from '@tanstack/react-query'
import { retryUnlessFinal } from '../../shared/session'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { fetchScores } from './api'
import type { SessionKind } from './types'

export const scoreKeys = {
  page: (kind: SessionKind, tournamentId: string, sessionId: string) =>
    [...tournamentKeys.detail(tournamentId), `${kind}s`, sessionId, 'scores'] as const,
}

/**
 * The Scores page of one session. It no longer polls (D-72): `useScoreEvents` refetches it when the
 * public stream says something changed (D-232).
 */
export function useScores(kind: SessionKind, tournamentId: string, sessionId: string) {
  return useQuery({
    queryKey: scoreKeys.page(kind, tournamentId, sessionId),
    queryFn: () => fetchScores(kind, tournamentId, sessionId),
    retry: retryUnlessFinal,
  })
}
