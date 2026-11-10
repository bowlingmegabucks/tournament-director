import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { createSquad, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { recordingEvents } from '../../test/recordingEvents.ts'
import { createInMemorySquadWriter, type SquadWriter } from './writer.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const otherTournamentId = '22222222-2222-4222-8222-222222222222'
const sessionId = '33333333-3333-4333-8333-333333333333'
const keptId = '44444444-4444-4444-8444-444444444444'
const missingId = '66666666-6666-4666-8666-666666666666'
const url = `/v1/tournaments/${tournamentId}/squads/${sessionId}/complete`
const infoUrl = `/v1/tournaments/${tournamentId}/squads/${sessionId}/complete-info`

const session = createSquad({ id: sessionId, date: '2026-10-24T09:00:00', complete: false })
const kept = createSquad({ id: keptId, date: '2026-10-25T09:00:00', complete: false })

/** Three entered bowlers: none with scores, one short, one done. */
const entries = [
  { bowlerId: 'aaa', savedGames: 0 },
  { bowlerId: 'bbb', savedGames: 2 },
  { bowlerId: 'ccc', savedGames: 5 },
]

function setup(options: Parameters<typeof createInMemorySquadWriter>[0] = {}) {
  const made = createInMemorySquadWriter({
    seed: [
      { tournamentId, squad: { ...session } },
      { tournamentId, squad: { ...kept } },
      { tournamentId: otherTournamentId, squad: { ...createSquad({ complete: false }) } },
    ],
    tournament: { games: 3 },
    entries: { [sessionId]: entries },
    ...options,
  })
  return { ...made, app: createSignedInTestApp({ squadWriter: made.writer }) }
}

const completeOf = (stored: ReturnType<typeof setup>['stored'], id: string) =>
  stored.find((entry) => entry.squad.id === id)?.squad.complete

const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
const brokenWriter: SquadWriter = {
  create: outage,
  update: outage,
  getEditInfo: outage,
  remove: outage,
  getDeleteInfo: outage,
  complete: outage,
  getCompleteInfo: outage,
}

describe(`POST ${url}`, () => {
  it('completes the squad, zeroes the no-show, and answers the squad with the count (SQD-15, D-190)', async () => {
    const { app, stored, zeros } = setup()

    const response = await request(app).post(url)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      squad: { ...session, complete: true },
      noShowCount: 1,
    })
    expect(completeOf(stored, sessionId)).toBe(true)
    expect(zeros).toEqual([
      { squadId: sessionId, bowlerId: 'aaa', game: 1 },
      { squadId: sessionId, bowlerId: 'aaa', game: 2 },
      { squadId: sessionId, bowlerId: 'aaa', game: 3 },
    ])
  })

  it('leaves the other squads open (SQD-15)', async () => {
    const { app, stored } = setup()

    await request(app).post(url)

    expect(completeOf(stored, keptId)).toBe(false)
  })

  it('completes a squad nobody entered with a count of 0 (D-192)', async () => {
    const { app, zeros } = setup({ entries: {} })

    const response = await request(app).post(url)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ noShowCount: 0 })
    expect(zeros).toEqual([])
  })

  it('refuses a second complete with 409 and no new zeros (SQD-18, D-192)', async () => {
    const { app, zeros } = setup()
    await request(app).post(url)
    const zeroCount = zeros.length

    const response = await request(app).post(url)

    const message = 'This squad is already complete'
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message, errors: { session: message } })
    expect(zeros).toHaveLength(zeroCount)
  })

  it('refuses a complete tournament and keeps the squad open (SQD-17, D-130)', async () => {
    const { app, stored, zeros } = setup({ completed: [tournamentId] })

    const response = await request(app).post(url)

    const message = 'This tournament is complete and cannot be changed'
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message, errors: { tournament: message } })
    expect(completeOf(stored, sessionId)).toBe(false)
    expect(zeros).toEqual([])
  })

  it('answers 400 for an id that is not a UUID', async () => {
    const { app } = setup()

    expect(
      (await request(app).post(`/v1/tournaments/${tournamentId}/squads/nope/complete`)).status,
    ).toBe(400)
    expect(
      (await request(app).post(`/v1/tournaments/nope/squads/${sessionId}/complete`)).status,
    ).toBe(400)
  })

  it("answers 404 for an unknown tournament, an unknown squad, or another tournament's squad", async () => {
    const { app, stored } = setup({ known: [tournamentId, otherTournamentId] })

    const unknownTournament = await request(app).post(
      `/v1/tournaments/${missingId}/squads/${sessionId}/complete`,
    )
    const unknown = await request(app).post(
      `/v1/tournaments/${tournamentId}/squads/${missingId}/complete`,
    )
    const elsewhere = await request(app).post(
      `/v1/tournaments/${otherTournamentId}/squads/${sessionId}/complete`,
    )

    expect(unknownTournament.status).toBe(404)
    expect(unknownTournament.body).toEqual({ message: 'Tournament not found' })
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Squad not found' })
    expect(elsewhere.status).toBe(404)
    expect(completeOf(stored, sessionId)).toBe(false)
  })

  it('logs who completed which squad and how many no-shows, and no date (D-193)', async () => {
    const { logger, records } = createCapturedLogger()
    const app = createSignedInTestApp({ squadWriter: setup().writer, logger })

    await request(app).post(url)

    const line = records().find((record) => record['msg'] === 'Squad completed')
    expect(line).toMatchObject({ tournamentId, squadId: sessionId, noShowCount: 1 })
    expect(typeof line?.['actorId']).toBe('string')
    expect(JSON.stringify(line)).not.toContain('2026-10-24')
  })

  it('logs a refusal with the ids and the number of reasons (D-193)', async () => {
    const { logger, records } = createCapturedLogger()
    const { writer } = setup({ completed: [tournamentId] })
    const app = createSignedInTestApp({ squadWriter: writer, logger })

    await request(app).post(url)

    const line = records().find((record) => record['msg'] === 'Squad complete refused')
    expect(line).toMatchObject({ tournamentId, squadId: sessionId, reasons: 1 })
    expect(records().find((record) => record['msg'] === 'Squad completed')).toBeUndefined()
  })

  it('passes a storage outage on as 503', async () => {
    const response = await request(createSignedInTestApp({ squadWriter: brokenWriter })).post(url)

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
      const app = createSignedInTestApp({ squadWriter: writer }, role)

      expect((await request(app).post(url)).status).toBe(200)
    })
  })
})

