import { useQuery } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { retryUnlessFinal } from '../../shared/session'
import { fetchLanes } from './api'
import type { SessionKind } from './types'

export const laneKeys = {
  page: (kind: SessionKind, tournamentId: string, sessionId: string) =>
    [...tournamentKeys.detail(tournamentId), `${kind}s`, sessionId, 'lanes'] as const,
}

export function useLanes(kind: SessionKind, tournamentId: string, sessionId: string) {
  return useQuery({
    queryKey: laneKeys.page(kind, tournamentId, sessionId),
    queryFn: () => fetchLanes(kind, tournamentId, sessionId),
    retry: retryUnlessFinal,
  })
}
