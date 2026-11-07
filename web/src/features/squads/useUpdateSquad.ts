import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { updateSquad } from './api'
import type { SquadChanges } from './types'

/**
 * Change one squad, then refresh the tournament's lists and detail, which carries the vendor-shape
 * `squads` (SQD-23). The tournament key covers the list and the squad's `edit-info` read.
 */
export function useUpdateSquad(tournamentId: string, squadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: { changes: SquadChanges; confirmWarnings: boolean }) =>
      updateSquad(tournamentId, squadId, variables.changes, variables.confirmWarnings),
    // Not returned: the save is done, so the page need not wait for the refetches.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) })
    },
  })
}
