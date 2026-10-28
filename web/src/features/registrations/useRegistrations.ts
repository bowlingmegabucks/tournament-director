import { useQuery } from '@tanstack/react-query'
import { retryUnlessNotFound, tournamentKeys } from '../../shared/tournamentQuery'
import { fetchRegistrations } from './api'

export const registrationKeys = {
  list: (tournamentId: string) =>
    [...tournamentKeys.detail(tournamentId), 'registrations'] as const,
}

export function useRegistrations(tournamentId: string) {
  return useQuery({
    queryKey: registrationKeys.list(tournamentId),
    queryFn: () => fetchRegistrations(tournamentId),
    retry: retryUnlessNotFound,
  })
}
