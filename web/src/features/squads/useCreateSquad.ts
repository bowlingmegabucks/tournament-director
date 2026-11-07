import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSquad } from './api'
import type { NewSquad } from './types'
import { squadKeys } from './useSquads'

/** Add a squad to one tournament, then refresh its list (SQD-01 to SQD-08). */
export function useCreateSquad(tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NewSquad) => createSquad(tournamentId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: squadKeys.list(tournamentId) }),
  })
}
