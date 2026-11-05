import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemoryTournamentRepository } from './repository.ts'
import { createInMemoryTournamentWriter, type TournamentWriter } from './writer.ts'

const body = {
  name: 'Spring Classic',
  startDate: '2027-03-12',
  endDate: '2027-03-14',
  entryFee: 60,
  games: 5,
  finalsRatio: 8,
  cashRatio: 5,
  superSweeperCashRatio: 4,
  bowlingCenter: 'Bowl-O-Rama',
}

describe('POST /v1/tournaments', () => {
  it('creates a tournament, answers 201 with Location and the stored fields (TRN-19)', async () => {
    const { writer, stored } = createInMemoryTournamentWriter()
    const app = createSignedInTestApp({ tournamentWriter: writer })

    const response = await request(app).post('/v1/tournaments').send(body)

    expect(response.status).toBe(201)
    const id = (response.body as { tournament: { id: string } }).tournament.id
    expect(response.headers['location']).toBe(`/v1/tournaments/${id}`)
    expect(response.body).toEqual({ tournament: { id, ...body } })
    expect(stored).toEqual([{ id, ...body }])
  })

  it('trims the text it stores (TRN-01, TRN-07)', async () => {
    const { writer, stored } = createInMemoryTournamentWriter()
    const app = createSignedInTestApp({ tournamentWriter: writer })

    await request(app)
      .post('/v1/tournaments')
      .send({ ...body, name: '  Spring Classic ', bowlingCenter: ' Bowl-O-Rama ' })

    expect(stored[0]).toMatchObject({ name: 'Spring Classic', bowlingCenter: 'Bowl-O-Rama' })
  })

  it('logs who created it and the id, and nothing else about the tournament (TRN-19)', async () => {
    const captured = createCapturedLogger()
    const app = createSignedInTestApp({ logger: captured.logger })

    const response = await request(app).post('/v1/tournaments').send(body)

    const line = captured.records().find((record) => record['msg'] === 'Tournament created')
    expect(line).toMatchObject({
      tournamentId: (response.body as { tournament: { id: string } }).tournament.id,
    })
    expect(line?.['actorId']).toEqual(expect.any(String))
    expect(JSON.stringify(line)).not.toContain('Spring Classic')
  })

  it('answers 400 with a message per field and stores nothing (TRN-01 to TRN-09, D-121)', async () => {
    const { writer, stored } = createInMemoryTournamentWriter()
    const app = createSignedInTestApp({ tournamentWriter: writer })

    const response = await request(app)
      .post('/v1/tournaments')
      .send({ ...body, name: '', endDate: '2027-03-01', superSweeperCashRatio: 0 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Check the highlighted fields. Name is required',
      errors: {
        name: 'Name is required',
        endDate: 'End date must be on or after start date',
        superSweeperCashRatio: 'Super sweeper cash ratio must be at least 1',
      },
    })
    expect(stored).toEqual([])
  })

  it('refuses a completed field (TRN-08, D-119)', async () => {
    const response = await request(createSignedInTestApp())
      .post('/v1/tournaments')
      .send({ ...body, completed: true })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errors: { completed: 'This field is not accepted' } })
  })

  it('answers 400 for a body that is not JSON (D-121)', async () => {
    const response = await request(createSignedInTestApp())
      .post('/v1/tournaments')
      .set('content-type', 'application/json')
      .send('{not json')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is not valid JSON.' })
  })

  it('answers 400 for a body over the limit, as the other routes do (D-121)', async () => {
    const response = await request(createSignedInTestApp())
      .post('/v1/tournaments')
      .send({ ...body, name: 'x'.repeat(11_000) })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is too large.' })
  })

  it('answers 400 for a missing body (D-121)', async () => {
    const response = await request(createSignedInTestApp()).post('/v1/tournaments')

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ message: 'Send the tournament as a JSON object.' })
  })

  it('answers 409 for the same name and start date, ignoring case (TRN-20, D-123)', async () => {
    const { writer, stored } = createInMemoryTournamentWriter()
    const app = createSignedInTestApp({ tournamentWriter: writer })
    await request(app).post('/v1/tournaments').send(body)

    const response = await request(app)
      .post('/v1/tournaments')
      .send({ ...body, name: ' spring CLASSIC' })

    expect(response.status).toBe(409)
    const message = 'A tournament with this name and start date already exists'
    expect(response.body).toEqual({ message, errors: { name: message } })
    expect(stored).toHaveLength(1)
  })

  it('accepts the same name on another start date (TRN-20)', async () => {
    const app = createSignedInTestApp()
    await request(app).post('/v1/tournaments').send(body)

    const response = await request(app)
      .post('/v1/tournaments')
      .send({ ...body, startDate: '2028-03-10', endDate: '2028-03-12' })

    expect(response.status).toBe(201)
  })

  it('passes a storage outage on as 503 (TRN-19)', async () => {
    const writer: TournamentWriter = {
      ...createInMemoryTournamentWriter().writer,
      create: () => Promise.reject(new HttpError(503, 'Database unavailable')),
    }

    const response = await request(createSignedInTestApp({ tournamentWriter: writer }))
      .post('/v1/tournaments')
      .send(body)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  describe('who may call it (TRN-19, D-96, D-97)', () => {
    it('answers 401 when signed out, before it reads the body', async () => {
      const response = await request(createTestApp()).post('/v1/tournaments').send({})

      expect(response.status).toBe(401)
    })

    it('answers 403 to the API key', async () => {
      const response = await request(createTestApp())
        .post('/v1/tournaments')
        .set(apiKeyHeader, testApiKey)
        .send(body)

      expect(response.status).toBe(403)
    })

    it('answers 403 to a score keeper', async () => {
      const response = await request(createSignedInTestApp({}, 'scoreKeeper'))
        .post('/v1/tournaments')
        .send(body)

      expect(response.status).toBe(403)
    })

    it.each(['director', 'admin'] as const)('lets a %s create', async (role) => {
      const response = await request(createSignedInTestApp({}, role))
        .post('/v1/tournaments')
        .send(body)

      expect(response.status).toBe(201)
    })

    it('leaves GET /v1/tournaments public (TRN-11, D-09)', async () => {
      const app = createTestApp({ tournaments: createInMemoryTournamentRepository([]) })

      const response = await request(app).get('/v1/tournaments')

      expect(response.status).toBe(200)
    })
  })
})
