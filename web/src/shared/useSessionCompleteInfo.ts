import { useQuery } from '@tanstack/react-query'
import { fetchSessionCompleteInfo } from './sessionCompleteApi'
import type { SessionKind } from './sessionEditApi'
import { tournamentKeys } from './tournamentQuery'

/**
 * What the complete dialog says before the director presses Complete (D-194). The answer is
 * dropped when the dialog closes (`gcTime: 0`), so the next open never shows an old count.
 */
export function useSessionCompleteInfo(kind: SessionKind, tournamentId: string, sessionId: string) {
  return useQuery({
    queryKey: [...tournamentKeys.detail(tournamentId), kind, sessionId, 'complete-info'] as const,
    queryFn: () => fetchSessionCompleteInfo(kind, tournamentId, sessionId),
    // No retry: the dialog works without the answer, so a failure should not keep the director waiting.
    retry: false,
    gcTime: 0,
  })
}
