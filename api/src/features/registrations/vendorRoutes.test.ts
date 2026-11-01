import { faker } from '@faker-js/faker'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import {
  createDivision,
  createSquad,
  createSweeper,
  createTournament,
  testApiKey,
} from '../../test/factories.ts'
import { sampleRequest } from '../../test/registrationRequests.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import type { Logger } from '../../shared/logger.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createCommonBowler } from './bowler.testData.ts'
import { createInMemoryRegistrationWriter, type InMemoryWriterSeed } from './writer.ts'
import {
  createRegistrationResponseSchema,
  registrationDetailResponseSchema,
} from './vendorTypes.ts'
import { problemSchema } from './problem.ts'

function setup(
  options: {
    division?: Parameters<typeof createDivision>[0]
    seed?: InMemoryWriterSeed
    logger?: Logger
  } = {},
) {
  const tournament = createTournament({ startDate: '2026-10-23' })
  const division = createDivision(options.division)
  const squad = createSquad()
  const secondSquad = createSquad()
  const sweeper = createSweeper()
  const { writer, state } = createInMemoryRegistrationWriter({
    divisions: [{ id: division.id, tournamentId: tournament.id }],
    sessions: [
      { id: squad.id, tournamentId: tournament.id, kind: 'squad', complete: false },
      { id: secondSquad.id, tournamentId: tournament.id, kind: 'squad', complete: false },
      { id: sweeper.id, tournamentId: tournament.id, kind: 'sweeper', complete: false },
    ],
    ...options.seed,
  })
  const deps = {
    ...(options.logger ? { logger: options.logger } : {}),
    tournaments: createInMemoryTournamentRepository([tournament]),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division }]),
    squads: createInMemorySquadRepository([
      { tournamentId: tournament.id, squad },
      { tournamentId: tournament.id, squad: secondSquad },
    ]),
    sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
    registrationWriter: writer,
  }
  const app = createTestApp(deps)
  const body = (overrides: Record<string, unknown> = {}) =>
    sampleRequest({
      tournamentId: tournament.id,
      divisionId: division.id,
      squads: [squad.id],
      sweepers: [],
      payment: null,
      ...overrides,
    })
  return { app, deps, state, tournament, division, squad, secondSquad, sweeper, body }
}

const asVendor = (test: request.Test) => test.set(apiKeyHeader, testApiKey)

describe('POST /v1/registrations (API-05)', () => {
  it('creates the registration: 201, the id, and a Location header (API-11)', async () => {
    const { app, state, body } = setup()

    const response = await asVendor(request(app).post('/v1/registrations')).send(body())

    expect(response.status).toBe(201)
    const created = createRegistrationResponseSchema.parse(response.body)
    expect(response.headers['location']).toBe(`/v1/registrations/${created.registrationId}`)
    expect(state.registrations[0]?.registration.id).toBe(created.registrationId)
  })

  it('accepts the sample body of the contract as it is (D-09)', async () => {
    const { app, tournament, division, squad, sweeper } = setup()
    const sample = sampleRequest({
      tournamentId: tournament.id,
      divisionId: division.id,
      squads: [squad.id],
      sweepers: [sweeper.id],
    })

    const response = await asVendor(request(app).post('/v1/registrations')).send(sample)

    expect(response.status).toBe(201)
  })

  it("appends to the bowler's registration and still answers 201 with its id (REG-01, API-11)", async () => {
    const { app, body, secondSquad } = setup()
    const first = await asVendor(request(app).post('/v1/registrations')).send(body())

    const second = await asVendor(request(app).post('/v1/registrations')).send(
      body({ squads: [secondSquad.id] }),
    )

    expect(second.status).toBe(201)
    expect(second.body).toEqual(first.body)
  })

  it('answers a repeated payment code with 201 and the same id, writing nothing more (D-109)', async () => {
    const { app, state, body } = setup()
    const payment = { processingSystem: 'Stripe', confirmationCode: 'ch_1', amount: 75 }
    const first = await asVendor(request(app).post('/v1/registrations')).send(body({ payment }))

    const again = await asVendor(request(app).post('/v1/registrations')).send(body({ payment }))

    expect(again.status).toBe(201)
    expect(again.body).toEqual(first.body)
    expect(state.registrations).toHaveLength(1)
  })

  it('answers a failed request check with a 400 problem body (API-09, API-12)', async () => {
    const { app, state } = setup()

    const response = await asVendor(request(app).post('/v1/registrations')).send({
      registration: {},
    })

    expect(response.status).toBe(400)
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/)
    const problem = problemSchema.parse(response.body)
    expect(problem.status).toBe(400)
    expect(problem.detail).toBe('An error occurred while creating the registration.')
    expect(problem.errors?.map((e) => e.code)).toContain('Registration.TournamentIdInvalid')
    expect(problem.traceId).toBe(response.headers['x-request-id'])
    expect(state.bowlers).toEqual([])
  })

  it('answers a missing body with Registration.Required (API-09)', async () => {
    const { app } = setup()

    const response = await asVendor(request(app).post('/v1/registrations'))

    expect(response.status).toBe(400)
    expect(response.body.errors[0].code).toBe('Registration.Required')
  })

  it('answers a body that is not JSON with a 400 problem body', async () => {
    const { app } = setup()

    const response = await asVendor(request(app).post('/v1/registrations'))
      .set('Content-Type', 'application/json')
      .send('{ not json')

    expect(response.status).toBe(400)
    expect(problemSchema.parse(response.body).status).toBe(400)
  })

  it('answers an eligibility failure with 400 (REG-04, D-107)', async () => {
    const { app, body } = setup({ division: { minimumAverage: 200 } })

    const response = await asVendor(request(app).post('/v1/registrations')).send(body())

    expect(response.status).toBe(400)
    expect(response.body.errors[0].description).toBe(
      'Minimum average requirement for division not met',
    )
  })

  it('answers a squad that is already on the registration with 400 (REG-11)', async () => {
    const { app, body } = setup()
    await asVendor(request(app).post('/v1/registrations')).send(body())

    const response = await asVendor(request(app).post('/v1/registrations')).send(body())

    expect(response.status).toBe(400)
    expect(response.body.detail).toBe('An error occurred while appending the registration.')
    expect(response.body.errors[0].description).toBe('The specified squads are already registered.')
  })

  it('answers an unknown tournament with 500, not 404 (API-12, D-09)', async () => {
    const { app, body } = setup()

    const response = await asVendor(request(app).post('/v1/registrations')).send(
      body({ tournamentId: faker.string.uuid() }),
    )

    expect(response.status).toBe(500)
    expect(response.body.errors[0].code).toBe('Tournament.NotFound')
  })

  it('does not log the bowler (SEC-13)', async () => {
    const captured = createCapturedLogger()
    const { app, body } = setup({ logger: captured.logger })

    await asVendor(request(app).post('/v1/registrations')).send(body())

    const lines = JSON.stringify(captured.records())
    expect(lines).toContain('Registration saved')
    expect(lines).not.toMatch(/Fontaine|joe@example|1234-56789|919/)
  })

  describe('who may call it (D-105)', () => {
    it('answers 401 with no key and no sign-in', async () => {
      const { app, body } = setup()
      const response = await request(app).post('/v1/registrations').send(body())
      expect(response.status).toBe(401)
    })

    it('lets a signed-in director create (registrations.write)', async () => {
      const { deps, body } = setup()

      const response = await request(createSignedInTestApp(deps, 'director'))
        .post('/v1/registrations')
        .send(body())

      expect(response.status).toBe(201)
    })

    it('refuses a score keeper, who holds no registrations.write', async () => {
      const { deps, body, state } = setup()

      const response = await request(createSignedInTestApp(deps, 'scoreKeeper'))
        .post('/v1/registrations')
        .send(body())

      expect(response.status).toBe(403)
      expect(state.bowlers).toEqual([])
    })

    it('answers 401 for a wrong key', async () => {
      const { app, body } = setup()
      const response = await request(app)
        .post('/v1/registrations')
        .set(apiKeyHeader, 'wrong')
        .send(body())
      expect(response.status).toBe(401)
    })
  })
})

