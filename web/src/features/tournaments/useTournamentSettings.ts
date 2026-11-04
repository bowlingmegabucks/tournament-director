import { useQuery } from '@tanstack/react-query'
import { retryUnlessNotFound, tournamentKeys } from '../../shared/tournamentQuery'
import { fetchTournamentSettings } from './api'

/** Games and the three ratios of one tournament (D-126). */
export function useTournamentSettings(id: string, options: { refetchOnMount?: 'always' } = {}) {
  return useQuery({
    ...options,
    queryKey: [...tournamentKeys.detail(id), 'settings'] as const,
    queryFn: () => fetchTournamentSettings(id),
    retry: retryUnlessNotFound,
  })
}
