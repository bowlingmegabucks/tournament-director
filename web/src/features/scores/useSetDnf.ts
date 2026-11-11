import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SessionKind } from '../../shared/session'
import { applyDnf } from './entryLogic'
import { setDnf } from './gamesApi'
import type { GamesView } from './gamesTypes'
import { gamesKeys } from './useGames'

export interface DnfRequest {
  registrationId: string
  /** `true` flags the bowler "did not finish"; `false` takes the flag off. */
  flagged: boolean
}

/**
 * Flags a bowler "did not finish", or undoes it (SCR-24, D-248, D-249). The flag shows on every
 * game of the sheet at once; the stream's next message refetches after. The page shows a refusal
 * itself, from the promise, as it does for a score.
 */
export function useSetDnf(kind: SessionKind, tournamentId: string, sessionId: string) {
  const queryClient = useQueryClient()
  const key = gamesKeys.view(kind, tournamentId, sessionId)
  return useMutation({
    mutationFn: ({ registrationId, flagged }: DnfRequest) =>
      setDnf(kind, tournamentId, sessionId, registrationId, flagged),
    onSuccess: async (_done, { registrationId, flagged }) => {
      // A refetch that began before the change would land after it and show the old flag.
      await queryClient.cancelQueries({ queryKey: key })
      const current = queryClient.getQueryData<GamesView>(key)
      if (current) queryClient.setQueryData(key, applyDnf(current, registrationId, flagged))
    },
  })
}
