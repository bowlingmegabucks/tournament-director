import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { metrics } from '@opentelemetry/api'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { createSessionEvents } from '../../shared/events/sessionEvents.ts'
import { createSquad, createSweeper, createTournament, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'

function setup() {
  const tournament = createTournament()
  const squad = createSquad()
  const sweeper = createSweeper()
  const logger = createCapturedLogger().logger
  const events = createSessionEvents(logger, metrics.getMeter('test'))
  const overrides = {
    logger,
    events,
    tournaments: createInMemoryTournamentRepository([tournament]),
    squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
    sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
  }
  const squadUrl = `/v1/tournaments/${tournament.id}/squads/${squad.id}/events`
  const sweeperUrl = `/v1/tournaments/${tournament.id}/sweepers/${sweeper.id}/events`
  return { overrides, events, tournament, squad, sweeper, squadUrl, sweeperUrl }
}

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

/** Open the stream on a real socket and read until `needle` shows. */
async function readStream(app: Parameters<typeof createServer>[1], url: string, needle: string) {
  const server = createServer(app)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const controller = new AbortController()
  controllers.push(controller)
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${url}`, {
    signal: controller.signal,
  })
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let text = ''
  async function until(target: string) {
    while (!text.includes(target)) {
      const chunk = await reader?.read()
      if (!chunk || chunk.done) break
      text += decoder.decode(chunk.value)
    }
    return text
  }
  return { response, until: () => until(needle), untilText: until }
}

describe('GET /v1/tournaments/:id/squads/:sessionId/events', () => {
  it('streams to a signed-in director, and carries a published change (LAN-19, D-217)', async () => {
    const { overrides, events, squad, squadUrl } = setup()
    const stream = await readStream(createSignedInTestApp(overrides, 'director'), squadUrl, 'retry')

    await stream.until()
    events.publish(squad.id, 'entries')

    expect(stream.response.status).toBe(200)
    expect(stream.response.headers.get('content-type')).toContain('text/event-stream')
    expect(await stream.untilText('"version"')).toContain('"kind":"entries"')
  })

  it('streams to a score keeper, who may watch but not move (D-216, D-217)', async () => {
    const { overrides, sweeperUrl } = setup()
    const stream = await readStream(
      createSignedInTestApp(overrides, 'scoreKeeper'),
      sweeperUrl,
      'retry',
    )
    await stream.until()
    expect(stream.response.status).toBe(200)
  })

  it('answers 401 with no sign-in', async () => {
    const { overrides, squadUrl } = setup()
    expect((await request(createTestApp(overrides)).get(squadUrl)).status).toBe(401)
  })

  it('answers 403 for the API key (D-96)', async () => {
    const { overrides, squadUrl } = setup()
    const response = await request(createTestApp(overrides))
      .get(squadUrl)
      .set(apiKeyHeader, testApiKey)
    expect(response.status).toBe(403)
  })

  it('answers 404 for an unknown tournament, an unknown session, and the wrong kind (LAN-14)', async () => {
    const { overrides, tournament, squad, sweeper } = setup()
    const app = createSignedInTestApp(overrides)
    const unknown = '00000000-0000-4000-8000-000000000000'

    const noTournament = await request(app).get(
      `/v1/tournaments/${unknown}/squads/${squad.id}/events`,
    )
    const noSession = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${unknown}/events`,
    )
    const wrongKind = await request(app).get(
      `/v1/tournaments/${tournament.id}/sweepers/${squad.id}/events`,
    )
    const wrongKindSquad = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${sweeper.id}/events`,
    )

    expect(noTournament.body).toEqual({ message: 'Tournament not found' })
    expect(noSession.body).toEqual({ message: 'Squad not found' })
    expect(wrongKind.body).toEqual({ message: 'Sweeper not found' })
    expect(wrongKindSquad.body).toEqual({ message: 'Squad not found' })
    expect([noTournament, noSession, wrongKind, wrongKindSquad].map((r) => r.status)).toEqual([
      404, 404, 404, 404,
    ])
  })
})
