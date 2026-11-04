import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { createTournament } from './api'

/** Create a tournament, then refresh the list so it shows there (TRN-22). */
export function useCreateTournament() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTournament,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tournamentKeys.all }),
  })
}
