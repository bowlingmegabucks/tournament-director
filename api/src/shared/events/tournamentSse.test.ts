import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { metrics } from '@opentelemetry/api'
import express from 'express'
import { afterEach, describe, expect, it } from 'vitest'
import { createCapturedLogger } from '../../test/logger.ts'
import { HttpError } from '../errors.ts'
import { createErrorHandler } from '../middleware.ts'
import { createSessionEvents } from './sessionEvents.ts'
import { createTournamentEventsRouter, liveKey } from './sseRoute.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const path = `/v1/tournaments/${tournamentId}/live-results/events`

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

function setup(options: { known?: boolean; max?: number } = {}) {
  const captured = createCapturedLogger('debug')
  const events = createSessionEvents(captured.logger, metrics.getMeter('test'), options.max)
  const app = express()
  app.use(
    '/v1/tournaments/:id/live-results/events',
    createTournamentEventsRouter({
      events,
      logger: captured.logger,
      check: async () => {
        if (options.known === false) throw new HttpError(404, 'Tournament not found')
        await Promise.resolve()
      },
    }),
  )
  app.use(createErrorHandler(captured.logger))
  const server = app.listen(0)
  servers.push(server)
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  async function open(url = path) {
    const controller = new AbortController()
    controllers.push(controller)
    const response = await fetch(base + url, { signal: controller.signal })
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let text = ''
    async function until(needle: string): Promise<string> {
      while (!text.includes(needle)) {
        const chunk = await reader?.read()
        if (!chunk || chunk.done) break
        text += decoder.decode(chunk.value)
      }
      return text
    }
    return { response, until }
  }
  return { events, open, captured }
}

describe('tournament live-results stream (RES-49, D-243)', () => {
  it('opens an event stream with the headers that keep it live', async () => {
    const { open } = setup()
    const stream = await open()
    await stream.until('retry')

    expect(stream.response.status).toBe(200)
    expect(stream.response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
    expect(stream.response.headers.get('x-accel-buffering')).toBe('no')
  })

  it('sends a game-full message with the division and game, and no score (D-243)', async () => {
    const { open, events } = setup()
    const stream = await open()
    await stream.until('retry')

    events.publish(liveKey(tournamentId), 'game-full', {
      sessionId,
      sessionKind: 'squad',
      divisionId: '33333333-3333-4333-8333-333333333333',
      game: 3,
    })

    const text = await stream.until('"version"')
    expect(text).toContain('event: changed')
    expect(text).toContain('"kind":"game-full"')
    expect(text).toContain('"game":3')
    expect(text).toContain('"divisionId":"33333333-3333-4333-8333-333333333333"')
    expect(text).not.toMatch(/score|total/i)
  })

  it('sends nothing from another tournament or from a session (RES-49)', async () => {
    const { open, events } = setup()
    const stream = await open()
    await stream.until('retry')

    events.publish(liveKey('99999999-9999-4999-8999-999999999999'), 'complete', {
      sessionId,
      sessionKind: 'squad',
    })
    events.publish(sessionId, 'scores')
    events.publish(liveKey(tournamentId), 'complete', { sessionId, sessionKind: 'sweeper' })

    const text = await stream.until('"version"')
    expect(text).toContain('"kind":"complete"')
    expect(text).toContain('"sessionKind":"sweeper"')
    expect(text).not.toContain('"kind":"scores"')
  })

  it('answers 404 for an unknown tournament and 400 for a bad id (RES-49)', async () => {
    const unknown = setup({ known: false })
    expect((await unknown.open()).response.status).toBe(404)
    const bad = setup()
    expect((await bad.open('/v1/tournaments/nope/live-results/events')).response.status).toBe(400)
  })

  it('answers 503 when the process holds too many streams (D-217)', async () => {
    const { open } = setup({ max: 0 })
    expect((await open()).response.status).toBe(503)
  })

  it('says it is watching, so a save can skip work nobody needs (RES-49)', async () => {
    const { open, events } = setup()
    expect(events.watching(liveKey(tournamentId))).toBe(false)
    const stream = await open()
    await stream.until('retry')
    expect(events.watching(liveKey(tournamentId))).toBe(true)
  })

  it('logs that a stream started, with the tournament id and no more', async () => {
    const { open, captured } = setup()
    const stream = await open()
    await stream.until('retry')

    const line = captured.records().find((entry) => entry.msg === 'Event stream started')
    expect(line).toMatchObject({ tournamentId })
  })
})
