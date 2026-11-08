import { useMutation, useQueryClient } from '@tanstack/react-query'
import { completeSession } from './sessionCompleteApi'
import type { SessionKind } from './sessionEditApi'
import { tournamentKeys } from './tournamentQuery'

/**
 * Complete one squad or sweeper of a tournament, then refresh everything under the tournament:
 * the lists (the status), the lane page, the scores (a squad now holds zeros for its no-shows), and
 * the results, which drop "Unofficial results" (SQD-15, SQD-16, SQD-19, D-84, D-195). A refusal or
 * a 404 refreshes too: it means the page was out of date (another director completed the session,
 * or removed it).
 */
export function useCompleteSession(kind: SessionKind, tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => completeSession(kind, tournamentId, sessionId),
    // Not returned: the page need not wait for the refetches.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) })
    },
  })
}
