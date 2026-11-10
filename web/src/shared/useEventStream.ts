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

  useEffect(() => {
    if (!enabled || !supported) return
    const source = new EventSource(apiUrl(path), { withCredentials: true })
    let dropped = false

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
      onChange(kindOf(event.data))
    })

    return () => {
      source.close()
    }
  }, [enabled, supported, path])

  return enabled && supported ? state : 'off'
}
