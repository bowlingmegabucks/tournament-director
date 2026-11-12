import { useQuery } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { fetchCompleteInfo } from './completeApi'

/**
 * What a complete would do, for the dialog (TRN-41, D-259). The answer is dropped when the dialog
 * closes (`gcTime: 0`), so the next open never shows an old count. No retry: the dialog offers
 * "Try again", so a failure should not keep the director waiting.
 */
export function useCompleteInfo(id: string) {
  return useQuery({
    queryKey: [...tournamentKeys.detail(id), 'complete-info'] as const,
    queryFn: () => fetchCompleteInfo(id),
    retry: false,
    gcTime: 0,
  })
}
