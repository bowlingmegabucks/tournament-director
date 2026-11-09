import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { createDivision, createTournament, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createCommonBowler } from './bowler.testData.ts'
import { createInMemoryRegistrationWriter } from './writer.ts'

const squadId = '22222222-2222-4222-8222-222222222222'
const otherSquadId = '33333333-3333-4333-8333-333333333333'

function world(completed = false) {
  const tournament = createTournament({ startDate: '2026-10-23' })
  const division = createDivision({ name: 'Scratch' })
  const bowler = createCommonBowler({ usbcId: '1234-56789' })
  const { writer, state } = createInMemoryRegistrationWriter({
    bowlers: [bowler],
    divisions: [{ id: division.id, tournamentId: tournament.id }],
    sessions: [
      { id: squadId, tournamentId: tournament.id, kind: 'squad', complete: false },
      { id: otherSquadId, tournamentId: tournament.id, kind: 'squad', complete: false },
    ],
  })
  const overrides = {
    tournaments: createInMemoryTournamentRepository(
      [tournament],
      {},
      {
        [tournament.id]: {
          games: 5,
          finalsRatio: 8,
          cashRatio: 5,
          superSweeperCashRatio: 8,
          completed,
        },
      },
    ),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division }]),
    registrationWriter: writer,
  }
  const url = `/v1/tournaments/${tournament.id}/registrations`
  const body = (extra: Record<string, unknown> = {}) => ({
    divisionId: division.id,
    average: 180,
    squadIds: [squadId],
    bowler: { firstName: 'Ann', lastName: 'Lee' },
    ...extra,
  })
  return { overrides, url, body, state, tournament, division, bowler }
}

