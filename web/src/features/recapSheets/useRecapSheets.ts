import { useQuery } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { LaneSetupError, SessionNotFoundError } from '../lanes/api'
import type { SessionKind } from '../lanes/types'
import { fetchRecapSheets } from './api'

export const recapKeys = {
  sheets: (kind: SessionKind, tournamentId: string, sessionId: string) =>
    [...tournamentKeys.detail(tournamentId), `${kind}s`, sessionId, 'recap-sheets'] as const,
}

/** Retry once, but not a missing session or a setup problem: a second try answers the same. */
function retryUnlessFinal(failureCount: number, error: Error): boolean {
  return (
    !(error instanceof SessionNotFoundError) &&
    !(error instanceof LaneSetupError) &&
    failureCount < 1
  )
}

/** Read when the dialog opens, so the lane page costs nothing extra. Always fresh: lanes change. */
export function useRecapSheets(kind: SessionKind, tournamentId: string, sessionId: string) {
  return useQuery({
    queryKey: recapKeys.sheets(kind, tournamentId, sessionId),
    queryFn: () => fetchRecapSheets(kind, tournamentId, sessionId),
    retry: retryUnlessFinal,
    gcTime: 0,
  })
}
