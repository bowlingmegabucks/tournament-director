import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useEventStream, type LiveState } from '../../shared/useEventStream'
import { describeScoreChange, diffScores } from './scoreDiff'
import type { ScorePage, SessionKind } from './types'
import { scoreKeys } from './useScores'

/** How long "Updated: Dana Rivers, game 2" and the highlighted rows stay. */
export const SCORE_UPDATED_MS = 6000

export interface ScoreEvents {
  state: LiveState
  /** What the last pushed change touched. Absent when nothing is new. */
  updated: { text: string; ids: string[]; version: number } | undefined
}

/**
 * Keeps the Scores tab fresh from the public stream of one squad or sweeper (SCR-18, SCR-20,
 * D-232). Every `changed` message refetches the page, whatever its kind, since lane moves change
 * the pairs and saves change the scores; the status line says which bowlers and games changed.
 * A reconnect after a drop refetches once. `enabled` is false for a complete session (D-10). The
 * stream itself is `useEventStream`.
 */
export function useScoreEvents(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  enabled: boolean,
): ScoreEvents {
  const queryClient = useQueryClient()
  const [updated, setUpdated] = useState<ScoreEvents['updated']>()
  const version = useRef(0)
  const clear = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const key = scoreKeys.page(kind, tournamentId, sessionId)

  // The "Updated" line goes away on its own; leave no timer behind when the page does.
  useEffect(
    () => () => {
      clearTimeout(clear.current)
    },
    [],
  )

  const state = useEventStream(
    `/v1/tournaments/${tournamentId}/${kind}s/${sessionId}/scores/events`,
    enabled,
    {
      onChange: () => {
        const before = queryClient.getQueryData<ScorePage>(key)
        void queryClient.invalidateQueries({ queryKey: key }).then(() => {
          const after = queryClient.getQueryData<ScorePage>(key)
          if (!before || !after) return
          const change = diffScores(before, after)
          const text = describeScoreChange(change)
          // Our own save refetches to the page we already show, so it says nothing.
          if (!text) return
          version.current += 1
          setUpdated({ text, ids: change.ids, version: version.current })
          clearTimeout(clear.current)
          clear.current = setTimeout(() => {
            setUpdated(undefined)
          }, SCORE_UPDATED_MS)
        })
      },
      onReconnect: () => {
        void queryClient.invalidateQueries({ queryKey: key })
      },
    },
  )

  return { state, updated }
}
