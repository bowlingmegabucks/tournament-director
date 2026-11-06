import { useQuery } from '@tanstack/react-query'
import { retryUnlessNotFound, tournamentKeys } from '../../shared/tournamentQuery'
import { fetchDivisionEditInfo } from './api'

/** What depends on one division's settings, for the edit page (D-147). */
export function useDivisionEditInfo(
  tournamentId: string,
  divisionId: string,
  options: { refetchOnMount?: 'always' } = {},
) {
  return useQuery({
    ...options,
    queryKey: [
      ...tournamentKeys.detail(tournamentId),
      'divisions',
      divisionId,
      'edit-info',
    ] as const,
    queryFn: () => fetchDivisionEditInfo(tournamentId, divisionId),
    retry: retryUnlessNotFound,
  })
}
