import { useQuery } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { fetchDeleteInfo } from './deleteApi'
import { RegistrationNotFoundError } from './editApi'

/** The segment that marks the delete read, so a delete can leave it alone (below). */
export const deleteInfoSegment = 'registration-delete-info'

export const deleteInfoKeys = {
  detail: (tournamentId: string, registrationId: string) =>
    [...tournamentKeys.detail(tournamentId), deleteInfoSegment, registrationId] as const,
}

/**
 * What the delete dialog shows: the fees and the real payments (D-212). It is read only while the
 * dialog is open, and fresh every time: a stale total would make the confirm warn again.
 */
export function useDeleteInfo(tournamentId: string, registrationId: string) {
  return useQuery({
    queryKey: deleteInfoKeys.detail(tournamentId, registrationId),
    queryFn: () => fetchDeleteInfo(tournamentId, registrationId),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (count, error) => !(error instanceof RegistrationNotFoundError) && count < 1,
  })
}
