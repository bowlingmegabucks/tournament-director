import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { updateDivision } from './api'
import type { DivisionChanges } from './types'

/**
 * Change one division, then refresh the tournament's lists and detail, which carries the
 * vendor-shape `divisions` (DIV-12).
 */
export function useUpdateDivision(tournamentId: string, divisionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: { changes: DivisionChanges; confirmWarnings: boolean }) =>
      updateDivision(tournamentId, divisionId, variables.changes, variables.confirmWarnings),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) }),
  })
}
