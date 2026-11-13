import { useLivePage, type LivePage } from '../../shared/useLivePage'
import { describeChange, diffPages } from './pageDiff'
import type { LanePage, SessionKind } from './types'
import { laneKeys } from './useLanes'

export type { LiveState } from '../../shared/useEventStream'

/** How long "Updated: lanes 5-6" stays before the line goes back to "Live". */
export { UPDATED_MS } from '../../shared/useLivePage'

export type SessionEvents = LivePage<{ pairs: number[] }>

/**
 * Keeps the lane page fresh from the live stream of one squad or sweeper (LAN-21, D-217, D-218). A
 * `changed` message refetches the page and says what moved; a reconnect after a drop refetches
 * once. A `scores` or `payouts` message is about another tab, not lanes, so this page ignores it (D-232, D-285).
 * The stream is `useEventStream`; the refetch and the line are `useLivePage`.
 */
export function useSessionEvents(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  enabled: boolean,
): SessionEvents {
  return useLivePage<LanePage, { pairs: number[] }>({
    path: `/v1/tournaments/${tournamentId}/${kind}s/${sessionId}/events`,
    queryKey: laneKeys.page(kind, tournamentId, sessionId),
    enabled,
    ignores: ['scores', 'payouts'],
    change: (before, after) => {
      const found = diffPages(before, after)
      const text = describeChange(after, found)
      return text ? { text, pairs: found.pairs } : undefined
    },
  })
}
