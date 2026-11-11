import type { SessionEvents } from '../shared/events/sessionEvents.ts'

/** A hub that only records, so a test sees exactly what a route published and to which session. */
export function recordingEvents() {
  const published: { sessionId: string; kind: string }[] = []
  const events: SessionEvents = {
    subscribe: () => undefined,
    publish: (sessionId, kind) => published.push({ sessionId, kind }),
    closeAll: () => undefined,
    count: () => 0,
    watching: () => false,
  }
  return { events, published }
}
