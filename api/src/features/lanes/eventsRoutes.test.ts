import { metrics } from '@opentelemetry/api'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { createSessionEvents } from '../../shared/events/sessionEvents.ts'
import { createSquad, createSweeper, createTournament, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createStreamReader } from '../../test/streamReader.ts'
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

const { readStream, closeAll } = createStreamReader()
afterEach(closeAll)

describe('GET /v1/tournaments/:id/squads/:sessionId/events', () => {
  it('streams to a signed-in director, and carries a published change (LAN-21, D-217)', async () => {
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
