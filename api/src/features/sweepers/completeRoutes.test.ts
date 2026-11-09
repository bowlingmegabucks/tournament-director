import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { createSweeper, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { recordingEvents } from '../../test/recordingEvents.ts'
import { createInMemorySweeperWriter, type SweeperWriter } from './writer.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const otherTournamentId = '22222222-2222-4222-8222-222222222222'
const sessionId = '33333333-3333-4333-8333-333333333333'
const keptId = '44444444-4444-4444-8444-444444444444'
const missingId = '66666666-6666-4666-8666-666666666666'
const url = `/v1/tournaments/${tournamentId}/sweepers/${sessionId}/complete`
const infoUrl = `/v1/tournaments/${tournamentId}/sweepers/${sessionId}/complete-info`

const session = createSweeper({ id: sessionId, date: '2026-10-24T09:00:00', complete: false })
const kept = createSweeper({ id: keptId, date: '2026-10-25T09:00:00', complete: false })

/** Three entered bowlers, one with no scores: a sweeper still zeroes nobody (SQD-16). */
const entries = [
  { bowlerId: 'aaa', savedGames: 0 },
  { bowlerId: 'bbb', savedGames: 2 },
  { bowlerId: 'ccc', savedGames: 3 },
]

function setup(options: Parameters<typeof createInMemorySweeperWriter>[0] = {}) {
  const made = createInMemorySweeperWriter({
    seed: [
      { tournamentId, sweeper: { ...session } },
      { tournamentId, sweeper: { ...kept } },
      { tournamentId: otherTournamentId, sweeper: { ...createSweeper({ complete: false }) } },
    ],
    entries: { [sessionId]: entries },
    ...options,
  })
  return { ...made, app: createSignedInTestApp({ sweeperWriter: made.writer }) }
}

const completeOf = (stored: ReturnType<typeof setup>['stored'], id: string) =>
  stored.find((entry) => entry.sweeper.id === id)?.sweeper.complete

const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
const brokenWriter: SweeperWriter = {
  create: outage,
  update: outage,
  getEditInfo: outage,
  remove: outage,
  getDeleteInfo: outage,
  complete: outage,
  getCompleteInfo: outage,
}

describe(`POST ${url}`, () => {
  it('completes the sweeper and answers it, with no zero count (SQD-16, D-191)', async () => {
    const { app, stored } = setup()

    const response = await request(app).post(url)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ sweeper: { ...session, complete: true } })
    expect(completeOf(stored, sessionId)).toBe(true)
  })

  it('leaves the other sweepers open', async () => {
    const { app, stored } = setup()

    await request(app).post(url)

    expect(completeOf(stored, keptId)).toBe(false)
  })

  it('completes a sweeper nobody entered (D-192)', async () => {
    const response = await request(setup({ entries: {} }).app).post(url)

    expect(response.status).toBe(200)
  })

  it('refuses a second complete with 409 (SQD-18, D-192)', async () => {
    const { app } = setup()
    await request(app).post(url)

    const response = await request(app).post(url)

    const message = 'This sweeper is already complete'
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message, errors: { session: message } })
  })

  it('refuses a complete tournament and keeps the sweeper open (SQD-17, D-130)', async () => {
    const { app, stored } = setup({ completed: [tournamentId] })

    const response = await request(app).post(url)

    const message = 'This tournament is complete and cannot be changed'
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message, errors: { tournament: message } })
    expect(completeOf(stored, sessionId)).toBe(false)
  })

  it('answers 400 for an id that is not a UUID', async () => {
    const { app } = setup()

    expect(
      (await request(app).post(`/v1/tournaments/${tournamentId}/sweepers/nope/complete`)).status,
    ).toBe(400)
    expect(
      (await request(app).post(`/v1/tournaments/nope/sweepers/${sessionId}/complete`)).status,
    ).toBe(400)
  })

  it("answers 404 for an unknown tournament, an unknown sweeper, or another tournament's sweeper", async () => {
    const { app, stored } = setup({ known: [tournamentId, otherTournamentId] })

    const unknownTournament = await request(app).post(
      `/v1/tournaments/${missingId}/sweepers/${sessionId}/complete`,
    )
    const unknown = await request(app).post(
      `/v1/tournaments/${tournamentId}/sweepers/${missingId}/complete`,
    )
    const elsewhere = await request(app).post(
      `/v1/tournaments/${otherTournamentId}/sweepers/${sessionId}/complete`,
    )

    expect(unknownTournament.status).toBe(404)
    expect(unknownTournament.body).toEqual({ message: 'Tournament not found' })
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Sweeper not found' })
    expect(elsewhere.status).toBe(404)
    expect(completeOf(stored, sessionId)).toBe(false)
  })

  it('logs who completed which sweeper, and no date or count (D-193)', async () => {
    const { logger, records } = createCapturedLogger()
    const app = createSignedInTestApp({ sweeperWriter: setup().writer, logger })

    await request(app).post(url)

    const line = records().find((record) => record['msg'] === 'Sweeper completed')
    expect(line).toMatchObject({ tournamentId, sweeperId: sessionId })
    expect(typeof line?.['actorId']).toBe('string')
    expect(line).not.toHaveProperty('noShowCount')
    expect(JSON.stringify(line)).not.toContain('2026-10-24')
  })

  it('logs a refusal with the ids and the number of reasons (D-193)', async () => {
    const { logger, records } = createCapturedLogger()
    const { writer } = setup({ completed: [tournamentId] })
    const app = createSignedInTestApp({ sweeperWriter: writer, logger })

    await request(app).post(url)

    const line = records().find((record) => record['msg'] === 'Sweeper complete refused')
    expect(line).toMatchObject({ tournamentId, sweeperId: sessionId, reasons: 1 })
    expect(records().find((record) => record['msg'] === 'Sweeper completed')).toBeUndefined()
  })

  it('passes a storage outage on as 503', async () => {
    const response = await request(createSignedInTestApp({ sweeperWriter: brokenWriter })).post(url)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  describe('who may call it (D-193, D-96)', () => {
    it('answers 401 when signed out', async () => {
      expect((await request(createTestApp()).post(url)).status).toBe(401)
    })

    it('answers 403 to the API key and to a score keeper', async () => {
      const key = await request(createTestApp()).post(url).set(apiKeyHeader, testApiKey)
      const keeper = await request(createSignedInTestApp({}, 'scoreKeeper')).post(url)

      expect(key.status).toBe(403)
      expect(keeper.status).toBe(403)
    })

    it.each(['director', 'admin'] as const)('lets a %s complete', async (role) => {
      const { writer } = setup()
      const app = createSignedInTestApp({ sweeperWriter: writer }, role)

      expect((await request(app).post(url)).status).toBe(200)
    })
  })
})

