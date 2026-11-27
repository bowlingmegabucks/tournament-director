import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { setPairInPlay } from './api'
import { applyMoves, planMove } from './optimisticMove'
import { isLastLaneSave, laneKeys } from './useLanes'
import type { LanePage, LanePair, SessionKind } from './types'

interface PairRequest {
  /** The first lane of the pair. */
  lane: number
  inPlay: boolean
  /** Who the director agreed to unassign. Left out until they have been asked. */
  seen?: readonly string[]
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
    mutationFn: ({ lane, inPlay, seen }: PairRequest) =>
      setPairInPlay(kind, tournamentId, sessionId, lane, inPlay, seen),
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
      restore(context.previous)
      setAsking(lane)
    },
    onError: (error, _request, context) => {
      restore(context?.previous)
      onError(error.message)
    },
    // Waits for the refetch, so the checkbox stays off limits until the page is the API's.
    onSettled: () =>
      isLastLaneSave(queryClient, key)
        ? queryClient.invalidateQueries({ queryKey: key })
        : undefined,
  })

  /** Puts the page back, unless another save is out: the refetch after the last one does it then. */
  function restore(previous: LanePage | undefined) {
    if (previous && isLastLaneSave(queryClient, key)) queryClient.setQueryData(key, previous)
  }

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
      else mutation.mutate({ lane: pair.firstLane, inPlay })
    },
    /** `pair` is the one the dialog showed, so the API can tell if someone has joined it since. */
    confirm(pair: LanePair) {
      setAsking(undefined)
      const seen = pair.bowlers.map((bowler) => bowler.registrationId)
      mutation.mutate({ lane: pair.firstLane, inPlay: false, seen })
    },
    cancel() {
      setAsking(undefined)
    },
  }
}
