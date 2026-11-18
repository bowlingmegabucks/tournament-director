import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { liveKey } from '../../shared/events/sseRoute.ts'
import { createTournament, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { recordingEvents } from '../../test/recordingEvents.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemoryAverageStore, type MemoryRegistration } from './store.ts'

const tournament = createTournament()
const squadId = '11111111-1111-4111-8111-111111111111'
const sweeperId = '22222222-2222-4222-8222-222222222222'
const billId = '33333333-3333-4333-8333-333333333333'
const carlaId = '44444444-4444-4444-8444-444444444444'
const priyaId = '55555555-5555-4555-8555-555555555555'

function registrations(): MemoryRegistration[] {
  return [
    {
      id: billId,
      bowlerName: 'Bill Tran',
      divisionName: 'Handicap A',
      providedAverage: 175,
      maximumAverage: 190,
      sessionIds: [squadId, sweeperId],
    },
    {
      id: carlaId,
      bowlerName: 'Carla Mendes',
      divisionName: 'Handicap A',
      providedAverage: 187,
      scored: [{ complete: true }],
      sessionIds: [squadId],
    },
    {
      id: priyaId,
      bowlerName: 'Priya Natarajan',
      divisionName: 'Handicap B',
      providedAverage: null,
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      bowlerName: 'Frank Dorsey',
      divisionName: 'Open',
      handicap: false,
      providedAverage: 214,
    },
  ]
}

function setup(options: { role?: 'director' | 'scoreKeeper' | 'admin'; complete?: boolean } = {}) {
  const store = createInMemoryAverageStore([
    { tournamentId: tournament.id, complete: options.complete, registrations: registrations() },
  ])
  const recorded = recordingEvents()
  const captured = createCapturedLogger()
  const app = createSignedInTestApp(
    { averageStore: store, events: recorded.events, logger: captured.logger },
    options.role,
  )
  return { app, store, published: recorded.published, captured }
}

const base = `/v1/tournaments/${tournament.id}`
const checkUrl = (id: string) => `${base}/registrations/${id}/average-check`

describe('GET /v1/tournaments/{id}/averages (AVG-02)', () => {
  it('lists handicap-division registrations with their status (AVG-02)', async () => {
    const { app } = setup()

    const response = await request(app).get(`${base}/averages`)

    expect(response.status).toBe(200)
    expect(response.body.tournamentComplete).toBe(false)
    expect(response.body.rows.map((row: { bowlerName: string }) => row.bowlerName)).toEqual([
      'Bill Tran',
      'Carla Mendes',
      'Priya Natarajan',
    ])
    expect(response.body.rows[0]).toMatchObject({
      status: 'unverified',
      providedAverage: 175,
      averageInUse: 175,
      usbcId: '',
    })
  })

  it('answers 404 for an unknown tournament (AVG-02)', async () => {
    const { app } = setup()

    const response = await request(app).get(`/v1/tournaments/${crypto.randomUUID()}/averages`)

    expect(response.status).toBe(404)
  })

  it('lets a score keeper read, since it reads registrations (AVG-10, D-292)', async () => {
    const { app } = setup({ role: 'scoreKeeper' })

    expect((await request(app).get(`${base}/averages`)).status).toBe(200)
  })

  it('asks an anonymous caller to sign in and keeps the API key out (AVG-10)', async () => {
    expect((await request(createTestApp()).get(`${base}/averages`)).status).toBe(401)
    const keyed = await request(createTestApp())
      .get(`${base}/averages`)
      .set(apiKeyHeader, testApiKey)
    expect(keyed.status).toBe(403)
  })
})

describe('PUT average-check (AVG-03 to AVG-07, AVG-10)', () => {
  it('verifies the provided average (AVG-03)', async () => {
    const { app, store } = setup()

    const response = await request(app).put(checkUrl(billId)).send({ action: 'verify' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ status: 'verified', averageInUse: 175, note: null })
    expect(store.saved[0]?.check).toEqual({
      providedAverage: 175,
      verifiedAverage: 175,
      note: null,
    })
  })

  it('adjusts with a note and shows it in the list (AVG-04)', async () => {
    const { app } = setup()

    const put = await request(app)
      .put(checkUrl(billId))
      .send({ action: 'adjust', average: 182, note: 'USBC book' })
    const list = await request(app).get(`${base}/averages`)

    expect(put.body).toMatchObject({ status: 'adjusted', providedAverage: 175, averageInUse: 182 })
    expect(list.body.rows[0]).toMatchObject({
      status: 'adjusted',
      averageInUse: 182,
      providedAverage: 175,
      note: 'USBC book',
    })
  })

  it('answers 400 with the field when the note is missing (AVG-04)', async () => {
    const { app } = setup()

    const response = await request(app)
      .put(checkUrl(billId))
      .send({ action: 'adjust', average: 182, note: ' ' })

    expect(response.status).toBe(400)
    expect(response.body.errors).toEqual({
      note: 'Say why the average changed, or where it came from.',
    })
  })

  it('answers 400 when the average is above the division limit (AVG-05)', async () => {
    const { app, store } = setup()

    const response = await request(app)
      .put(checkUrl(billId))
      .send({ action: 'adjust', average: 195, note: 'Looked up' })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe(
      'The verified average is above the division limit. Move the bowler to another division.',
    )
    expect(store.saved).toEqual([])
  })

  it('cannot verify a bowler with no average (AVG-03)', async () => {
    const { app } = setup()

    const response = await request(app).put(checkUrl(priyaId)).send({ action: 'verify' })

    expect(response.status).toBe(400)
    expect(response.body.errors.average).toBeDefined()
  })

  it('warns when the bowler has scores and saves once confirmed (AVG-06)', async () => {
    const { app, store } = setup()
    const body = { action: 'adjust', average: 180, note: 'League sheet' }

    const warned = await request(app).put(checkUrl(carlaId)).send(body)
    const confirmed = await request(app)
      .put(checkUrl(carlaId))
      .send({ ...body, confirmWarnings: true })

    expect(warned.status).toBe(409)
    expect(warned.body.warnings[0].message).toContain('Payouts already made may now be wrong.')
    expect(store.saved).toHaveLength(1)
    expect(confirmed.status).toBe(200)
  })

  it('removes a check, and warns first when scores exist (AVG-07, AVG-06)', async () => {
    const { app } = setup()
    await request(app)
      .put(checkUrl(carlaId))
      .send({ action: 'adjust', average: 180, note: 'League sheet', confirmWarnings: true })

    const warned = await request(app).delete(checkUrl(carlaId))
    const removed = await request(app).delete(`${checkUrl(carlaId)}?confirmWarnings=true`)

    expect(warned.status).toBe(409)
    expect(removed.status).toBe(200)
    expect(removed.body).toMatchObject({ status: 'unverified', averageInUse: 187 })
  })

  it('answers 400 when a removal has nothing to remove (AVG-07)', async () => {
    const { app } = setup()

    expect((await request(app).delete(checkUrl(billId))).status).toBe(400)
  })

  it('answers 409 on a complete tournament (AVG-15)', async () => {
    const { app } = setup({ complete: true })

    const response = await request(app).put(checkUrl(billId)).send({ action: 'verify' })

    expect(response.status).toBe(409)
    expect(response.body.message).toBe('This tournament is complete. Averages cannot change.')
  })

  it('answers 404 for an unknown registration (AVG-03)', async () => {
    const { app } = setup()

    const response = await request(app)
      .put(checkUrl(crypto.randomUUID()))
      .send({ action: 'verify' })

    expect(response.status).toBe(404)
  })

  it('answers 400 for an unknown action (AVG-03)', async () => {
    const { app } = setup()

    expect((await request(app).put(checkUrl(billId)).send({ action: 'approve' })).status).toBe(400)
  })

  it('lets a director save and refuses a score keeper (AVG-10, D-292)', async () => {
    const director = setup({ role: 'director' })
    const keeper = setup({ role: 'scoreKeeper' })

    expect(
      (await request(director.app).put(checkUrl(billId)).send({ action: 'verify' })).status,
    ).toBe(200)
    expect(
      (await request(keeper.app).put(checkUrl(billId)).send({ action: 'verify' })).status,
    ).toBe(403)
    expect((await request(keeper.app).delete(checkUrl(billId))).status).toBe(403)
  })

  it('logs who saved, with the numbers and never the note (D-292)', async () => {
    const { app, captured } = setup()

    await request(app)
      .put(checkUrl(billId))
      .send({ action: 'adjust', average: 182, note: 'secret reason' })

    const line = captured.records().find((entry) => entry.msg === 'Average check saved')
    expect(line).toMatchObject({ registrationId: billId, action: 'adjust', was: 175, now: 182 })
    expect(JSON.stringify(captured.records())).not.toContain('secret reason')
  })
})

describe('not found (AVG-02, AVG-03)', () => {
  it('says which thing is missing', async () => {
    const { app } = setup()

    const tournamentMissing = await request(app).get(
      `/v1/tournaments/${crypto.randomUUID()}/averages`,
    )
    const registrationMissing = await request(app)
      .put(checkUrl(crypto.randomUUID()))
      .send({ action: 'verify' })

    expect(tournamentMissing.body.message).toBe('Tournament not found')
    expect(registrationMissing.body.message).toBe('Registration not found')
  })

  it('answers 404 for a registration that is in another tournament (AVG-03)', async () => {
    const { app, store } = setup()

    const response = await request(app)
      .put(`/v1/tournaments/${crypto.randomUUID()}/registrations/${billId}/average-check`)
      .send({ action: 'verify' })

    expect(response.status).toBe(404)
    expect(store.saved).toEqual([])
  })
})

describe('what a save and a removal log (D-292)', () => {
  it('logs a refused save with the action and who asked, and a removal with the numbers', async () => {
    const { app, captured } = setup()

    await request(app).put(checkUrl(billId)).send({ action: 'adjust', average: 500, note: 'x' })
    await request(app).put(checkUrl(billId)).send({ action: 'verify' })
    await request(app).delete(checkUrl(billId))
    await request(app).delete(checkUrl(billId))

    const lines = captured.records()
    const refused = lines.filter((entry) => entry.msg === 'Average check refused')
    expect(refused).toHaveLength(2)
    expect(refused[0]).toMatchObject({ registrationId: billId, action: 'adjust' })
    expect(refused[0]?.actorId).toEqual(expect.any(String))
    expect(refused[1]).toMatchObject({ registrationId: billId, action: 'remove' })
    expect(lines.find((entry) => entry.msg === 'Average check removed')).toMatchObject({
      registrationId: billId,
      action: 'remove',
      was: 175,
      now: 175,
    })
  })
})

describe('refusals and removals leave a clear trail (D-292)', () => {
  it('logs a save the complete tournament refused, and a removal that works logs no refusal', async () => {
    const complete = setup({ complete: true })
    await request(complete.app).put(checkUrl(billId)).send({ action: 'verify' })
    const open = setup()
    await request(open.app).put(checkUrl(billId)).send({ action: 'verify' })
    await request(open.app).delete(checkUrl(billId))

    expect(
      complete.captured.records().find((entry) => entry.msg === 'Average check refused'),
    ).toMatchObject({ registrationId: billId, action: 'verify' })
    expect(open.captured.records().some((entry) => entry.msg === 'Average check refused')).toBe(
      false,
    )
  })

  it('removes the check of the registration asked for and no other', async () => {
    const { app } = setup()
    await request(app).put(checkUrl(billId)).send({ action: 'verify' })
    await request(app)
      .put(checkUrl(carlaId))
      .send({ action: 'adjust', average: 180, note: 'League sheet', confirmWarnings: true })

    await request(app).delete(`${checkUrl(carlaId)}?confirmWarnings=true`)

    const rows = (await request(app).get(`${base}/averages`)).body.rows as {
      registrationId: string
      status: string
    }[]
    const statusOf = (id: string) => rows.find((row) => row.registrationId === id)?.status
    expect(statusOf(billId)).toBe('verified')
    expect(statusOf(carlaId)).toBe('unverified')
  })
})

describe('the averages event (AVG-19, D-298)', () => {
  it('tells only the tournament stream for a registration on no session', async () => {
    const { app, published } = setup()

    await request(app)
      .put(checkUrl(priyaId))
      .send({ action: 'adjust', average: 160, note: 'League sheet' })

    expect(published).toEqual([{ sessionId: liveKey(tournament.id), kind: 'averages' }])
  })

  it('tells every session of the registration and the tournament stream, and no more', async () => {
    const { app, published } = setup()

    await request(app).put(checkUrl(billId)).send({ action: 'verify' })

    expect(published).toEqual([
      { sessionId: squadId, kind: 'averages' },
      { sessionId: sweeperId, kind: 'averages' },
      { sessionId: liveKey(tournament.id), kind: 'averages' },
    ])
  })

  it('tells the screens after a removal too (AVG-19)', async () => {
    const { app, published } = setup()
    await request(app).put(checkUrl(billId)).send({ action: 'verify' })
    published.length = 0

    await request(app).delete(checkUrl(billId))

    expect(published.map((event) => event.kind)).toEqual(['averages', 'averages', 'averages'])
  })

  it('tells no one when the save is refused (AVG-19)', async () => {
    const { app, published } = setup()

    await request(app).put(checkUrl(billId)).send({ action: 'adjust', average: 500, note: 'x' })

    expect(published).toEqual([])
  })
})
