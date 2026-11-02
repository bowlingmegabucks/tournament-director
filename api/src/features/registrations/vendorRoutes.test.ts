import { faker } from '@faker-js/faker'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
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
    expect(problemSchema.parse(response.body)).toMatchObject({
      status: 400,
      detail: 'An error occurred while creating the registration.',
      errors: [
        { code: 'Registration.Required', description: 'The request body is not valid JSON.' },
      ],
      traceId: response.headers['x-request-id'],
    })
  })

  it('answers a body over 100 KB with a 413 problem body', async () => {
    const { app } = setup()

    const response = await asVendor(request(app).post('/v1/registrations'))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ registration: { padding: 'x'.repeat(200_000) } }))

    expect(response.status).toBe(413)
    expect(problemSchema.parse(response.body).status).toBe(413)
  })

  it('logs the codes of a refusal and the id of a save, never the bowler (SEC-13)', async () => {
    const captured = createCapturedLogger()
    const { app, body } = setup({ division: { minimumAverage: 250 }, logger: captured.logger })

    await asVendor(request(app).post('/v1/registrations')).send(body())

    const refused = captured.records().find((r) => r['msg'] === 'Registration refused')
    expect(refused?.['codes']).toEqual(['Registration.AverageTooLow'])
  })

  it('logs the id and mode of a save', async () => {
    const captured = createCapturedLogger()
    const { app, body } = setup({ logger: captured.logger })

    const response = await asVendor(request(app).post('/v1/registrations')).send(body())

    const saved = captured.records().find((r) => r['msg'] === 'Registration saved')
    expect(saved).toMatchObject({ registrationId: response.body.registrationId, mode: 'create' })
  })

  it('names creating, not appending, when a first registration fails a rule', async () => {
    const { app, body } = setup({ division: { minimumAverage: 250 } })

    const response = await asVendor(request(app).post('/v1/registrations')).send(body())

    expect(response.body.detail).toBe('An error occurred while creating the registration.')
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

describe('unexpected errors (API-13)', () => {
  function crashing() {
    const captured = createCapturedLogger()
    const context = setup({ logger: captured.logger })
    context.deps.registrationWriter.findRegistrationIdByPaymentCode = () =>
      Promise.reject(new Error('secret database detail'))
    context.deps.registrationWriter.getDetail = () =>
      Promise.reject(new Error('secret database detail'))
    return { ...context, captured, app: createTestApp(context.deps) }
  }

  it('answers a crash on create with the legacy text and a trace id, and logs the cause', async () => {
    const { app, body, captured } = crashing()
    const payment = { processingSystem: 'Stripe', confirmationCode: 'ch_1', amount: 75 }

    const response = await asVendor(request(app).post('/v1/registrations')).send(body({ payment }))

    expect(response.status).toBe(500)
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/)
    expect(response.body).toMatchObject({
      status: 500,
      detail: 'An unexpected error occurred while processing your request.',
      traceId: response.headers['x-request-id'],
    })
    expect(response.body.message).toBe('Internal server error')
    expect(JSON.stringify(response.body)).not.toContain('secret')
    const logged = captured.records().find((r) => r['msg'] === 'Unhandled error')
    expect(JSON.stringify(logged)).toContain('secret database detail')
  })

  it('answers a crash on get the same way', async () => {
    const { app } = crashing()

    const response = await asVendor(request(app).get(`/v1/registrations/${faker.string.uuid()}`))

    expect(response.status).toBe(500)
    expect(response.body.detail).toBe('An unexpected error occurred while processing your request.')
  })

  it('leaves an error we meant to send, such as a database outage, to the app', async () => {
    const context = setup()
    context.deps.registrationWriter.getDetail = () =>
      Promise.reject(new HttpError(503, 'Database unavailable'))

    const response = await asVendor(
      request(createTestApp(context.deps)).get(`/v1/registrations/${faker.string.uuid()}`),
    )

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
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

  it('picks its own division, squads, and sweepers from the tournament', async () => {
    const context = setup()
    const other = createDivision({ number: 99 })
    const { deps, tournament, secondSquad } = context
    deps.divisions = createInMemoryDivisionRepository([
      { tournamentId: tournament.id, division: other },
      { tournamentId: tournament.id, division: context.division },
    ])
    const created = await asVendor(request(createTestApp(deps)).post('/v1/registrations')).send(
      context.body({ squads: [context.squad.id], sweepers: [] }),
    )

    const response = await asVendor(
      request(createTestApp(deps)).get(`/v1/registrations/${created.body.registrationId}`),
    )

    expect(response.body.registration.division.id).toBe(context.division.id)
    expect(response.body.registration.squads.map((s: { id: string }) => s.id)).toEqual([
      context.squad.id,
    ])
    expect(secondSquad.id).not.toBe(context.squad.id)
    expect(response.body.registration.sweepers).toEqual([])
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

describe('PATCH /v1/registrations/{id} (API-07)', () => {
  const paid = { processingSystem: 'Stripe', confirmationCode: 'ch_9', amount: 25 }

  async function registered() {
    const context = setup()
    const created = await asVendor(request(context.app).post('/v1/registrations')).send(
      context.body(),
    )
    const id = createRegistrationResponseSchema.parse(created.body).registrationId
    const patch = (changes: Record<string, unknown>, path = id) =>
      asVendor(request(context.app).patch(`/v1/registrations/${path}`)).send({
        registration: { registrationId: id, ...changes },
      })
    return { ...context, id, patch }
  }

  it('changes the registration and answers 204 with no body (API-07)', async () => {
    const { patch, state, secondSquad } = await registered()

    const response = await patch({ squadIds: [secondSquad.id], average: 150, payment: paid })

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(state.registrations[0]?.registration).toMatchObject({
      average: 150,
      sessionIds: [secondSquad.id],
    })
  })

  it('shows the change on the next GET (API-06)', async () => {
    const { patch, app, id, secondSquad } = await registered()
    await patch({ squadIds: [secondSquad.id] })

    const response = await asVendor(request(app).get(`/v1/registrations/${id}`))

    const detail = registrationDetailResponseSchema.parse(response.body)
    expect(detail.registration.squads.map((s) => s.id)).toEqual([secondSquad.id])
  })

  it('answers a body id that differs from the path with a 400 problem (Registration.IdMismatch)', async () => {
    const { patch, state, secondSquad } = await registered()

    const response = await patch({ squadIds: [secondSquad.id] }, faker.string.uuid())

    expect(response.status).toBe(400)
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/)
    const problem = problemSchema.parse(response.body)
    expect(problem.detail).toBe('An error occurred while updating the registration.')
    expect(problem.errors?.map((e) => e.code)).toEqual(['Registration.IdMismatch'])
    expect(state.registrations[0]?.registration.sessionIds).not.toContain(secondSquad.id)
  })

  it('answers a bad body with the failed checks (API-09)', async () => {
    const { app, id } = await registered()

    const response = await asVendor(request(app).patch(`/v1/registrations/${id}`)).send({
      registration: { registrationId: id, squadIds: ['nope'] },
    })

    expect(response.status).toBe(400)
    expect(problemSchema.parse(response.body).errors?.map((e) => e.code)).toEqual([
      'Registration.SquadIdsInvalid',
    ])
  })

  it('answers a path that is not a UUID with 400', async () => {
    const { app } = await registered()

    const response = await asVendor(request(app).patch('/v1/registrations/nope')).send({})

    expect(response.status).toBe(400)
  })

  it('answers JSON that does not parse with a 400 problem', async () => {
    const { app, id } = await registered()

    const response = await asVendor(request(app).patch(`/v1/registrations/${id}`))
      .set('content-type', 'application/json')
      .send('{nope')

    expect(response.status).toBe(400)
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/)
  })

  it('answers a business rule failure with 400 and its code (D-04)', async () => {
    const { patch, state, squad } = await registered()

    const response = await patch({ squadIds: [] })

    expect(response.status).toBe(400)
    expect(problemSchema.parse(response.body).errors?.map((e) => e.code)).toEqual([
      'Registration.SquadsRequired',
    ])
    expect(state.registrations[0]?.registration.sessionIds).toEqual([squad.id])
  })

  it('lets a paid request leave no squad (D-106)', async () => {
    const { patch } = await registered()

    const response = await patch({ squadIds: [], payment: paid })

    expect(response.status).toBe(204)
  })

  it('answers an unknown registration with a 500 problem, as legacy does (REG-30, API-12)', async () => {
    const { app } = await registered()
    const id = faker.string.uuid()

    const response = await asVendor(request(app).patch(`/v1/registrations/${id}`)).send({
      registration: { registrationId: id },
    })

    expect(response.status).toBe(500)
    expect(problemSchema.parse(response.body).message).toBe(`Registration with ID ${id} not found.`)
  })

  it('answers a repeated payment code with 204 and writes nothing more (D-118)', async () => {
    const { patch, state, secondSquad } = await registered()
    await patch({ payment: paid })

    const again = await patch({ payment: paid, squadIds: [secondSquad.id] })

    expect(again.status).toBe(204)
    expect(state.payments).toHaveLength(1)
    expect(state.registrations[0]?.registration.sessionIds).not.toContain(secondSquad.id)
  })

  it('logs the codes, not the body, when it refuses', async () => {
    const captured = createCapturedLogger()
    const context = setup({ logger: captured.logger })
    const created = await asVendor(request(context.app).post('/v1/registrations')).send(
      context.body(),
    )
    const id = createRegistrationResponseSchema.parse(created.body).registrationId

    await asVendor(request(context.app).patch(`/v1/registrations/${id}`)).send({
      registration: { registrationId: id, squadIds: [] },
    })

    const line = captured.records().find((r) => r['msg'] === 'Update refused')
    expect(line?.['codes']).toEqual(['Registration.SquadsRequired'])
    expect(JSON.stringify(line)).not.toContain('Fontaine')
  })

  it('logs the id after a change', async () => {
    const captured = createCapturedLogger()
    const context = setup({ logger: captured.logger })
    const created = await asVendor(request(context.app).post('/v1/registrations')).send(
      context.body(),
    )
    const id = createRegistrationResponseSchema.parse(created.body).registrationId

    await asVendor(request(context.app).patch(`/v1/registrations/${id}`)).send({
      registration: { registrationId: id, average: 170 },
    })

    const line = captured.records().find((r) => r['msg'] === 'Registration updated')
    expect(line).toMatchObject({ registrationId: id, mode: 'update' })
  })

  it('answers a crash with the legacy text (API-13)', async () => {
    const { deps, id } = await registered()
    deps.registrationWriter.getDetail = () => Promise.reject(new Error('secret'))

    const response = await asVendor(
      request(createTestApp(deps)).patch(`/v1/registrations/${id}`),
    ).send({ registration: { registrationId: id } })

    expect(response.status).toBe(500)
    expect(response.body.detail).toBe('An unexpected error occurred while processing your request.')
    expect(JSON.stringify(response.body)).not.toContain('secret')
  })

  describe('who may call it (D-105)', () => {
    it('answers 401 with no key and no sign-in', async () => {
      const { app, id } = await registered()

      const response = await request(app)
        .patch(`/v1/registrations/${id}`)
        .send({ registration: { registrationId: id } })

      expect(response.status).toBe(401)
    })

    it('lets a signed-in director change a registration (registrations.write)', async () => {
      const { deps, id } = await registered()

      const response = await request(createSignedInTestApp(deps, 'director'))
        .patch(`/v1/registrations/${id}`)
        .send({ registration: { registrationId: id, average: 160 } })

      expect(response.status).toBe(204)
    })

    it('refuses a score keeper', async () => {
      const { deps, id, state } = await registered()

      const response = await request(createSignedInTestApp(deps, 'scoreKeeper'))
        .patch(`/v1/registrations/${id}`)
        .send({ registration: { registrationId: id, average: 160 } })

      expect(response.status).toBe(403)
      expect(state.registrations[0]?.registration.average).toBe(185)
    })
  })
})

describe('DELETE /v1/registrations/{id} (API-08)', () => {
  async function registered() {
    const context = setup()
    const created = await asVendor(request(context.app).post('/v1/registrations')).send(
      context.body(),
    )
    const id = createRegistrationResponseSchema.parse(created.body).registrationId
    const remove = (path = id) => asVendor(request(context.app).delete(`/v1/registrations/${path}`))
    return { ...context, id, remove }
  }

  it('deletes the registration and answers 204 with no body (REG-19)', async () => {
    const { remove, state, app, id } = await registered()

    const response = await remove()

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(state.registrations).toEqual([])
    expect(state.bowlers).toHaveLength(1)
    const again = await asVendor(request(app).get(`/v1/registrations/${id}`))
    expect(again.status).toBe(404)
  })

  it('answers an unknown registration with a 404 problem (API-08)', async () => {
    const { remove } = await registered()

    const response = await remove(faker.string.uuid())

    expect(response.status).toBe(404)
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/)
    expect(problemSchema.parse(response.body).message).toBe('Registration not found')
  })

  it('answers a path that is not a UUID with 400', async () => {
    const { remove } = await registered()

    expect((await remove('nope')).status).toBe(400)
  })

  it('answers a registration with scores with a 400 problem and keeps it (REG-19)', async () => {
    const { remove, state, squad } = await registered()
    const bowlerId = state.bowlers[0]?.id ?? ''
    state.scores.push({ bowlerId, sessionId: squad.id })

    const response = await remove()

    expect(response.status).toBe(400)
    const problem = problemSchema.parse(response.body)
    expect(problem.detail).toBe('An error occurred while deleting the registration.')
    expect(problem.errors).toEqual([
      { code: 'Registration.HasScores', description: 'Cannot delete registration with scores.' },
    ])
    expect(state.registrations).toHaveLength(1)
  })

  it('logs the id after a delete, and the codes after a refusal', async () => {
    const captured = createCapturedLogger()
    const context = setup({ logger: captured.logger })
    const created = await asVendor(request(context.app).post('/v1/registrations')).send(
      context.body(),
    )
    const id = createRegistrationResponseSchema.parse(created.body).registrationId
    context.state.scores.push({
      bowlerId: context.state.bowlers[0]?.id ?? '',
      sessionId: context.squad.id,
    })

    await asVendor(request(context.app).delete(`/v1/registrations/${id}`))
    context.state.scores.length = 0
    await asVendor(request(context.app).delete(`/v1/registrations/${id}`))

    const records = captured.records()
    expect(records.find((r) => r['msg'] === 'Delete refused')?.['codes']).toEqual([
      'Registration.HasScores',
    ])
    expect(records.find((r) => r['msg'] === 'Registration deleted')).toMatchObject({
      registrationId: id,
    })
  })

  it('answers a crash with the legacy text (API-13)', async () => {
    const { deps, id } = await registered()
    deps.registrationWriter.getDetail = () => Promise.reject(new Error('secret'))

    const response = await asVendor(request(createTestApp(deps)).delete(`/v1/registrations/${id}`))

    expect(response.status).toBe(500)
    expect(response.body.detail).toBe('An unexpected error occurred while processing your request.')
  })

  describe('who may call it (D-105)', () => {
    it('answers 401 with no key and no sign-in', async () => {
      const { app, id } = await registered()

      expect((await request(app).delete(`/v1/registrations/${id}`)).status).toBe(401)
    })

    it('lets a signed-in director delete, and refuses a score keeper', async () => {
      const { deps, id, state } = await registered()

      const keeper = await request(createSignedInTestApp(deps, 'scoreKeeper')).delete(
        `/v1/registrations/${id}`,
      )
      expect(keeper.status).toBe(403)
      expect(state.registrations).toHaveLength(1)

      const director = await request(createSignedInTestApp(deps, 'director')).delete(
        `/v1/registrations/${id}`,
      )
      expect(director.status).toBe(204)
      expect(state.registrations).toEqual([])
    })
  })
})
