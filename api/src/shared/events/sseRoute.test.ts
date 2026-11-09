import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { metrics } from '@opentelemetry/api'
import express from 'express'
import { afterEach, describe, expect, it } from 'vitest'
import { createCapturedLogger } from '../../test/logger.ts'
import { HttpError } from '../errors.ts'
import { createErrorHandler } from '../middleware.ts'
import { createSessionEvents } from './sessionEvents.ts'
import { createSessionEventsRouter } from './sseRoute.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const path = `/v1/tournaments/${tournamentId}/squads/${sessionId}/events`

const servers: Server[] = []
const controllers: AbortController[] = []
afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.abort()
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => {
            resolve()
          })
        }),
    ),
  )
})

function setup(options: { max?: number; heartbeatMs?: number; known?: boolean } = {}) {
  const { logger } = createCapturedLogger()
  const events = createSessionEvents(logger, metrics.getMeter('test'), options.max)
  const app = express()
  app.use(
    '/v1/tournaments/:id/squads/:sessionId/events',
    createSessionEventsRouter({
      events,
      logger,
      heartbeatMs: options.heartbeatMs,
      check: () => {
        if (options.known === false) throw new HttpError(404, 'Squad not found')
        return Promise.resolve()
      },
    }),
  )
  app.use(createErrorHandler(logger))
  const server = app.listen(0)
  servers.push(server)
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  async function open(url = path) {
    const controller = new AbortController()
    controllers.push(controller)
    const response = await fetch(base + url, { signal: controller.signal })
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    const decoder = new TextDecoder()
    let text = ''
    /** Read until the text holds `needle`, or the stream ends. */
    async function until(needle: string): Promise<string> {
      while (!text.includes(needle)) {
        reader ??= response.body?.getReader()
        const chunk = await reader?.read()
        if (!chunk || chunk.done) break
        text += decoder.decode(chunk.value)
      }
      return text
    }
    return { response, until, close: () => controller.abort(), text: () => text }
  }
  return { events, open }
}

describe('session events route', () => {
  it('opens an event stream with the headers that keep it live (D-217)', async () => {
    const { open } = setup()
    const stream = await open()
    await stream.until('retry')

    expect(stream.response.status).toBe(200)
    expect(stream.response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
    expect(stream.response.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(stream.response.headers.get('x-accel-buffering')).toBe('no')
  })

  it('tells the browser how long to wait before it reconnects (D-217)', async () => {
    const { open } = setup()
    const stream = await open()
    expect(await stream.until('retry: 5000\n\n')).toContain('retry: 5000\n\n')
  })

  it('sends a changed message when the session publishes (LAN-19, D-218)', async () => {
    const { open, events } = setup()
    const stream = await open()
    await stream.until('retry')

    events.publish(sessionId, 'lanes')

    expect(await stream.until('"version"')).toContain(
      'event: changed\ndata: {"kind":"lanes","version":1}\n\n',
    )
  })

  it('does not send another session’s changes (D-217)', async () => {
    const { open, events } = setup()
    const stream = await open()
    await stream.until('retry')

    events.publish('33333333-3333-4333-8333-333333333333', 'lanes')
    events.publish(sessionId, 'entries')

    const text = await stream.until('"version"')
    expect(text).toContain('"kind":"entries"')
    expect(text).not.toContain('"kind":"lanes"')
  })

  it('sends a heartbeat comment so no proxy closes it as idle (D-217)', async () => {
    const { open } = setup({ heartbeatMs: 20 })
    const stream = await open()
    expect(await stream.until(': heartbeat\n\n')).toContain(': heartbeat\n\n')
  })

  it('stops watching when the browser leaves (D-217)', async () => {
    const { open, events } = setup()
    const stream = await open()
    await stream.until('retry')
    expect(events.count()).toBe(1)

    stream.close()

    await expect.poll(() => events.count()).toBe(0)
  })

  it('ends the response on closeAll, so a shutdown does not wait (D-217)', async () => {
    const { open, events } = setup()
    const stream = await open()
    await stream.until('retry')

    events.closeAll()

    await stream.until('never appears')
    expect(events.count()).toBe(0)
  })

  it('answers 404 as JSON for an unknown session, and opens no stream (LAN-14)', async () => {
    const { open, events } = setup({ known: false })
    const stream = await open()

    expect(stream.response.status).toBe(404)
    expect(stream.response.headers.get('content-type')).toContain('application/json')
    expect(await stream.response.json()).toEqual({ message: 'Squad not found' })
    expect(events.count()).toBe(0)
  })

  it('answers 400 for an id that is not a UUID (LAN-14)', async () => {
    const { open } = setup()
    const stream = await open(`/v1/tournaments/${tournamentId}/squads/not-a-uuid/events`)
    expect(stream.response.status).toBe(400)
  })

  it('answers 503 as JSON past the connection limit, not as a stream (D-217)', async () => {
    const { open } = setup({ max: 1 })
    const first = await open()
    await first.until('retry')

    const second = await open()

    expect(second.response.status).toBe(503)
    expect(second.response.headers.get('content-type')).toContain('application/json')
    expect(await second.response.json()).toEqual({
      message: 'Too many live connections. Try again shortly.',
    })
  })
})
