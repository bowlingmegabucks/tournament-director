import { useQuery } from '@tanstack/react-query'
import { retryUnlessNotFound, tournamentKeys } from '../../shared/tournamentQuery'
import { fetchDivisions } from './api'

export const divisionKeys = {
  list: (tournamentId: string) => [...tournamentKeys.detail(tournamentId), 'divisions'] as const,
}

export function useDivisions(tournamentId: string) {
  return useQuery({
    queryKey: divisionKeys.list(tournamentId),
    queryFn: () => fetchDivisions(tournamentId),
    retry: retryUnlessNotFound,
  })
}
