import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { updateTournament } from './api'
import type { TournamentChanges } from './types'

/** Edit one tournament, then refresh it, its settings, and the list (TRN-24, TRN-29). */
export function useUpdateTournament(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: TournamentChanges) => updateTournament(id, changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tournamentKeys.all }),
  })
}