describe('POST /v1/tournaments/{id}/registrations (D-157)', () => {
  it('creates a registration for a new bowler: 201, the id, and a Location (REG-01, API desk)', async () => {
    const { overrides, url, body, state } = world()

    const response = await request(createSignedInTestApp(overrides)).post(url).send(body())

    expect(response.status).toBe(201)
    const created = response.body as { registrationId: string; mode: string }
    expect(created.mode).toBe('created')
    expect(response.headers['location']).toBe(`/v1/registrations/${created.registrationId}`)
    expect(state.registrations[0]?.registration.id).toBe(created.registrationId)
    expect(state.bowlers).toHaveLength(2)
  })

  it('answers 409 alreadyRegistered with the existing registration, then appends when confirmed (D-159)', async () => {
    const { overrides, url, body, state, bowler, division } = world()
    const app = createSignedInTestApp(overrides)
    await request(app)
      .post(url)
      .send(body({ bowlerId: bowler.id }))

    const conflict = await request(app)
      .post(url)
      .send(body({ bowlerId: bowler.id, squadIds: [otherSquadId] }))
    const appended = await request(app)
      .post(url)
      .send(body({ bowlerId: bowler.id, squadIds: [otherSquadId], appendToExisting: true }))

    expect(conflict.status).toBe(409)
    expect(conflict.body).toMatchObject({
      message: 'Bowler is already registered for this tournament.',
      conflict: 'alreadyRegistered',
      existing: { divisionId: division.id, divisionName: 'Scratch', squadIds: [squadId] },
    })
    expect(appended.status).toBe(201)
    expect(appended.body).toMatchObject({ mode: 'appended' })
    expect(state.registrations).toHaveLength(1)
  })

  it('answers 409 usbcIdOnFile for a new bowler holding a stored USBC ID (D-161)', async () => {
    const { overrides, url, body, bowler } = world()

    const response = await request(createSignedInTestApp(overrides))
      .post(url)
      .send(body({ bowler: { firstName: 'Joe', lastName: 'Fontaine', usbcId: '1234-56789' } }))

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: 'A bowler with this USBC ID is on file.',
      conflict: 'usbcIdOnFile',
      bowler: { id: bowler.id, name: 'Joseph Fontaine, Jr' },
    })
  })

  it('answers 400 with a message per field and saves nothing (REG-02, REG-03)', async () => {
    const { overrides, url, body, state } = world()

    const response = await request(createSignedInTestApp(overrides))
      .post(url)
      .send(body({ squadIds: [], bowler: { firstName: '', lastName: 'Lee', email: 'bad' } }))

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'First Name is Required',
      errors: {
        'bowler.firstName': 'First Name is Required',
        'bowler.email': 'Invalid Email',
        squadIds: 'Bowler must enter at least one squad',
      },
    })
    expect(state.bowlers).toHaveLength(1)
  })

  it('answers 400 for a bad field value, with the field named (REG-16)', async () => {
    const { overrides, url, body } = world()

    const response = await request(createSignedInTestApp(overrides))
      .post(url)
      .send(body({ average: 400 }))

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Average must be less than or equal to 300.',
      errors: { average: 'Average must be less than or equal to 300.' },
    })
  })

  it('answers 400 for a body that is not JSON', async () => {
    const { overrides, url } = world()

    const response = await request(createSignedInTestApp(overrides))
      .post(url)
      .set('content-type', 'application/json')
      .send('{nope')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is not valid JSON.' })
  })

  it('answers 409 for a complete tournament (D-130)', async () => {
    const { overrides, url, body } = world(true)

    const response = await request(createSignedInTestApp(overrides)).post(url).send(body())

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: 'This tournament is complete.',
      errors: { form: 'This tournament is complete.' },
    })
  })

  it('answers 404 for an unknown tournament and an unknown bowler', async () => {
    const { overrides, url, body } = world()
    const app = createSignedInTestApp(overrides)

    const tournament = await request(app)
      .post('/v1/tournaments/99999999-9999-4999-8999-999999999999/registrations')
      .send(body())
    const bowler = await request(app)
      .post(url)
      .send(body({ bowlerId: '88888888-8888-4888-8888-888888888888' }))

    expect(tournament.status).toBe(404)
    expect(tournament.body).toEqual({ message: 'Tournament not found' })
    expect(bowler.status).toBe(404)
    expect(bowler.body).toEqual({ message: 'Bowler not found' })
  })

  it('answers 400 for a tournament id that is not a UUID', async () => {
    const response = await request(createSignedInTestApp())
      .post('/v1/tournaments/nope/registrations')
      .send({})

    expect(response.status).toBe(400)
  })

  it('logs who added it, where, and how, and no personal data (api-observability)', async () => {
    const captured = createCapturedLogger()
    const { overrides, url, body, tournament } = world()

    const response = await request(createSignedInTestApp({ ...overrides, logger: captured.logger }))
      .post(url)
      .send(body({ bowler: { firstName: 'Zelda', lastName: 'Quimby', email: 'z@example.com' } }))

    const line = captured
      .records()
      .find((record) => record['msg'] === 'Registration added at the desk')
    expect(line).toMatchObject({
      tournamentId: tournament.id,
      registrationId: (response.body as { registrationId: string }).registrationId,
      mode: 'created',
    })
    expect(line?.['actorId']).toEqual(expect.any(String))
    expect(JSON.stringify(line)).not.toMatch(/Zelda|Quimby|z@example/)
  })

  describe('who may call it (D-157, D-96, D-105)', () => {
    it('answers 401 when signed out', async () => {
      const { url } = world()

      expect((await request(createTestApp()).post(url).send({})).status).toBe(401)
    })

    it('answers 403 to the API key, which reaches the vendor routes only', async () => {
      const { overrides, url, body } = world()

      const response = await request(createTestApp(overrides))
        .post(url)
        .set(apiKeyHeader, testApiKey)
        .send(body())

      expect(response.status).toBe(403)
    })

    it('answers 403 to a score keeper', async () => {
      const { overrides, url, body } = world()

      const response = await request(createSignedInTestApp(overrides, 'scoreKeeper'))
        .post(url)
        .send(body())

      expect(response.status).toBe(403)
    })

    it.each(['director', 'admin'] as const)('lets a %s add a registration', async (role) => {
      const { overrides, url, body } = world()

      const response = await request(createSignedInTestApp(overrides, role)).post(url).send(body())

      expect(response.status).toBe(201)
    })

    it('leaves GET of the list on registrations.read (REG-23)', async () => {
      const { url } = world()

      expect((await request(createTestApp()).get(url)).status).toBe(401)
    })
  })
})
