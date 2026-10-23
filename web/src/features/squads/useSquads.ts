import { useQuery } from '@tanstack/react-query'
import { retryUnlessNotFound, tournamentKeys } from '../../shared/tournamentQuery'
import { fetchSquads } from './api'

export const squadKeys = {
  list: (tournamentId: string) => [...tournamentKeys.detail(tournamentId), 'squads'] as const,
}

export function useSquads(tournamentId: string) {
  return useQuery({
    queryKey: squadKeys.list(tournamentId),
    queryFn: () => fetchSquads(tournamentId),
    retry: retryUnlessNotFound,
  })
}
