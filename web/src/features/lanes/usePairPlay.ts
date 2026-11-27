import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { setPairInPlay } from './api'
import { applyMoves, planMove } from './optimisticMove'
import { laneKeys } from './useLanes'
import type { LanePage, LanePair, SessionKind } from './types'

interface PairRequest {
  /** The first lane of the pair. */
  lane: number
  inPlay: boolean
  confirmWarnings: boolean
}

/** The page as it will be: the pair in or out, and anyone on a pair going out unassigned. */
function withPair(page: LanePage, { lane, inPlay }: PairRequest): LanePage {
  const leaving = inPlay ? [] : (page.pairs.find((pair) => pair.firstLane === lane)?.bowlers ?? [])
  const moved = applyMoves(
    page,
    new Map(leaving.map((bowler) => [bowler.registrationId, planMove(bowler, 'unassigned')])),
  )
  return {
    ...moved,
    pairs: moved.pairs.map((pair) =>
      pair.firstLane === lane ? { ...pair, outOfPlay: !inPlay } : pair,
    ),
  }
}

/**
 * Takes pairs out of play and brings them back (OOP-03, OOP-05), showing the change at once, as a
 * lane move does (D-220). A pair with bowlers asks first (OOP-04): `asking` holds its first lane
 * until the director answers. The page can be a moment old, so the API asks too, and its question
 * opens the same dialog. A refusal puts the page back and goes to `onError`.
 */
export function usePairPlay(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  onError: (message: string) => void,
) {
  const queryClient = useQueryClient()
  const key = laneKeys.page(kind, tournamentId, sessionId)
  const mutationKey = [...key, 'pair'] as const
  const [asking, setAsking] = useState<number>()

  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ lane, inPlay, confirmWarnings }: PairRequest) =>
      setPairInPlay(kind, tournamentId, sessionId, lane, inPlay, confirmWarnings),
    onMutate: async (request) => {
      // A refetch that lands now would overwrite the change with the page from before it.
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<LanePage>(key)
      if (previous) queryClient.setQueryData(key, withPair(previous, request))
      return { previous }
    },
    onSuccess: (result, { lane }, context) => {
      if (result !== 'confirm') return
      // Nothing was saved.
      if (context.previous) queryClient.setQueryData(key, context.previous)
      setAsking(lane)
    },
    onError: (error, _request, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
      onError(error.message)
    },
    // Waits for the refetch, so the checkbox stays off limits until the page is the API's.
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  const pending = useMutationState({
    filters: { mutationKey, status: 'pending' },
    // Every mutation under this key is a `PairRequest`.
    select: (item) => item.state.variables as PairRequest,
  })
  const saving: ReadonlyMap<number, boolean> = new Map(
    pending.map((request) => [request.lane, request.inPlay]),
  )

  return {
    saving,
    asking,
    setInPlay(pair: LanePair, inPlay: boolean) {
      if (!inPlay && pair.bowlers.length > 0) setAsking(pair.firstLane)
      else mutation.mutate({ lane: pair.firstLane, inPlay, confirmWarnings: false })
    },
    confirm() {
      if (asking === undefined) return
      setAsking(undefined)
      mutation.mutate({ lane: asking, inPlay: false, confirmWarnings: true })
    },
    cancel() {
      setAsking(undefined)
    },
  }
}
