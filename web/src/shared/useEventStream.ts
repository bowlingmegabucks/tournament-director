import { useEffect, useEffectEvent, useState } from 'react'
import { apiUrl } from './apiUrl'

/** How a page sees a live stream: connected, trying again, or given up (D-217). */
export type LiveState = 'live' | 'reconnecting' | 'off'

export interface StreamHandlers {
  /** A `changed` message came. `kind` is why (`lanes`, `entries`, `scores`), or `unknown` (D-218). */
  onChange: (kind: string) => void
  /** The stream came back after a drop. Messages are not replayed, so ask again (D-218). */
  onReconnect: () => void
}

/** Messages closer together than this reach the page as one. */
export const MESSAGE_WINDOW_MS = 1000

/** How often a page without a live stream asks again (the poll the stream replaced, D-72). */
export const FALLBACK_POLL_MS = 15000

/** The kind a message names. A message that does not parse still means "something changed". */
function kindOf(data: unknown): string {
  if (typeof data !== 'string') return 'unknown'
  try {
    const parsed: unknown = JSON.parse(data)
    if (typeof parsed === 'object' && parsed !== null && 'kind' in parsed) {
      return typeof parsed.kind === 'string' ? parsed.kind : 'unknown'
    }
  } catch {
    // Not JSON: treat it as a change of unknown kind.
  }
  return 'unknown'
}

/**
 * Listens to one server-sent event stream and tells the page when something changed (LAN-21,
 * SCR-18, D-217, D-218). The browser reconnects on its own; a reconnect after a drop calls
 * `onReconnect`. The stream closes when the page leaves or `enabled` is false (a complete
 * session, D-10). A browser with no `EventSource`, or a stream the server refused for good (a
 * lost sign-in), is `off`: the page still works, it just does not refresh itself. `path` is an API
 * path; the cookie goes with it, which a signed-in stream needs and a public one ignores.
 *
 * An effect is right here: the stream is a subscription to something outside React. The handlers
 * are effect events, so the latest ones run without reopening the stream.
 */
export function useEventStream(
  path: string,
  enabled: boolean,
  handlers: StreamHandlers,
): LiveState {
  const supported = typeof EventSource !== 'undefined'
  const [state, setState] = useState<LiveState>('reconnecting')
  const onChange = useEffectEvent(handlers.onChange)
  const onReconnect = useEffectEvent(handlers.onReconnect)

  // No stream, no refresh: while the stream is not live, ask again on a timer, so a page whose
  // stream dropped or was refused for good (and a viewer who was rate limited) still catches up.
  const polling = enabled && supported && state !== 'live'
  useEffect(() => {
    if (!polling) return
    const timer = setInterval(() => {
      onReconnect()
    }, FALLBACK_POLL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [polling])

  useEffect(() => {
    if (!enabled || !supported) return
    const source = new EventSource(apiUrl(path), { withCredentials: true })
    let dropped = false
    // Messages come in bursts when several keepers save. The first runs at once; the rest in the
    // window join into one call, so a busy squad does not cost every viewer a request per save.
    let last = Number.NEGATIVE_INFINITY
    let pending: { kind: string; timer: ReturnType<typeof setTimeout> } | undefined
    const deliver = (kind: string) => {
      last = Date.now()
      onChange(kind)
    }

    source.onopen = () => {
      setState('live')
      if (dropped) {
        dropped = false
        onReconnect()
      }
    }
    source.onerror = () => {
      dropped = true
      // The browser retries on its own; CLOSED means it gave up (401, 403, or a server error page).
      setState(source.readyState === EventSource.CLOSED ? 'off' : 'reconnecting')
    }
    source.addEventListener('changed', (event) => {
      const kind = kindOf(event.data)
      const wait = last + MESSAGE_WINDOW_MS - Date.now()
      if (wait <= 0 && !pending) {
        deliver(kind)
        return
      }
      // Joined messages keep the one that matters to more pages: a `scores` message is the one a
      // lane page ignores, so any other kind in the window wins over it.
      if (pending) {
        if (pending.kind === 'scores') pending.kind = kind
        return
      }
      const waiting = {
        kind,
        timer: setTimeout(() => {
          pending = undefined
          deliver(waiting.kind)
        }, wait),
      }
      pending = waiting
    })

    return () => {
      if (pending) clearTimeout(pending.timer)
      source.close()
    }
  }, [enabled, supported, path])

  return enabled && supported ? state : 'off'
}
