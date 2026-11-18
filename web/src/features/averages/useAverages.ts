import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { retryUnlessNotFound, tournamentKeys } from '../../shared/tournamentQuery'
import { AverageNotFoundError, fetchAverages, removeCheck, saveCheck } from './api'
import type { CheckAction } from './types'

export const averageKeys = {
  list: (tournamentId: string) => [...tournamentKeys.detail(tournamentId), 'averages'] as const,
}

/** Once, and never for a missing registration or tournament: a second try answers the same. */
const retryUnlessMissing = (failureCount: number, error: Error) =>
  !(error instanceof AverageNotFoundError) && retryUnlessNotFound(failureCount, error)

export function useAverages(tournamentId: string) {
  return useQuery({
    queryKey: averageKeys.list(tournamentId),
    queryFn: () => fetchAverages(tournamentId),
    retry: retryUnlessMissing,
  })
}

/**
 * A check changes handicap, so everything of the tournament that shows it is asked for again: the
 * lists, the lane pages, the results, and the recap sheets (AVG-19, D-298).
 */
function useRefreshTournament(tournamentId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) })
}

export function useSaveCheck(tournamentId: string) {
  const refresh = useRefreshTournament(tournamentId)
  return useMutation({
    mutationFn: ({
      registrationId,
      change,
      confirm,
    }: {
      registrationId: string
      change: CheckAction
      confirm: boolean
    }) => saveCheck(tournamentId, registrationId, change, confirm),
    onSuccess: refresh,
  })
}

export function useRemoveCheck(tournamentId: string) {
  const refresh = useRefreshTournament(tournamentId)
  return useMutation({
    mutationFn: ({ registrationId, confirm }: { registrationId: string; confirm: boolean }) =>
      removeCheck(tournamentId, registrationId, confirm),
    onSuccess: refresh,
  })
}
