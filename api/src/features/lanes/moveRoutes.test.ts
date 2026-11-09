import { metrics } from '@opentelemetry/api'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { createSessionEvents, type ChangeEvent } from '../../shared/events/sessionEvents.ts'
import { createSquad, createSweeper, createTournament, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createInMemoryLaneWriter } from './writer.ts'

const mine = 'a0000000-0000-4000-8000-000000000001'
const friend = 'a0000000-0000-4000-8000-000000000002'

function setup(
  options: {
    complete?: boolean
    maxPerPair?: number
    role?: 'scoreKeeper'
    crowded?: boolean
  } = {},
) {
  const tournament = createTournament()
  const squad = createSquad({ startingLane: 1, numberOfLanes: 6, maxPerPair: 4 })
  const sweeper = createSweeper({ startingLane: 11, numberOfLanes: 4, maxPerPair: 4 })
  const captured = createCapturedLogger('debug')
  const events = createSessionEvents(captured.logger, metrics.getMeter('test'))
  const seen: { sessionId: string; event: ChangeEvent }[] = []
  for (const sessionId of [squad.id, sweeper.id]) {
    events.subscribe(sessionId, {
      send: (event) => seen.push({ sessionId, event }),
      end: () => undefined,
    })
  }
  const { writer, state } = createInMemoryLaneWriter({
    tournaments: [{ id: tournament.id }],
    sessions: [
      {
        id: squad.id,
        tournamentId: tournament.id,
        complete: options.complete,
        startingLane: 1,
        numberOfLanes: 6,
        maxPerPair: options.maxPerPair ?? 4,
      },
      {
        id: sweeper.id,
        tournamentId: tournament.id,
        kind: 'sweeper',
        startingLane: 11,
        numberOfLanes: 4,
        maxPerPair: 4,
      },
    ],
    entries: [
      { sessionId: squad.id, registrationId: mine },
      { sessionId: squad.id, registrationId: friend, position: '1A' },
      ...(options.crowded
        ? [
            {
              sessionId: squad.id,
              registrationId: 'a0000000-0000-4000-8000-000000000003',
              position: '2C',
            },
          ]
        : []),
      { sessionId: sweeper.id, registrationId: mine },
    ],
  })
  const overrides = {
    logger: captured.logger,
    laneWriter: writer,
    events,
    tournaments: createInMemoryTournamentRepository([tournament]),
    squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
    sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
  }
  const app = createSignedInTestApp(overrides, options.role ?? 'director')
  const url = (registrationId = mine, session = squad.id, plural = 'squads') =>
    `/v1/tournaments/${tournament.id}/${plural}/${session}/lanes/${registrationId}`
  return { app, overrides, url, tournament, squad, sweeper, state, seen, captured }
}

