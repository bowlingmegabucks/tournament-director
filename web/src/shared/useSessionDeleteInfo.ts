import { useQuery } from '@tanstack/react-query'
import { fetchSessionDeleteInfo } from './sessionDeleteApi'
import type { SessionKind } from './sessionEditApi'
import { tournamentKeys } from './tournamentQuery'

/**
 * What the delete dialog says before the director presses Delete (D-188). The answer is dropped
 * when the dialog closes (`gcTime: 0`), so the next open never shows an old count.
 */
export function useSessionDeleteInfo(kind: SessionKind, tournamentId: string, sessionId: string) {
  return useQuery({
    queryKey: [...tournamentKeys.detail(tournamentId), kind, sessionId, 'delete-info'] as const,
    queryFn: () => fetchSessionDeleteInfo(kind, tournamentId, sessionId),
    // No retry: the dialog works without the answer, so a failure should not keep the director waiting.
    retry: false,
    gcTime: 0,
  })
}
