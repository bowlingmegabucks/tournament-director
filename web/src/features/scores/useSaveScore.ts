import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SessionKind } from '../../shared/session'
import { applySaved } from './entryLogic'
import { saveScore } from './gamesApi'
import type { GamesView } from './gamesTypes'
import { gamesKeys } from './useGames'

export interface ScoreRequest {
  registrationId: string
  game: number
  /** `null` clears the score (D-228). */
  score: number | null
}

/**
 * Saves or clears one score (SCR-19, D-228). The answer is laid over the games at once, with any
 * earlier games the API filled with 0 (D-229); the stream's `changed` message refetches after.
 * The page shows saving, saved, and failed for each box itself, from the promise.
 */
export function useSaveScore(kind: SessionKind, tournamentId: string, sessionId: string) {
  const queryClient = useQueryClient()
  const key = gamesKeys.view(kind, tournamentId, sessionId)
  return useMutation({
    mutationFn: ({ registrationId, game, score }: ScoreRequest) =>
      saveScore(kind, tournamentId, sessionId, registrationId, game, score),
    onSuccess: (saved, { registrationId }) => {
      const current = queryClient.getQueryData<GamesView>(key)
      if (current) queryClient.setQueryData(key, applySaved(current, registrationId, saved))
    },
  })
}
