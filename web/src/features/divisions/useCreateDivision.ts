import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createDivision } from './api'
import { divisionKeys } from './useDivisions'
import type { NewDivision } from './types'

/** Add a division to one tournament, then refresh its list (DIV-12). */
export function useCreateDivision(tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: { input: NewDivision; confirmWarnings: boolean }) =>
      createDivision(tournamentId, variables.input, variables.confirmWarnings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: divisionKeys.list(tournamentId) }),
  })
}
