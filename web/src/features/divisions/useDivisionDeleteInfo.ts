import { useQuery } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { fetchDivisionDeleteInfo } from './api'

/**
 * What the delete dialog says before the director presses Delete (D-154). The answer is dropped
 * when the dialog closes (`gcTime: 0`), so the next open never shows an old count.
 */
export function useDivisionDeleteInfo(tournamentId: string, divisionId: string) {
  return useQuery({
    queryKey: [
      ...tournamentKeys.detail(tournamentId),
      'divisions',
      divisionId,
      'delete-info',
    ] as const,
    queryFn: () => fetchDivisionDeleteInfo(tournamentId, divisionId),
    // No retry: the dialog works without the answer, so a failure should not keep the director waiting.
    retry: false,
    gcTime: 0,
  })
}
