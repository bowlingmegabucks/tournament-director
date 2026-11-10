import { metrics } from '@opentelemetry/api'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionEvents } from '../../shared/events/sessionEvents.ts'
import { createSquad, createSweeper, createTournament } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createStreamReader } from '../../test/streamReader.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'

const { readStream, closeAll } = createStreamReader()
afterEach(closeAll)

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
  const squadUrl = `/v1/tournaments/${tournament.id}/squads/${squad.id}/scores/events`
  const sweeperUrl = `/v1/tournaments/${tournament.id}/sweepers/${sweeper.id}/scores/events`
  return { overrides, events, tournament, squad, sweeper, squadUrl, sweeperUrl }
}

describe('GET .../scores/events (SCR-20)', () => {
  it('streams to anyone, with no sign-in, and carries a scores change (D-232, D-70)', async () => {
    const { overrides, events, squad, squadUrl } = setup()
    const stream = await readStream(createTestApp(overrides), squadUrl, 'retry')

    await stream.until()
    events.publish(squad.id, 'scores')

    expect(stream.response.status).toBe(200)
    expect(stream.response.headers.get('content-type')).toContain('text/event-stream')
    expect(await stream.untilText('"version"')).toContain('"kind":"scores"')
  })

  it('also carries a lane or entry change, since the page shows both (D-218)', async () => {
    const { overrides, events, squad, squadUrl } = setup()
    const stream = await readStream(createTestApp(overrides), squadUrl, 'retry')
    await stream.until()

    events.publish(squad.id, 'lanes')

    expect(await stream.untilText('"version"')).toContain('"kind":"lanes"')
  })

  it('streams for a sweeper (SCR-20)', async () => {
    const { overrides, sweeperUrl } = setup()
    const stream = await readStream(createTestApp(overrides), sweeperUrl, 'retry')
    await stream.until()
    expect(stream.response.status).toBe(200)
  })

  it('sends nothing for another session (D-217)', async () => {
    const { overrides, events, squadUrl, sweeper } = setup()
    const stream = await readStream(createTestApp(overrides), squadUrl, 'retry')
    await stream.until()

    events.publish(sweeper.id, 'scores')
    events.publish('b0000000-0000-4000-8000-000000000009', 'scores')

    // The stream is quiet: it holds only the retry line until the heartbeat.
    const race = await Promise.race([
      stream.untilText('"version"').then(() => 'message'),
      new Promise((resolve) => setTimeout(() => resolve('quiet'), 150)),
    ])
    expect(race).toBe('quiet')
  })

  it('answers 404 for an unknown tournament, session, and the wrong kind (SCR-20)', async () => {
    const { overrides, tournament, squad, sweeper } = setup()
    const app = createTestApp(overrides)
    const unknown = '00000000-0000-4000-8000-000000000000'

    const noTournament = await request(app).get(
      `/v1/tournaments/${unknown}/squads/${squad.id}/scores/events`,
    )
    const noSession = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${unknown}/scores/events`,
    )
    const wrongKind = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${sweeper.id}/scores/events`,
    )

    expect(noTournament.body).toEqual({ message: 'Tournament not found' })
    expect(noSession.body).toEqual({ message: 'Squad not found' })
    expect(wrongKind.body).toEqual({ message: 'Squad not found' })
  })

  it('answers 400 for an id that is not a UUID (SCR-20)', async () => {
    const { overrides, tournament } = setup()
    const response = await request(createTestApp(overrides)).get(
      `/v1/tournaments/${tournament.id}/squads/nope/scores/events`,
    )
    expect(response.status).toBe(400)
  })
})
