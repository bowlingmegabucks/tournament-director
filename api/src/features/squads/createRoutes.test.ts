import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { afterEndMessage, beforeStartMessage, completeMessage } from './createPlan.ts'
import { squadSchema } from './types.ts'
import { createInMemorySquadWriter, type SquadWriter } from './writer.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const url = `/v1/tournaments/${tournamentId}/squads`

const body = {
  date: '2026-10-24T09:00',
  startingLane: 1,
  numberOfLanes: 24,
  maxPerPair: 4,
  entryFee: 60,
  finalsRatio: 5.5,
  cashRatio: 3,
}

const savedBody = { ...body, date: '2026-10-24T09:00:00' }

describe(`POST ${url}`, () => {
  it('adds a squad, answers 201 with Location and the list shape (SQD-01 to SQD-08)', async () => {
    const { writer, stored } = createInMemorySquadWriter()
    const app = createSignedInTestApp({ squadWriter: writer })

    const response = await request(app).post(url).send(body)

    expect(response.status).toBe(201)
    const squad = (response.body as { squad: { id: string } }).squad
    expect(response.headers['location']).toBe(url)
    expect(squadSchema.safeParse(squad).success).toBe(true)
    expect(response.body).toEqual({
      squad: {
        id: squad.id,
        date: '2026-10-24T09:00:00',
        complete: false,
        startingLane: 1,
        numberOfLanes: 24,
        maxPerPair: 4,
        entryFee: 60,
        entryFeeOverridden: true,
        finalsRatio: 5.5,
        finalsRatioOverridden: true,
        cashRatio: 3,
        cashRatioOverridden: true,
        games: 5,
      },
    })
    expect(stored).toHaveLength(1)
    expect(stored[0]?.tournamentId).toBe(tournamentId)
  })

  it('answers a blank fee and ratios with the tournament values and no override (TRN-12, D-170)', async () => {
    const { writer } = createInMemorySquadWriter({
      tournament: { entryFee: 50, finalsRatio: 6, cashRatio: 4, games: 3 },
    })
    const app = createSignedInTestApp({ squadWriter: writer })

    const response = await request(app)
      .post(url)
      .send({ ...savedBody, entryFee: '', finalsRatio: null, cashRatio: undefined })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      squad: {
        entryFee: 50,
        entryFeeOverridden: false,
        finalsRatio: 6,
        finalsRatioOverridden: false,
        cashRatio: 4,
        cashRatioOverridden: false,
        games: 3,
      },
    })
  })

  it('treats a fee of 0 as set (SQD-08, TRN-12)', async () => {
    const response = await request(createSignedInTestApp())
      .post(url)
      .send({ ...body, entryFee: 0 })

    expect(response.body).toMatchObject({ squad: { entryFee: 0, entryFeeOverridden: true } })
  })

  it('always stores the squad open (SQD-07, D-171)', async () => {
    const { writer, stored } = createInMemorySquadWriter()

    await request(createSignedInTestApp({ squadWriter: writer }))
      .post(url)
      .send(body)

    expect(stored[0]?.squad.complete).toBe(false)
  })

  it('refuses a `complete` key with a 400 and stores nothing (SQD-07, D-171)', async () => {
    const { writer, stored } = createInMemorySquadWriter()

    const response = await request(createSignedInTestApp({ squadWriter: writer }))
      .post(url)
      .send({ ...body, complete: true })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errors: { complete: 'This field is not accepted' } })
    expect(stored).toEqual([])
  })

  it('allows two squads at the same time on the same lanes (D-169)', async () => {
    const { writer, stored } = createInMemorySquadWriter()
    const app = createSignedInTestApp({ squadWriter: writer })

    const first = await request(app).post(url).send(body)
    const second = await request(app).post(url).send(body)

    expect([first.status, second.status]).toEqual([201, 201])
    expect(stored).toHaveLength(2)
  })

  it('logs who added it, the tournament, and the squad, and nothing else (D-172)', async () => {
    const captured = createCapturedLogger()
    const app = createSignedInTestApp({ logger: captured.logger })

    const response = await request(app).post(url).send(body)

    const line = captured.records().find((record) => record['msg'] === 'Squad created')
    expect(line).toMatchObject({
      tournamentId,
      squadId: (response.body as { squad: { id: string } }).squad.id,
    })
    expect(line?.['actorId']).toEqual(expect.any(String))
    expect(JSON.stringify(line)).not.toContain('2026-10-24')
  })

  it('answers 400 with a message per field and stores nothing (SQD-02, SQD-04 to SQD-06, SQD-08)', async () => {
    const { writer, stored } = createInMemorySquadWriter()

    const response = await request(createSignedInTestApp({ squadWriter: writer }))
      .post(url)
      .send({ ...body, startingLane: 2, numberOfLanes: 3, maxPerPair: 6, finalsRatio: 1 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Check the highlighted fields. Starting lane must be odd',
      errors: {
        startingLane: 'Starting lane must be odd',
        numberOfLanes: 'Number of lanes must be even',
        maxPerPair: 'Max per pair must be between 2 and 5',
        finalsRatio: 'Finals ratio must be greater than 1',
      },
    })
    expect(stored).toEqual([])
  })

  it('answers 400 for a body that is not JSON', async () => {
    const response = await request(createSignedInTestApp())
      .post(url)
      .set('content-type', 'application/json')
      .send('{not json')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is not valid JSON.' })
  })

  it('answers 400 for a missing body', async () => {
    const response = await request(createSignedInTestApp()).post(url)

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ message: 'Send the squad as a JSON object.' })
  })

  it('answers 400 for a tournament id that is not a UUID (SQD-01)', async () => {
    const response = await request(createSignedInTestApp())
      .post('/v1/tournaments/not-a-uuid/squads')
      .send(body)

    expect(response.status).toBe(400)
  })

  it('answers 404 for an unknown tournament (SQD-01)', async () => {
    const { writer, stored } = createInMemorySquadWriter({ known: [] })

    const response = await request(createSignedInTestApp({ squadWriter: writer }))
      .post(url)
      .send(body)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
    expect(stored).toEqual([])
  })

  it('answers 409 for a date before the tournament starts and stores nothing (SQD-03)', async () => {
    const { writer, stored } = createInMemorySquadWriter({
      tournament: { startDate: '2026-10-24', endDate: '2026-10-25' },
    })

    const response = await request(createSignedInTestApp({ squadWriter: writer }))
      .post(url)
      .send({ ...body, date: '2026-10-23T23:59' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: beforeStartMessage,
      errors: { date: beforeStartMessage },
    })
    expect(stored).toEqual([])
  })

  it('answers 409 for a date after the tournament ends (SQD-03)', async () => {
    const { writer } = createInMemorySquadWriter({
      tournament: { startDate: '2026-10-24', endDate: '2026-10-25' },
    })

    const response = await request(createSignedInTestApp({ squadWriter: writer }))
      .post(url)
      .send({ ...body, date: '2026-10-26T00:00' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message: afterEndMessage, errors: { date: afterEndMessage } })
  })

  it('answers 409 for a complete tournament and stores nothing (D-171)', async () => {
    const { writer, stored } = createInMemorySquadWriter({ completed: [tournamentId] })

    const response = await request(createSignedInTestApp({ squadWriter: writer }))
      .post(url)
      .send(body)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: completeMessage,
      errors: { tournament: completeMessage },
    })
    expect(stored).toEqual([])
  })

  it('passes a storage outage on as 503 (SQD-01)', async () => {
    const writer: SquadWriter = {
      create: () => Promise.reject(new HttpError(503, 'Database unavailable')),
    }

    const response = await request(createSignedInTestApp({ squadWriter: writer }))
      .post(url)
      .send(body)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  describe('who may call it (SQD-01, D-96, D-97, D-167)', () => {
    it('answers 401 when signed out, before it reads the body', async () => {
      const response = await request(createTestApp()).post(url).send({})

      expect(response.status).toBe(401)
    })

    it('answers 403 to the API key', async () => {
      const response = await request(createTestApp())
        .post(url)
        .set(apiKeyHeader, testApiKey)
        .send(body)

      expect(response.status).toBe(403)
    })

    it('answers 403 to a score keeper', async () => {
      const response = await request(createSignedInTestApp({}, 'scoreKeeper')).post(url).send(body)

      expect(response.status).toBe(403)
    })

    it.each(['director', 'admin'] as const)('lets a %s add a squad', async (role) => {
      const response = await request(createSignedInTestApp({}, role)).post(url).send(body)

      expect(response.status).toBe(201)
    })

    it('leaves GET of the squads public (D-09)', async () => {
      const response = await request(createTestApp()).get(url)

      // No stored tournament here, so the list answers its own 404, not a sign-in demand.
      expect(response.status).toBe(404)
    })
  })
})
