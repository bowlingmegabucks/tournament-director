import { useQuery, type QueryClient } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { retryUnlessFinal } from '../../shared/session'
import { fetchLanes } from './api'
import type { SessionKind } from './types'

export const laneKeys = {
  page: (kind: SessionKind, tournamentId: string, sessionId: string) =>
    [...tournamentKeys.detail(tournamentId), `${kind}s`, sessionId, 'lanes'] as const,
}

/**
 * Whether the save asking is the only change to this lane page still out. Moves and pair changes
 * keep their keys under the page's. Until the last one answers, putting an old page back, or
 * refetching, would wipe another save's change from the screen.
 */
export function isLastLaneSave(queryClient: QueryClient, pageKey: readonly unknown[]): boolean {
  return queryClient.isMutating({ mutationKey: pageKey }) === 1
}

export function useLanes(kind: SessionKind, tournamentId: string, sessionId: string) {
  return useQuery({
    queryKey: laneKeys.page(kind, tournamentId, sessionId),
    queryFn: () => fetchLanes(kind, tournamentId, sessionId),
    retry: retryUnlessFinal,
  })
}
