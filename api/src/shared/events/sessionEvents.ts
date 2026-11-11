import type { Meter } from '@opentelemetry/api'
import type { Logger } from '../logger.ts'

/** Why a session changed (D-218): a lane move or a session edit, an entry added, changed, or removed, or a score saved or cleared (D-232). */
export type ChangeKind = 'lanes' | 'entries' | 'scores' | 'game-full' | 'reopened' | 'complete'

/**
 * Where a live-results message points (D-243): ids and a number, never a score. Only the tournament
 * stream carries one; a session stream sends none.
 */
export interface ChangeDetail {
  sessionId: string
  sessionKind: 'squad' | 'sweeper'
  /** The division of a squad. A sweeper has none. */
  divisionId?: string
  /** The division's name, so a screen can say it before it has loaded that division. */
  divisionName?: string
  /** The game that just filled (`game-full`). */
  game?: number
}

/** What a screen is told (D-218): that something changed, never what. The page refetches. */
export interface ChangeEvent {
  kind: ChangeKind
  detail?: ChangeDetail
  /** Counts up for the whole process, so a client can tell two messages apart. */
  version: number
}

/** One open screen. `send` writes a message; `end` closes its connection. */
export interface Subscriber {
  send(event: ChangeEvent): void
  end(): void
}

/**
 * Who is watching which squad or sweeper, kept in this Node process (D-217, D-221, D-224). The
 * Node twin of a SignalR hub group, with one instance and no history: a screen that missed a
 * message refetches when it reconnects (D-218).
 */
export interface SessionEvents {
  /** Start watching a session. `undefined` when the process holds too many streams; else a way to stop. */
  subscribe(sessionId: string, subscriber: Subscriber): (() => void) | undefined
  /** Tell every screen watching the session. Never throws: a failed send is logged, not raised. */
  publish(sessionId: string, kind: ChangeKind, detail?: ChangeDetail): void
  /** Whether anyone is watching this id now. A cheap check before work only a watcher needs. */
  watching(sessionId: string): boolean
  /** End every stream, for a shutdown: an open stream never finishes on its own. */
  closeAll(): void
  /** Streams open now. */
  count(): number
}

/** No more streams than this (D-217): a desk or two with a few tabs each, plus public viewers later. */
export const MAX_STREAMS = 500

export function createSessionEvents(
  logger: Logger,
  meter: Meter,
  max = MAX_STREAMS,
): SessionEvents {
  const watchers = new Map<string, Set<Subscriber>>()
  let total = 0
  let version = 0
  // Stryker disable next-line ObjectLiteral: the options only carry a description, which nothing reads.
  const connections = meter.createUpDownCounter('tournament_director.events.connections', {
    // Stryker disable next-line all: the description labels the metric and nothing reads it.
    description: 'Open event streams.',
  })
  // Stryker disable next-line ObjectLiteral: the options only carry a description, which nothing reads.
  const published = meter.createCounter('tournament_director.events.published', {
    // Stryker disable next-line all: the description labels the metric and nothing reads it.
    description: 'Change messages published.',
  })

  function remove(sessionId: string, subscriber: Subscriber): void {
    const set = watchers.get(sessionId)
    if (!set?.delete(subscriber)) return
    // Stryker disable next-line all: an empty set only holds a little memory; no read can tell.
    if (set.size === 0) watchers.delete(sessionId)
    total -= 1
    connections.add(-1)
    logger.debug({ sessionId, streams: total }, 'Event stream closed')
  }

  return {
    subscribe(sessionId, subscriber) {
      if (total >= max) return undefined
      const set = watchers.get(sessionId) ?? new Set<Subscriber>()
      set.add(subscriber)
      watchers.set(sessionId, set)
      total += 1
      connections.add(1)
      logger.debug({ sessionId, streams: total }, 'Event stream opened')
      return () => {
        remove(sessionId, subscriber)
      }
    },

    publish(sessionId, kind, detail) {
      version += 1
      const event: ChangeEvent = detail ? { kind, detail, version } : { kind, version }
      const set = watchers.get(sessionId)
      published.add(1, { kind })
      logger.debug({ sessionId, kind, watchers: set?.size ?? 0 }, 'Change published')
      // A Set may lose members while we loop over it: the loop skips them and stays safe.
      for (const subscriber of set ?? []) {
        try {
          subscriber.send(event)
        } catch (err) {
          logger.warn({ err, sessionId }, 'Could not send a change message')
        }
      }
    },

    watching: (sessionId) => (watchers.get(sessionId)?.size ?? 0) > 0,

    closeAll() {
      for (const [sessionId, set] of watchers) {
        for (const subscriber of set) {
          remove(sessionId, subscriber)
          try {
            subscriber.end()
          } catch (err) {
            logger.warn({ err, sessionId }, 'Could not end an event stream')
          }
        }
      }
    },

    count: () => total,
  }
}
