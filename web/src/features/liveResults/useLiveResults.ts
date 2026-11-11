import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { useEventStream, type LiveState } from '../../shared/useEventStream'
import { fetchLiveResults, fetchSquadResults } from '../results/api'
import { retryUnlessFinalResults } from '../results/useResults'
import type { LiveResults } from '../results/types'
import { noticeText, parseLiveEvent, replaceDivision } from './liveLogic'
import { useNotices } from './useNotices'

/** How often the TV loads everything again, whatever the stream says (RES-52, D-246). */
export const LIVE_REFRESH_MS = 60_000

/** How long an updated table keeps its outline (D-245). */
export const HIGHLIGHT_MS = 4000

export const liveKeys = {
  feed: (tournamentId: string) => [...tournamentKeys.detail(tournamentId), 'live-results'] as const,
}

export interface LiveFeed {
  data: LiveResults | undefined
  error: Error | null
  /** The last good answer is old: a refresh failed after one worked (RES-52). */
  stale: boolean
  /** When the answer on screen was loaded, a time in milliseconds. */
  loadedAt: number
  stream: LiveState
  /** The message of the strip now, or `undefined` when none waits (D-245). */
  notice: string | undefined
  /** The screen that just changed: `session/division`, `session` for a sweeper (D-245). */
  highlighted: string | undefined
}

/**
 * The TV page's data (RES-47 to RES-52): everything once, then the stream's messages one division
 * at a time (D-244), with a refresh of everything every minute as a safety net (D-246). A message
 * that names a division in the feed loads only that division and swaps it in; anything else (a
 * sweeper, a complete, a division or session not in the feed, a message it cannot read) loads
 * everything again. Each game that fills posts a line on the strip and outlines its table for a few
 * seconds. A failed refresh keeps the last answer on screen and marks it stale.
 */
export function useLiveResults(tournamentId: string): LiveFeed {
  const queryClient = useQueryClient()
  const key = liveKeys.feed(tournamentId)
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchLiveResults(tournamentId),
    retry: retryUnlessFinalResults,
    // A TV tab counts as hidden to some browsers when nobody is looking at it: ask anyway.
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: true,
  })
  const notices = useNotices()
  const [highlight, setHighlight] = useState<string>()

  const everything = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key })
  }, [queryClient, key])

  // The outline goes away on its own. An effect is right here: a timer is outside React.
  useEffect(() => {
    if (highlight === undefined) return
    const timer = setTimeout(() => {
      setHighlight(undefined)
    }, HIGHLIGHT_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [highlight])

  const stream = useEventStream(
    `/v1/tournaments/${tournamentId}/live-results/events`,
    true,
    {
      onChange: (kind, detail) => {
        const event = parseLiveEvent(kind, detail)
        if (!event) {
          everything()
          return
        }
        const current = queryClient.getQueryData<LiveResults>(key)
        const text = noticeText(event, current)
        if (text) notices.push(text)

        const { sessionId, sessionKind, divisionId } = event.detail
        if (event.kind === 'complete' || sessionKind === 'sweeper' || !divisionId || !current) {
          everything()
          if (event.kind === 'game-full')
            setHighlight(sessionKind === 'squad' ? undefined : sessionId)
          return
        }
        fetchSquadResults(tournamentId, sessionId, 'full-game', divisionId)
          .then((results) => {
            const division = results.divisions.find((candidate) => candidate.id === divisionId)
            const latest = queryClient.getQueryData<LiveResults>(key)
            const next = division && latest && replaceDivision(latest, sessionId, division)
            if (next) {
              queryClient.setQueryData(key, next)
              if (event.kind === 'game-full') setHighlight(`${sessionId}/${divisionId}`)
            } else {
              everything()
            }
          })
          .catch(everything)
      },
      onReconnect: everything,
    },
    // Every message counts: one for each division that filled (D-243).
    { join: false },
  )

  return {
    data: query.data,
    error: query.error,
    stale: query.isRefetchError,
    loadedAt: query.dataUpdatedAt,
    stream,
    notice: notices.current,
    highlighted: highlight,
  }
}