describe('GET /v1/registrations/{id} (API-06)', () => {
  async function created() {
    const context = setup()
    const response = await asVendor(request(context.app).post('/v1/registrations')).send(
      context.body({ squads: [context.squad.id], sweepers: [context.sweeper.id] }),
    )
    return { ...context, id: createRegistrationResponseSchema.parse(response.body).registrationId }
  }

  it('returns the registration in the contract shape, without the SSN or payments (PAY-06, BWL-17)', async () => {
    const { app, id, tournament, division, squad, sweeper } = await created()

    const response = await asVendor(request(app).get(`/v1/registrations/${id}`))

    expect(response.status).toBe(200)
    const { registration } = registrationDetailResponseSchema.parse(response.body)
    expect(registration).toMatchObject({
      id,
      tournamentId: tournament.id,
      average: 185,
      superSweeper: false,
      division: { id: division.id },
      squads: [{ id: squad.id }],
      sweepers: [{ id: sweeper.id }],
      bowler: {
        firstName: 'Joe',
        phoneNumber: '9195551212',
        gender: 'Male',
        dateOfBirth: '1970-01-31',
        address: { city: 'Raleigh', zipCode: '27601' },
      },
    })
    expect(JSON.stringify(response.body)).not.toMatch(/social|ssn|payment/i)
  })

  it('answers 404 with a problem body for an unknown id', async () => {
    const { app } = setup()

    const response = await asVendor(request(app).get(`/v1/registrations/${faker.string.uuid()}`))

    expect(response.status).toBe(404)
    expect(problemSchema.parse(response.body)).toMatchObject({
      status: 404,
      detail: 'Resource not found',
    })
  })

  it('answers 400 for an id that is not a UUID', async () => {
    const { app } = setup()
    const response = await asVendor(request(app).get('/v1/registrations/nope'))
    expect(response.status).toBe(400)
  })

  it('needs the key or a sign-in (D-105)', async () => {
    const { app, id } = await created()
    expect((await request(app).get(`/v1/registrations/${id}`)).status).toBe(401)
  })

  it('shows a bowler a stored by legacy as stored (API-06)', async () => {
    const stored = createCommonBowler({ gender: null, dateOfBirth: null })
    const tournament = createTournament()
    const division = createDivision()
    const registrationId = faker.string.uuid()
    const { writer } = createInMemoryRegistrationWriter({
      bowlers: [stored],
      divisions: [{ id: division.id, tournamentId: tournament.id }],
      registrations: [
        {
          tournamentId: tournament.id,
          registration: {
            id: registrationId,
            bowlerId: stored.id,
            divisionId: division.id,
            average: null,
            superSweeper: false,
            sessionIds: [],
          },
        },
      ],
    })
    const app = createTestApp({
      divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division }]),
      registrationWriter: writer,
    })

    const response = await asVendor(request(app).get(`/v1/registrations/${registrationId}`))

    expect(response.body.registration.bowler).toMatchObject({ gender: null, dateOfBirth: null })
    expect(response.body.registration.average).toBeNull()
  })
})
