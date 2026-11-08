import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { completeMessage } from '../../shared/sessionCreate.ts'
import { HttpError } from '../../shared/errors.ts'
import { testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { unknownDivisionMessage } from './createPlan.ts'
import { sweeperSchema } from './types.ts'
import { createInMemorySweeperWriter, type SweeperWriter } from './writer.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const url = `/v1/tournaments/${tournamentId}/sweepers`
const open = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const women = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const seniors = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const body = {
  date: '2026-10-24T18:00',
  startingLane: 1,
  numberOfLanes: 24,
  maxPerPair: 4,
  entryFee: 20,
  games: 3,
  cashRatio: 5,
  bonusPins: { [open]: 10, [women]: 6, [seniors]: '' },
}

const openDivision = { id: open, name: 'Open', number: 1 }
const divisions = [
  { id: women, name: 'Women', number: 2 },
  openDivision,
  { id: seniors, name: 'Seniors', number: 3 },
]

describe(`POST ${url}`, () => {
  it('adds a sweeper, answers 201 with Location and the list shape (SQD-10 to SQD-13)', async () => {
    const { writer, stored } = createInMemorySweeperWriter({ divisions })
    const app = createSignedInTestApp({ sweeperWriter: writer })

    const response = await request(app).post(url).send(body)

    expect(response.status).toBe(201)
    const sweeper = (response.body as { sweeper: { id: string } }).sweeper
    expect(response.headers['location']).toBe(url)
    expect(sweeperSchema.safeParse(sweeper).success).toBe(true)
    expect(response.body).toEqual({
      sweeper: {
        id: sweeper.id,
        date: '2026-10-24T18:00:00',
        complete: false,
        startingLane: 1,
        numberOfLanes: 24,
        maxPerPair: 4,
        entryFee: 20,
        games: 3,
        cashRatio: 5,
        // Division order, and the blank box adds nothing (D-45, D-176).
        bonusPins: [
          { divisionId: open, divisionName: 'Open', bonusPinsPerGame: 10 },
          { divisionId: women, divisionName: 'Women', bonusPinsPerGame: 6 },
        ],
      },
    })
    expect(stored).toHaveLength(1)
    expect(stored[0]?.tournamentId).toBe(tournamentId)
  })

  it('adds a sweeper with no bonus pins key (SQD-13, D-177)', async () => {
    const bare = { ...body, bonusPins: undefined }

    const response = await request(createSignedInTestApp()).post(url).send(bare)

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ sweeper: { bonusPins: [] } })
  })

  it('stores the sweeper open, and refuses a `complete` key with a 400 (SQD-07, D-171)', async () => {
    const { writer, stored } = createInMemorySweeperWriter()
    const app = createSignedInTestApp({ sweeperWriter: writer })

    await request(app).post(url).send(body)
    const refused = await request(app)
      .post(url)
      .send({ ...body, complete: true })

    expect(stored).toHaveLength(1)
    expect(stored[0]?.sweeper.complete).toBe(false)
    expect(refused.status).toBe(400)
    expect(refused.body).toMatchObject({ errors: { complete: 'This field is not accepted' } })
  })

  it('allows two sweepers at the same time on the same lanes (D-169)', async () => {
    const { writer, stored } = createInMemorySweeperWriter()
    const app = createSignedInTestApp({ sweeperWriter: writer })

    const first = await request(app).post(url).send(body)
    const second = await request(app).post(url).send(body)

    expect([first.status, second.status]).toEqual([201, 201])
    expect(stored).toHaveLength(2)
  })

  it('logs who added it, the tournament, and the sweeper, and nothing else (D-178)', async () => {
    const captured = createCapturedLogger()
    const app = createSignedInTestApp({ logger: captured.logger })

    const response = await request(app).post(url).send(body)

    const line = captured.records().find((record) => record['msg'] === 'Sweeper created')
    expect(line).toMatchObject({
      tournamentId,
      sweeperId: (response.body as { sweeper: { id: string } }).sweeper.id,
    })
    expect(line?.['actorId']).toEqual(expect.any(String))
    expect(JSON.stringify(line)).not.toContain('2026-10-24')
  })

  it('answers 400 with a message per field and stores nothing (SQD-10 to SQD-13)', async () => {
    const { writer, stored } = createInMemorySweeperWriter()

    const response = await request(createSignedInTestApp({ sweeperWriter: writer }))
      .post(url)
      .send({ ...body, games: 0, entryFee: 0, cashRatio: 1, bonusPins: { [open]: 100 } })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Check the highlighted fields. Entry fee must be greater than $0',
      errors: {
        entryFee: 'Entry fee must be greater than $0',
        games: 'Games must be between 1 and 99',
        cashRatio: 'Cash ratio must be greater than 1',
        [`bonusPins.${open}`]: 'Bonus pins must be between 0 and 99',
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
    expect(response.body).toMatchObject({ message: 'Send the sweeper as a JSON object.' })
  })

  it('answers 400 for a tournament id that is not a UUID (SQD-10)', async () => {
    const response = await request(createSignedInTestApp())
      .post('/v1/tournaments/not-a-uuid/sweepers')
      .send(body)

    expect(response.status).toBe(400)
  })

  it('answers 404 for an unknown tournament (SQD-10)', async () => {
    const { writer, stored } = createInMemorySweeperWriter({ known: [] })

    const response = await request(createSignedInTestApp({ sweeperWriter: writer }))
      .post(url)
      .send(body)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
    expect(stored).toEqual([])
  })

  it('answers 409 for a date before the tournament starts, saying "Sweeper" (SQD-10)', async () => {
    const { writer, stored } = createInMemorySweeperWriter({
      dates: { startDate: '2026-10-24', endDate: '2026-10-25' },
    })
    const message = 'Sweeper date must be after tournament start'

    const response = await request(createSignedInTestApp({ sweeperWriter: writer }))
      .post(url)
      .send({ ...body, date: '2026-10-23T23:59' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message, errors: { date: message } })
    expect(stored).toEqual([])
  })

  it('answers 409 for a date after the tournament ends (SQD-10)', async () => {
    const { writer } = createInMemorySweeperWriter({
      dates: { startDate: '2026-10-24', endDate: '2026-10-25' },
    })
    const message = 'Sweeper date must be before tournament end'

    const response = await request(createSignedInTestApp({ sweeperWriter: writer }))
      .post(url)
      .send({ ...body, date: '2026-10-26T00:00' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message, errors: { date: message } })
  })

  it('answers 409 for a complete tournament and stores nothing (D-171)', async () => {
    const { writer, stored } = createInMemorySweeperWriter({ completed: [tournamentId] })

    const response = await request(createSignedInTestApp({ sweeperWriter: writer }))
      .post(url)
      .send(body)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: completeMessage,
      errors: { tournament: completeMessage },
    })
    expect(stored).toEqual([])
  })

  it('answers 409 under bonusPins for a division that is gone, and stores nothing (D-177)', async () => {
    const { writer, stored } = createInMemorySweeperWriter({ divisions: [openDivision] })

    const response = await request(createSignedInTestApp({ sweeperWriter: writer }))
      .post(url)
      .send(body)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: unknownDivisionMessage,
      errors: { bonusPins: unknownDivisionMessage },
    })
    expect(stored).toEqual([])
  })

  it('passes a storage outage on as 503 (SQD-10)', async () => {
    const writer: SweeperWriter = {
      ...createInMemorySweeperWriter().writer,
      create: () => Promise.reject(new HttpError(503, 'Database unavailable')),
    }

    const response = await request(createSignedInTestApp({ sweeperWriter: writer }))
      .post(url)
      .send(body)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  describe('who may call it (SQD-10, D-96, D-97, D-174)', () => {
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

    it.each(['director', 'admin'] as const)('lets a %s add a sweeper', async (role) => {
      const response = await request(createSignedInTestApp({}, role)).post(url).send(body)

      expect(response.status).toBe(201)
    })

    it('leaves GET of the sweepers public (D-09)', async () => {
      const response = await request(createTestApp()).get(url)

      // No stored tournament here, so the list answers its own 404, not a sign-in demand.
      expect(response.status).toBe(404)
    })
  })
})
