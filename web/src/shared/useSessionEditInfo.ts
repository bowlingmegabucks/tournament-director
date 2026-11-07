import { useQuery } from '@tanstack/react-query'
import { fetchSessionEditInfo, type SessionKind } from './sessionEditApi'
import { retryUnlessNotFound, tournamentKeys } from './tournamentQuery'

/** What depends on one squad or sweeper, for its edit page (SQD-26, D-185). */
export function useSessionEditInfo(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  options: { refetchOnMount?: 'always' } = {},
) {
  return useQuery({
    ...options,
    queryKey: [...tournamentKeys.detail(tournamentId), kind, sessionId, 'edit-info'] as const,
    queryFn: () => fetchSessionEditInfo(kind, tournamentId, sessionId),
    retry: retryUnlessNotFound,
  })
}
