import { useQuery } from '@tanstack/react-query'
import { fetchTournaments } from './api'

// Mutation hooks invalidate these keys, so keep them in one place.
export const tournamentKeys = {
  all: ['tournaments'] as const,
  detail: (id: string) => ['tournaments', id] as const,
}

export function useTournaments() {
  return useQuery({ queryKey: tournamentKeys.all, queryFn: fetchTournaments })
}
