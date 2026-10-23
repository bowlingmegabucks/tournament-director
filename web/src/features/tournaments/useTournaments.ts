import { useQuery } from '@tanstack/react-query'
import { retryUnlessNotFound, tournamentKeys } from '../../shared/tournamentQuery'
import { fetchTournament, fetchTournaments } from './api'

export function useTournaments() {
  return useQuery({ queryKey: tournamentKeys.all, queryFn: fetchTournaments })
}

export function useTournament(id: string) {
  return useQuery({
    queryKey: tournamentKeys.detail(id),
    queryFn: () => fetchTournament(id),
    retry: retryUnlessNotFound,
  })
}
