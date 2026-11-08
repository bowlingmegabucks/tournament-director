import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteSession } from './sessionDeleteApi'
import type { SessionKind } from './sessionEditApi'
import { tournamentKeys } from './tournamentQuery'

/**
 * Delete one squad or sweeper of a tournament, then refresh the tournament's lists and detail,
 * which carries the vendor-shape `squads` and `sweepers` (SQD-14). A refusal or a 404 refreshes
 * too: it means the page was out of date (a bowler was entered, or another director deleted the
 * session), and the list should show what is there now.
 */
export function useDeleteSession(kind: SessionKind, tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => deleteSession(kind, tournamentId, sessionId),
    // Not returned: the page need not wait for the refetches.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) })
    },
  })
}
