import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { completeTournament } from './completeApi'

/**
 * Complete one tournament, then refresh everything under it: the settings (the Completed badge),
 * the squads and sweepers (their status), the lane and score pages, and the results, which drop
 * "Unofficial results" (TRN-38, D-84, D-260). A refusal or a 404 refreshes too: it means the page
 * was out of date (another director completed the tournament first).
 */
export function useCompleteTournament(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => completeTournament(id),
    // Not returned: the page need not wait for the refetches.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tournamentKeys.detail(id) })
    },
  })
}
