import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { apiUrl } from '../../shared/apiUrl'
import { describeChange, diffPages } from './pageDiff'
import type { LanePage, SessionKind } from './types'
import { laneKeys } from './useLanes'

/** How a page sees the live stream: connected, trying again, or given up (D-217). */
export type LiveState = 'live' | 'reconnecting' | 'off'

/** How long "Updated: lanes 5-6" stays before the line goes back to "Live". */
export const UPDATED_MS = 6000

export interface SessionEvents {
  state: LiveState
  /** What the last pushed change touched, as the status line says it. Absent when nothing is new. */
  updated: { text: string; pairs: number[]; version: number } | undefined
}

/**
 * Listens to the live stream of one squad or sweeper and keeps the lane page fresh (LAN-19, D-217,
 * D-218). A `changed` message refetches the page; a reconnect after a drop refetches once, since
 * messages are not replayed. The browser reconnects on its own. The stream closes when the page
 * leaves or the session is complete (`enabled` false). A browser with no `EventSource`, or a
 * stream the server refused for good (a lost sign-in), is `off`: the page still works, it just
 * does not refresh itself.
 *
 * An effect is right here: the stream is a subscription to something outside React.
 */
export function useSessionEvents(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  enabled: boolean,
): SessionEvents {
  const queryClient = useQueryClient()
  const supported = typeof EventSource !== 'undefined'
  const [state, setState] = useState<LiveState>('reconnecting')
  const [updated, setUpdated] = useState<SessionEvents['updated']>()

  useEffect(() => {
    if (!enabled || !supported) return
    const key = laneKeys.page(kind, tournamentId, sessionId)
    const source = new EventSource(
      apiUrl(`/v1/tournaments/${tournamentId}/${kind}s/${sessionId}/events`),
      {
        withCredentials: true,
      },
    )
    let dropped = false
    let version = 0
    let clear: ReturnType<typeof setTimeout> | undefined

    source.onopen = () => {
      setState('live')
      // Messages are not replayed, so a page that lost the stream asks again (D-218).
      if (dropped) {
        dropped = false
        void queryClient.invalidateQueries({ queryKey: key })
      }
    }
    source.onerror = () => {
      dropped = true
      // The browser retries on its own; CLOSED means it gave up (401, 403, or a server error page).
      setState(source.readyState === EventSource.CLOSED ? 'off' : 'reconnecting')
    }
    source.addEventListener('changed', () => {
      const before = queryClient.getQueryData<LanePage>(key)
      void queryClient.invalidateQueries({ queryKey: key }).then(() => {
        const after = queryClient.getQueryData<LanePage>(key)
        if (!before || !after) return
        const change = diffPages(before, after)
        const text = describeChange(after, change)
        // Our own save refetches to the page we already show, so it says nothing.
        if (!text) return
        version += 1
        setUpdated({ text, pairs: change.pairs, version })
        clearTimeout(clear)
        clear = setTimeout(() => {
          setUpdated(undefined)
        }, UPDATED_MS)
      })
    })

    return () => {
      clearTimeout(clear)
      source.close()
    }
  }, [enabled, supported, kind, tournamentId, sessionId, queryClient])

  return { state: enabled && supported ? state : 'off', updated }
}
