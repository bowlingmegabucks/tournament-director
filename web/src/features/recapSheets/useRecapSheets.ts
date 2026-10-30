import { useQuery } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { retryUnlessFinal, type SessionKind } from '../../shared/session'
import { fetchRecapSheets } from './api'

export const recapKeys = {
  sheets: (kind: SessionKind, tournamentId: string, sessionId: string) =>
    [...tournamentKeys.detail(tournamentId), `${kind}s`, sessionId, 'recap-sheets'] as const,
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
