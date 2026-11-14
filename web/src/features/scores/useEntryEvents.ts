import { useQueryClient } from '@tanstack/react-query'
import { useEventStream, type LiveState } from '../../shared/useEventStream'
import type { SessionKind } from './types'
import { gamesKeys } from './useGames'

/**
 * Keeps the entry screens fresh from the public stream of one session (SCR-20, D-232): every
 * `changed` message, and a reconnect after a drop, refetches the games. A keeper's own save comes
 * back as a message too, and refetches to what the screen already shows. `enabled` is false for a
 * complete session (D-10). The stream itself is `useEventStream`.
 */
export function useEntryEvents(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  enabled: boolean,
): LiveState {
  const queryClient = useQueryClient()
  const refetch = () => {
    void queryClient.invalidateQueries({ queryKey: gamesKeys.view(kind, tournamentId, sessionId) })
  }
  return useEventStream(
    `/v1/tournaments/${tournamentId}/${kind}s/${sessionId}/scores/events`,
    enabled,
    {
      // A payout save changes no score, so the keeper's screen stays as it is (D-285).
      onChange: (kind) => {
        if (kind !== 'payouts') refetch()
      },
      onReconnect: refetch,
    },
  )
}