describe('PUT /v1/tournaments/:id/squads/:sessionId/lanes/:registrationId', () => {
  it('saves the seat the API picks and returns it (LAN-18, D-56, D-57)', async () => {
    const { app, url, state } = setup()

    const response = await request(app).put(url()).send({ lane: 1 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ position: '2C' })
    expect(state.entries.find((entry) => entry.registrationId === mine)?.position).toBe('2C')
  })

  it('moves a bowler on a sweeper the same way (LAN-18)', async () => {
    const { app, url, sweeper, state } = setup()

    const response = await request(app)
      .put(url(mine, sweeper.id, 'sweepers'))
      .send({ lane: 13 })

    expect(response.body).toEqual({ position: '13A' })
    expect(
      state.entries.find((entry) => entry.sessionId === sweeper.id && entry.registrationId === mine)
        ?.position,
    ).toBe('13A')
  })

  it('unassigns on a null lane (LAN-09)', async () => {
    const { app, url } = setup()
    const response = await request(app).put(url(friend)).send({ lane: null })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ position: '' })
  })

  it('answers the stored position and publishes nothing for the same pair (LAN-06)', async () => {
    const { app, url, seen } = setup()

    const response = await request(app).put(url(friend)).send({ lane: 1 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ position: '1A' })
    expect(seen).toEqual([])
  })

  it('tells every screen watching the session, after the save, and no other session (LAN-20, D-219)', async () => {
    const { app, url, seen, squad } = setup()

    await request(app).put(url()).send({ lane: 3 })

    expect(seen).toEqual([{ sessionId: squad.id, event: { kind: 'lanes', version: 1 } }])
  })

  it('publishes nothing when the move is refused (LAN-20)', async () => {
    const { app, url, seen } = setup({ complete: true })
    await request(app).put(url()).send({ lane: 1 })
    expect(seen).toEqual([])
  })

  it('refuses a full pair with 409 and the pair named (Q-28, D-216)', async () => {
    const { app, url, state, seen } = setup({ maxPerPair: 2, crowded: true })

    const response = await request(app).put(url()).send({ lane: 1 })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: 'Lanes 1-2 are full (2 of 2). Pick another pair.',
    })
    expect(state.entries.find((entry) => entry.registrationId === mine)?.position).toBe('')
    expect(seen).toEqual([])
  })

  it('refuses a complete squad with 409 (LAN-13, D-10)', async () => {
    const { app, url } = setup({ complete: true })

    const response = await request(app).put(url()).send({ lane: 1 })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message: 'This squad is complete. Lanes cannot change.' })
  })

  it('answers 404 for a registration not on the squad (LAN-05)', async () => {
    const { app, url } = setup()
    const response = await request(app)
      .put(url('a0000000-0000-4000-8000-000000000009'))
      .send({ lane: 1 })
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Bowler is not registered for this squad' })
  })

  it('says sweeper for a sweeper (LAN-05)', async () => {
    const { app, url, sweeper } = setup()
    const response = await request(app)
      .put(url('a0000000-0000-4000-8000-000000000009', sweeper.id, 'sweepers'))
      .send({ lane: 11 })
    expect(response.body).toEqual({ message: 'Bowler is not registered for this sweeper' })
  })

  it('answers 404 for an unknown tournament, and for a sweeper id under squads (LAN-14)', async () => {
    const { app, url, sweeper } = setup()
    const unknownTournament = await request(app)
      .put(
        `/v1/tournaments/00000000-0000-4000-8000-000000000000/squads/${sweeper.id}/lanes/${mine}`,
      )
      .send({ lane: 1 })
    expect(unknownTournament.status).toBe(404)
    const wrongKind = await request(app)
      .put(url(mine, sweeper.id, 'squads'))
      .send({ lane: 1 })
    expect(wrongKind.status).toBe(404)
    expect(wrongKind.body).toEqual({ message: 'Squad not found' })
  })

  it('answers 400 for a lane that does not start a pair (LAN-03)', async () => {
    const { app, url } = setup()
    const response = await request(app).put(url()).send({ lane: 2 })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Lane 2 is not the first lane of a pair in this squad',
    })
  })

  it('answers 422 when the pair size cannot seat lanes (LAN-02)', async () => {
    const { app, url } = setup({ maxPerPair: 6 })
    const response = await request(app).put(url()).send({ lane: 1 })
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ message: 'Bowlers per pair must be 2 to 5 to assign lanes' })
  })

  it.each([
    ['no lane', {}],
    ['a text lane', { lane: '1' }],
    ['a fraction', { lane: 1.5 }],
    ['zero', { lane: 0 }],
    ['over 199', { lane: 200 }],
    ['an extra key', { lane: 1, position: '1A' }],
  ])('answers 400 for %s', async (_name, body) => {
    const { app, url } = setup()
    const response = await request(app).put(url()).send(body)
    expect(response.status).toBe(400)
  })

  it('answers 400 for a body that is not JSON and for ids that are not UUIDs', async () => {
    const { app, url } = setup()
    expect(
      (await request(app).put(url()).set('content-type', 'application/json').send('{nope')).status,
    ).toBe(400)
    expect((await request(app).put(url('not-a-uuid')).send({ lane: 1 })).status).toBe(400)
  })

  it('logs ids and the lane at info, never a name (LAN-18)', async () => {
    const { app, url, captured, tournament, squad } = setup()
    await request(app).put(url()).send({ lane: 1 })

    const line = captured.records().find((entry) => entry['msg'] === 'Lane assignment saved')
    expect(line).toMatchObject({
      level: 30,
      tournamentId: tournament.id,
      squadId: squad.id,
      registrationId: mine,
      lane: 1,
    })
    for (const key of ['name', 'firstName', 'lastName']) expect(line).not.toHaveProperty(key)
  })

  it('logs a refused move and a full pair at info (LAN-13, Q-28)', async () => {
    const { app, url, captured } = setup({ complete: true })
    await request(app).put(url()).send({ lane: 1 })
    expect(
      captured
        .records()
        .some((entry) => entry['msg'] === 'Lane move refused: squad or tournament complete'),
    ).toBe(true)
  })

  describe('who may move a bowler (D-216, D-96)', () => {
    it('answers 401 with no sign-in', async () => {
      const { overrides, url } = setup()
      const response = await request(createTestApp(overrides)).put(url()).send({ lane: 1 })
      expect(response.status).toBe(401)
    })

    it('answers 403 for the API key, even a valid one', async () => {
      const { overrides, url } = setup()
      const response = await request(createTestApp(overrides))
        .put(url())
        .set(apiKeyHeader, testApiKey)
        .send({ lane: 1 })
      expect(response.status).toBe(403)
    })

    it('answers 403 for a score keeper, who may watch but not move', async () => {
      const { app, url, state } = setup({ role: 'scoreKeeper' })
      const response = await request(app).put(url()).send({ lane: 1 })
      expect(response.status).toBe(403)
      expect(state.entries.find((entry) => entry.registrationId === mine)?.position).toBe('')
    })
  })
})
