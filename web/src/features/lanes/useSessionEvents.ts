import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useEventStream, type LiveState } from '../../shared/useEventStream'
import { describeChange, diffPages } from './pageDiff'
import type { LanePage, SessionKind } from './types'
import { laneKeys } from './useLanes'

export type { LiveState }

/** How long "Updated: lanes 5-6" stays before the line goes back to "Live". */
export const UPDATED_MS = 6000

export interface SessionEvents {
  state: LiveState
  /** What the last pushed change touched, as the status line says it. Absent when nothing is new. */
  updated: { text: string; pairs: number[]; version: number } | undefined
}

/**
 * Keeps the lane page fresh from the live stream of one squad or sweeper (LAN-21, D-217, D-218). A
 * `changed` message refetches the page and says what moved; a reconnect after a drop refetches
 * once. A `scores` message is about the Scores tab, not lanes, so this page ignores it (D-232).
 * The stream itself is `useEventStream`.
 */
export function useSessionEvents(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  enabled: boolean,
): SessionEvents {
  const queryClient = useQueryClient()
  const [updated, setUpdated] = useState<SessionEvents['updated']>()
  const version = useRef(0)
  const clear = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const key = laneKeys.page(kind, tournamentId, sessionId)

  // The "Updated" line goes away on its own; leave no timer behind when the page does.
  useEffect(
    () => () => {
      clearTimeout(clear.current)
    },
    [],
  )

  const state = useEventStream(
    `/v1/tournaments/${tournamentId}/${kind}s/${sessionId}/events`,
    enabled,
    {
      onChange: (changeKind) => {
        if (changeKind === 'scores') return
        const before = queryClient.getQueryData<LanePage>(key)
        void queryClient.invalidateQueries({ queryKey: key }).then(() => {
          const after = queryClient.getQueryData<LanePage>(key)
          if (!before || !after) return
          const change = diffPages(before, after)
          const text = describeChange(after, change)
          // Our own save refetches to the page we already show, so it says nothing.
          if (!text) return
          version.current += 1
          setUpdated({ text, pairs: change.pairs, version: version.current })
          clearTimeout(clear.current)
          clear.current = setTimeout(() => {
            setUpdated(undefined)
          }, UPDATED_MS)
        })
      },
      onReconnect: () => {
        void queryClient.invalidateQueries({ queryKey: key })
      },
    },
  )

  return { state, updated }
}
