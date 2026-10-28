import { useQuery } from '@tanstack/react-query'
import { retryUnlessNotFound, tournamentKeys } from '../../shared/tournamentQuery'
import { fetchSweepers } from './api'

export const sweeperKeys = {
  list: (tournamentId: string) => [...tournamentKeys.detail(tournamentId), 'sweepers'] as const,
}

export function useSweepers(tournamentId: string) {
  return useQuery({
    queryKey: sweeperKeys.list(tournamentId),
    queryFn: () => fetchSweepers(tournamentId),
    retry: retryUnlessNotFound,
  })
}
