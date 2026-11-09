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
    // The form copies this once. A refetch on refocus would change the "held" squads under the desk;
    // the server's already-registered answer (D-159) catches a registration made in the meantime.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (count, error) => !(error instanceof BowlerNotFoundError) && count < 1,
  })
}
