import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useEventStream, type LiveState } from './useEventStream'

/** How long the "Updated: …" line and its highlighted rows stay. */
export const UPDATED_MS = 6000

/** What a pushed change touched: the line's text, the version that tells two apart, and more. */
export type LiveUpdate<Detail extends object> = { text: string; version: number } & Detail

export interface LivePage<Detail extends object> {
  state: LiveState
  /** What the last pushed change touched. Absent when nothing is new. */
  updated: LiveUpdate<Detail> | undefined
}

interface LivePageOptions<Page, Detail extends object> {
  /** The API path of the stream. */
  path: string
  queryKey: QueryKey
  enabled: boolean
  /** The message kinds this page ignores (a lane page ignores `scores`). */
  ignores?: string
  /** What changed between two answers, or `undefined` when nothing the page would say. */
  change: (before: Page, after: Page) => (Detail & { text: string }) | undefined
}

/**
 * Keeps one query fresh from a live stream and says what each push changed. A `changed` message
 * refetches and compares the answer with the one before; a reconnect after a drop refetches once.
 * A push that changes nothing (our own save) says nothing. The lane page and the Scores tab share
 * this and differ only in the stream, the query, and how they compare.
 */
export function useLivePage<Page, Detail extends object>({
  path,
  queryKey,
  enabled,
  ignores,
  change,
}: LivePageOptions<Page, Detail>): LivePage<Detail> {
  const queryClient = useQueryClient()
  const [updated, setUpdated] = useState<LiveUpdate<Detail>>()
  const version = useRef(0)
  const clear = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // The "Updated" line goes away on its own; leave no timer behind when the page does.
  useEffect(
    () => () => {
      clearTimeout(clear.current)
    },
    [],
  )

  const state = useEventStream(path, enabled, {
    onChange: (kind) => {
      if (kind === ignores) return
      const before = queryClient.getQueryData<Page>(queryKey)
      void queryClient.invalidateQueries({ queryKey }).then(() => {
        const after = queryClient.getQueryData<Page>(queryKey)
        if (!before || !after) return
        const found = change(before, after)
        if (!found) return
        version.current += 1
        setUpdated({ ...found, version: version.current })
        clearTimeout(clear.current)
        clear.current = setTimeout(() => {
          setUpdated(undefined)
        }, UPDATED_MS)
      })
    },
    onReconnect: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  return { state, updated }
}
