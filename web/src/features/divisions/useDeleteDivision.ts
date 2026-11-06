import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { deleteDivision } from './api'

/**
 * Delete one division of a tournament, then refresh the tournament's lists and detail, which
 * carries the vendor-shape `divisions` (DIV-12). The numbers after it moved down by one (D-153).
 */
export function useDeleteDivision(tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (divisionId: string) => deleteDivision(tournamentId, divisionId),
    // Not returned: the delete is done, so the page need not wait for the refetches.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) })
    },
  })
}
