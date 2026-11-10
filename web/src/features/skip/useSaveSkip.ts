import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SessionKind } from '../../shared/session'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { saveSkip, type SkipPattern } from './api'

/**
 * Saves the skip of one squad or sweeper (SCR-23, D-235). When it saves, every read of the session
 * that holds lanes (the recap sheets, the entry board, the lane page) asks again; the mutation
 * stays pending until they do, so a page that shows `variables` while pending never flickers back
 * to the old pattern.
 */
export function useSaveSkip(kind: SessionKind, tournamentId: string, sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (skip: SkipPattern) => saveSkip(kind, tournamentId, sessionId, skip),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [...tournamentKeys.detail(tournamentId), `${kind}s`, sessionId],
      }),
  })
}
