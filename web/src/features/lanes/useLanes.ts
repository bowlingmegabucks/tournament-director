import { useQuery } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { fetchLanes, LaneSetupError, SessionNotFoundError } from './api'
import type { SessionKind } from './types'

export const laneKeys = {
  page: (kind: SessionKind, tournamentId: string, sessionId: string) =>
    [...tournamentKeys.detail(tournamentId), `${kind}s`, sessionId, 'lanes'] as const,
}

/** Retry once, but not a missing session or a setup problem: a second try answers the same. */
function retryUnlessFinal(failureCount: number, error: Error): boolean {
  return (
    !(error instanceof SessionNotFoundError) &&
    !(error instanceof LaneSetupError) &&
    failureCount < 1
  )
}

export function useLanes(kind: SessionKind, tournamentId: string, sessionId: string) {
  return useQuery({
    queryKey: laneKeys.page(kind, tournamentId, sessionId),
    queryFn: () => fetchLanes(kind, tournamentId, sessionId),
    retry: retryUnlessFinal,
  })
}
