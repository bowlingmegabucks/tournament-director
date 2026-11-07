import { useQuery } from '@tanstack/react-query'
import { BowlerNotFoundError, fetchBowler } from './bowlerApi'
import { bowlerKeys } from './useBowlerSearch'

/**
 * One bowler for the form and the registration they hold in this tournament (D-165). Read fresh
 * every time: the desk decides from it whether this is an add or an append.
 */
export function useBowler(tournamentId: string, bowlerId: string | undefined) {
  return useQuery({
    queryKey: bowlerKeys.detail(tournamentId, bowlerId ?? ''),
    queryFn: () => fetchBowler(bowlerId ?? '', tournamentId),
    enabled: bowlerId !== undefined,
    staleTime: 0,
    gcTime: 0,
    retry: (count, error) => !(error instanceof BowlerNotFoundError) && count < 1,
  })
}
