import { useQuery } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { fetchEditInfo, RegistrationNotFoundError } from './editApi'

/** The segment that marks the edit read, so a save can leave it alone (below). */
export const editInfoSegment = 'registration-edit'

export const editInfoKeys = {
  detail: (tournamentId: string, registrationId: string) =>
    [...tournamentKeys.detail(tournamentId), editInfoSegment, registrationId] as const,
}

/**
 * One registration for the edit page and the lane page actions (D-197). Read fresh every time: the
 * form copies it once, so a refetch on refocus would change the squads under the desk. The save
 * answers `409 changed` when the record moved on (D-199).
 */
export function useEditInfo(tournamentId: string, registrationId: string) {
  return useQuery({
    queryKey: editInfoKeys.detail(tournamentId, registrationId),
    queryFn: () => fetchEditInfo(tournamentId, registrationId),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (count, error) => !(error instanceof RegistrationNotFoundError) && count < 1,
  })
}