describe(`GET ${infoUrl}`, () => {
  it('answers the entry count only: a sweeper fills nothing in (D-191, D-194)', async () => {
    const response = await request(setup().app).get(infoUrl)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ completeInfo: { entryCount: 3 } })
  })

  it('answers 0 for a sweeper nobody is in', async () => {
    const response = await request(setup({ entries: {} }).app).get(infoUrl)

    expect(response.body).toEqual({ completeInfo: { entryCount: 0 } })
  })

  it('answers 400 for a bad id and 404 for an unknown tournament or sweeper', async () => {
    const { app } = setup({ known: [tournamentId] })

    expect(
      (await request(app).get(`/v1/tournaments/${tournamentId}/sweepers/nope/complete-info`))
        .status,
    ).toBe(400)
    const unknownTournament = await request(app).get(
      `/v1/tournaments/${missingId}/sweepers/${sessionId}/complete-info`,
    )
    const unknown = await request(app).get(
      `/v1/tournaments/${tournamentId}/sweepers/${missingId}/complete-info`,
    )
    expect(unknownTournament.status).toBe(404)
    expect(unknownTournament.body).toEqual({ message: 'Tournament not found' })
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Sweeper not found' })
  })

  it('passes a storage outage on as 503', async () => {
    const app = createSignedInTestApp({ sweeperWriter: brokenWriter })

    expect((await request(app).get(infoUrl)).status).toBe(503)
  })

  it('needs sign-in and squads.write: 401, and 403 for the API key and a score keeper (D-193)', async () => {
    expect((await request(createTestApp()).get(infoUrl)).status).toBe(401)
    expect((await request(createTestApp()).get(infoUrl).set(apiKeyHeader, testApiKey)).status).toBe(
      403,
    )
    expect((await request(createSignedInTestApp({}, 'scoreKeeper')).get(infoUrl)).status).toBe(403)
  })
})

describe('live updates after Complete (LAN-20, D-10, D-219)', () => {
  it('tells the open lane pages once, and not again when the second try is refused', async () => {
    const { events, published } = recordingEvents()
    const made = setup()
    const app = createSignedInTestApp({ sweeperWriter: made.writer, events })

    const first = await request(app).post(url)
    const second = await request(app).post(url)

    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    expect(published).toEqual([{ sessionId, kind: 'lanes' }])
  })
})