describe(`GET ${infoUrl}`, () => {
  it('answers the counts the dialog shows (D-194)', async () => {
    const response = await request(setup().app).get(infoUrl)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      completeInfo: { entryCount: 3, noScoreCount: 1, partialCount: 1, games: 3 },
    })
  })

  it('answers zeros for a squad nobody is in', async () => {
    const response = await request(setup({ entries: {} }).app).get(infoUrl)

    expect(response.body).toEqual({
      completeInfo: { entryCount: 0, noScoreCount: 0, partialCount: 0, games: 3 },
    })
  })

  it('answers 400 for a bad id and 404 for an unknown tournament or squad', async () => {
    const { app } = setup({ known: [tournamentId] })

    expect(
      (await request(app).get(`/v1/tournaments/${tournamentId}/squads/nope/complete-info`)).status,
    ).toBe(400)
    const unknownTournament = await request(app).get(
      `/v1/tournaments/${missingId}/squads/${sessionId}/complete-info`,
    )
    const unknown = await request(app).get(
      `/v1/tournaments/${tournamentId}/squads/${missingId}/complete-info`,
    )
    expect(unknownTournament.status).toBe(404)
    expect(unknownTournament.body).toEqual({ message: 'Tournament not found' })
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Squad not found' })
  })

  it('passes a storage outage on as 503', async () => {
    const app = createSignedInTestApp({ squadWriter: brokenWriter })

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

describe('live updates after Complete (LAN-22, D-10, D-219)', () => {
  it('tells the open lane pages once, and not again when the second try is refused', async () => {
    const { events, published } = recordingEvents()
    const made = setup()
    const app = createSignedInTestApp({ squadWriter: made.writer, events })

    const first = await request(app).post(url)
    const second = await request(app).post(url)

    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    expect(published).toEqual([{ sessionId, kind: 'lanes' }])
  })
})
