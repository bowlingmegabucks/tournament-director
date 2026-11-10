import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../errors.ts'
import type { Logger } from '../logger.ts'
import { requestLogger } from '../requestLogging.ts'
import type { SessionEvents } from './sessionEvents.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid() })

/** Azure's front end closes a connection that is quiet for about 4 minutes; stay well inside it. */
export const HEARTBEAT_MS = 25_000

/** How long a browser waits before it reconnects (the SSE `retry` field). */
const RETRY_MS = 5_000

export interface SseRouteDeps {
  events: SessionEvents
  /** Resolves when the tournament and the session exist, or throws the 404. */
  check: (tournamentId: string, sessionId: string) => Promise<void>
  logger: Logger
  heartbeatMs?: number
}

/** The hub id of a tournament's live-results stream (D-243). A session id is a UUID, so no clash. */
export const liveKey = (tournamentId: string) => `live:${tournamentId.toLowerCase()}`

interface StreamDeps {
  events: SessionEvents
  logger: Logger
  heartbeatMs?: number
}

/**
 * The stream itself: a server-sent event stream (D-217). It sends `retry`, a `changed` event
 * whenever the hub id publishes (D-218), and a comment every 25 s so no proxy closes it as idle. No
 * compression and no caching, or the messages would wait in a buffer. `resolve` checks the request
 * and names the hub id to watch, or throws the 404. The browser's `EventSource` reconnects by itself;
 * the page refetches when it does.
 */
function createStreamRouter(
  { events, logger, heartbeatMs = HEARTBEAT_MS }: StreamDeps,
  resolve: (params: unknown) => Promise<{ watchId: string; fields: Record<string, string> }>,
): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    // Listen first: a browser that leaves during the check must not leave a stream behind.
    let closed = false
    let cleanup = () => undefined
    req.on('close', () => {
      closed = true
      cleanup()
    })
    const { watchId, fields } = await resolve(req.params)
    if (closed) return

    const stop = events.subscribe(watchId, {
      send: (event) => {
        res.write(`event: changed\ndata: ${JSON.stringify(event)}\n\n`)
      },
      end: () => {
        res.end()
      },
    })
    if (!stop) throw new HttpError(503, 'Too many live connections. Try again shortly.')

    res.setHeader('content-type', 'text/event-stream; charset=utf-8')
    // no-transform keeps a proxy from compressing or rewriting; x-accel-buffering stops nginx-style buffering.
    res.setHeader('cache-control', 'no-cache, no-transform')
    res.setHeader('x-accel-buffering', 'no')

    // Stryker disable next-line all: the first write sends the headers anyway; this only sends them at once.
    res.flushHeaders()
    res.write(`retry: ${RETRY_MS}\n\n`)
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n')
    }, heartbeatMs)
    cleanup = () => {
      clearInterval(heartbeat)
      stop()
    }
    requestLogger(res, logger).debug(fields, 'Event stream started')
  })

  return router
}

/** The stream of one squad or sweeper (D-217). */
export function createSessionEventsRouter({
  events,
  check,
  logger,
  heartbeatMs,
}: SseRouteDeps): Router {
  return createStreamRouter({ events, logger, heartbeatMs }, async (raw) => {
    const { id, sessionId } = params.parse(raw)
    await check(id, sessionId)
    return { watchId: sessionId, fields: { sessionId } }
  })
}

const tournamentParams = z.object({ id: z.uuid() })

export interface TournamentSseDeps {
  events: SessionEvents
  /** Resolves when the tournament exists, or throws the 404. */
  check: (tournamentId: string) => Promise<void>
  logger: Logger
  heartbeatMs?: number
}

/**
 * The stream of a whole tournament's live results (RES-49, D-243): a message for each division
 * that gained a full game, and for each session that completes. It carries ids and a game number,
 * never a score; the TV refetches.
 */
export function createTournamentEventsRouter({
  events,
  check,
  logger,
  heartbeatMs,
}: TournamentSseDeps): Router {
  return createStreamRouter({ events, logger, heartbeatMs }, async (raw) => {
    const { id } = tournamentParams.parse(raw)
    await check(id)
    return { watchId: liveKey(id), fields: { tournamentId: id } }
  })
}
