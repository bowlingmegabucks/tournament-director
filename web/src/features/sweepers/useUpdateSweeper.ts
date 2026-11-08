import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { updateSweeper } from './api'
import type { SweeperChanges } from './types'

/**
 * Change one sweeper, then refresh the tournament's lists and detail, which carries the
 * vendor-shape `sweepers` (SQD-23). The tournament key covers the list and the `edit-info` read.
 */
export function useUpdateSweeper(tournamentId: string, sweeperId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: { changes: SweeperChanges; confirmWarnings: boolean }) =>
      updateSweeper(tournamentId, sweeperId, variables.changes, variables.confirmWarnings),
    // Not returned: the save is done, so the page need not wait for the refetches.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) })
    },
  })
}
