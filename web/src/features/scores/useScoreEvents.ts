import { useLivePage, type LivePage } from '../../shared/useLivePage'
import { describeScoreChange, diffScores } from './scoreDiff'
import type { ScorePage, SessionKind } from './types'
import { scoreKeys } from './useScores'

/** How long "Updated: Dana Rivers, game 2" and the highlighted rows stay. */
export { UPDATED_MS as SCORE_UPDATED_MS } from '../../shared/useLivePage'

export type ScoreEvents = LivePage<{ ids: string[] }>

/**
 * Keeps the Scores tab fresh from the public stream of one squad or sweeper (SCR-18, SCR-20,
 * D-232). Every `changed` message refetches the page, whatever its kind, since lane moves change
 * the pairs and saves change the scores; the status line says which bowlers and games changed.
 * A reconnect after a drop refetches once. `enabled` is false for a complete session (D-10). The
 * stream is `useEventStream`; the refetch and the line are `useLivePage`.
 */
export function useScoreEvents(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  enabled: boolean,
): ScoreEvents {
  return useLivePage<ScorePage, { ids: string[] }>({
    path: `/v1/tournaments/${tournamentId}/${kind}s/${sessionId}/scores/events`,
    queryKey: scoreKeys.page(kind, tournamentId, sessionId),
    enabled,
    change: (before, after) => {
      const found = diffScores(before, after)
      const text = describeScoreChange(found)
      return text ? { text, ids: found.ids } : undefined
    },
  })
}
