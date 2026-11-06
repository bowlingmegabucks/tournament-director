import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { deleteDivision } from './api'

/**
 * Delete one division of a tournament, then refresh the tournament's lists and detail, which
 * carries the vendor-shape `divisions` (DIV-12). The numbers after it moved down by one (D-153).
 * A refusal or a 404 refreshes too: it means the page was out of date (a bowler registered, or
 * another director deleted the division), and the list should show what is there now.
 */
export function useDeleteDivision(tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (divisionId: string) => deleteDivision(tournamentId, divisionId),
    // Not returned: the page need not wait for the refetches.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) })
    },
  })
}
