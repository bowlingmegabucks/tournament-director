import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query'
import { moveBowler } from './api'
import { applyMoves, type Move } from './optimisticMove'
import { laneKeys } from './useLanes'
import type { LanePage, SessionKind } from './types'

export interface MoveRequest {
  registrationId: string
  /** The first lane of the target pair, or `null` for the unassigned list. */
  lane: number | null
  /** What the page shows until the API answers (D-220). */
  guess: Move
}

/**
 * Saves a lane move and shows it at once (LAN-16, D-216, D-220). The page is patched before the
 * request goes; the API's seat replaces the guess when it answers; a refusal puts the page back
 * as it was, and the caller shows the message. The page refetches after every save, so a guess
 * that was wrong, or a change by another desk, shows by the next paint.
 */
export function useMoveBowler(kind: SessionKind, tournamentId: string, sessionId: string) {
  const queryClient = useQueryClient()
  const key = laneKeys.page(kind, tournamentId, sessionId)
  const mutationKey = [...key, 'move'] as const

  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ registrationId, lane }: MoveRequest) =>
      moveBowler(kind, tournamentId, sessionId, registrationId, lane),
    onMutate: async ({ registrationId, guess }) => {
      // A refetch that lands now would overwrite the guess with the page from before the move.
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<LanePage>(key)
      if (previous) {
        queryClient.setQueryData(key, applyMoves(previous, new Map([[registrationId, guess]])))
      }
      return { previous }
    },
    onSuccess: (position, { registrationId, guess }) => {
      const current = queryClient.getQueryData<LanePage>(key)
      if (!current) return
      // Same pair, the seat the API chose.
      queryClient.setQueryData(
        key,
        applyMoves(current, new Map([[registrationId, { ...guess, position }]])),
      )
    },
    onError: (_error, _request, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  // The bowlers whose saves are still out, so their rows can say so.
  const saving = useMutationState({
    filters: { mutationKey, status: 'pending' },
    select: (item) => (item.state.variables as MoveRequest | undefined)?.registrationId,
  })
  const savingIds: ReadonlySet<string> = new Set(
    saving.filter((id): id is string => id !== undefined),
  )

  return { move: mutation.mutate, savingIds }
}
