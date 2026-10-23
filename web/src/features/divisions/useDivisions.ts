import { useQuery } from '@tanstack/react-query'
import { tournamentKeys } from '../tournaments/useTournaments'
import { TournamentNotFoundError } from '../tournaments/api'
import { fetchDivisions } from './api'

export const divisionKeys = {
  list: (tournamentId: string) => [...tournamentKeys.detail(tournamentId), 'divisions'] as const,
}

export function useDivisions(tournamentId: string) {
  return useQuery({
    queryKey: divisionKeys.list(tournamentId),
    queryFn: () => fetchDivisions(tournamentId),
    // A missing tournament will not appear on a second try.
    retry: (failureCount, error) => !(error instanceof TournamentNotFoundError) && failureCount < 1,
  })
}
