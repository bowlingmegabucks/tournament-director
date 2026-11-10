import { useQuery } from '@tanstack/react-query'
import { retryUnlessFinal, type SessionKind } from '../../shared/session'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { fetchGames } from './gamesApi'

export const gamesKeys = {
  view: (kind: SessionKind, tournamentId: string, sessionId: string) =>
    [...tournamentKeys.detail(tournamentId), `${kind}s`, sessionId, 'scores', 'games'] as const,
}

/** The games of one session for score entry (SCR-22). It refreshes from the stream, not on a timer (D-232). */
export function useGames(kind: SessionKind, tournamentId: string, sessionId: string) {
  return useQuery({
    queryKey: gamesKeys.view(kind, tournamentId, sessionId),
    queryFn: () => fetchGames(kind, tournamentId, sessionId),
    retry: retryUnlessFinal,
  })
}
