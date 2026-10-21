import { useQuery } from '@tanstack/react-query'
import { fetchTournament, fetchTournaments, TournamentNotFoundError } from './api'

// Mutation hooks invalidate these keys, so keep them in one place.
export const tournamentKeys = {
  all: ['tournaments'] as const,
  detail: (id: string) => ['tournaments', id] as const,
}

export function useTournaments() {
  return useQuery({ queryKey: tournamentKeys.all, queryFn: fetchTournaments })
}

export function useTournament(id: string) {
  return useQuery({
    queryKey: tournamentKeys.detail(id),
    queryFn: () => fetchTournament(id),
    // A missing tournament will not appear on a second try.
    retry: (failureCount, error) => !(error instanceof TournamentNotFoundError) && failureCount < 1,
  })
}
