import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSweeper } from './api'
import type { NewSweeper } from './types'
import { sweeperKeys } from './useSweepers'

/** Add a sweeper to one tournament, then refresh its list (SQD-10 to SQD-13). */
export function useCreateSweeper(tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NewSweeper) => createSweeper(tournamentId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sweeperKeys.list(tournamentId) }),
  })
}
