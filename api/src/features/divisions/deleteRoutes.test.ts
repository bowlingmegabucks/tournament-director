import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { createDivision, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { completeMessage } from './createPlan.ts'
import { createInMemoryDivisionWriter, type DivisionWriter } from './writer.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const otherTournamentId = '22222222-2222-4222-8222-222222222222'
const openId = '33333333-3333-4333-8333-333333333333'
const womenId = '44444444-4444-4444-8444-444444444444'
const seniorId = '55555555-5555-4555-8555-555555555555'
const otherId = '66666666-6666-4666-8666-666666666666'
const url = `/v1/tournaments/${tournamentId}/divisions/${womenId}`

const open = createDivision({ id: openId, number: 1, name: 'Open' })
const women = createDivision({ id: womenId, number: 2, name: 'Women' })
const senior = createDivision({ id: seniorId, number: 3, name: 'Senior' })
const elsewhere = createDivision({ id: otherId, number: 3, name: 'Open' })

function setup(options: Parameters<typeof createInMemoryDivisionWriter>[0] = {}) {
  const made = createInMemoryDivisionWriter({
    seed: [
      { tournamentId, division: { ...open } },
      { tournamentId, division: { ...women } },
      { tournamentId, division: { ...senior } },
      { tournamentId: otherTournamentId, division: { ...elsewhere } },
    ],
    ...options,
  })
  return { ...made, app: createSignedInTestApp({ divisionWriter: made.writer }) }
}

const numbersOf = (stored: ReturnType<typeof setup>['stored'], id = tournamentId) =>
  stored
    .filter((entry) => entry.tournamentId === id)
    .map((entry) => [entry.division.name, entry.division.number])

describe(`DELETE ${url}`, () => {
  it('deletes the division and answers 204 with no body (DIV-12)', async () => {
    const { app, stored } = setup()

    const response = await request(app).delete(url)

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(stored.map((entry) => entry.division.id)).not.toContain(womenId)
  })

  it('moves the later divisions down by one and leaves the rest alone (DIV-01, D-153)', async () => {
    const { app, stored } = setup()

    await request(app).delete(url)

    expect(numbersOf(stored)).toEqual([
      ['Open', 1],
      ['Senior', 2],
    ])
    expect(numbersOf(stored, otherTournamentId)).toEqual([['Open', 3]])
  })

  it('closes no gap when another division still holds the deleted number (D-153)', async () => {
    const twin = createDivision({
      id: '88888888-8888-4888-8888-888888888888',
      number: 2,
      name: 'Twin',
    })
    const made = createInMemoryDivisionWriter({
      seed: [
        { tournamentId, division: { ...open } },
        { tournamentId, division: { ...women } },
        { tournamentId, division: { ...twin } },
        { tournamentId, division: { ...senior } },
      ],
    })

    await request(createSignedInTestApp({ divisionWriter: made.writer })).delete(url)

    expect(numbersOf(made.stored)).toEqual([
      ['Open', 1],
      ['Twin', 2],
      ['Senior', 3],
    ])
  })

  it('refuses a division with bowlers with 409 and keeps everything (D-151)', async () => {
    const { app, stored } = setup({ deleteInfo: { [womenId]: { registrationCount: 12 } } })

    const response = await request(app).delete(url)

    expect(response.status).toBe(409)
    const message =
      '12 bowlers are registered in this division. Move them to another division first.'
    expect(response.body).toEqual({ message, errors: { division: message } })
    expect(numbersOf(stored)).toEqual([
      ['Open', 1],
      ['Women', 2],
      ['Senior', 3],
    ])
  })

  it('refuses a complete tournament with 409 (DIV-03, D-143, D-151)', async () => {
    const { app, stored } = setup({ completed: [tournamentId] })

    const response = await request(app).delete(url)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: completeMessage,
      errors: { tournament: completeMessage },
    })
    expect(stored).toHaveLength(4)
  })

  it('reports both reasons, the tournament first, when both hold (D-151)', async () => {
    const { app } = setup({
      completed: [tournamentId],
      deleteInfo: { [womenId]: { registrationCount: 1 } },
    })

    const response = await request(app).delete(url)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: completeMessage,
      errors: {
        tournament: completeMessage,
        division: '1 bowler is registered in this division. Move them to another division first.',
      },
    })
  })

  it('lets the last division go (D-151)', async () => {
    const lone = createInMemoryDivisionWriter({
      seed: [{ tournamentId, division: { ...women } }],
    })

    const response = await request(createSignedInTestApp({ divisionWriter: lone.writer })).delete(
      url,
    )

    expect(response.status).toBe(204)
    expect(lone.stored).toEqual([])
  })

  it('logs who deleted which division and the number it held, never the name (D-155)', async () => {
    const captured = createCapturedLogger()
    const made = setup()
    const app = createSignedInTestApp({
      divisionWriter: made.writer,
      logger: captured.logger,
    })

    await request(app).delete(url)

    const line = captured.records().find((record) => record['msg'] === 'Division deleted')
    expect(line).toMatchObject({ level: 30, tournamentId, divisionId: womenId, number: 2 })
    expect(line?.['actorId']).toEqual(expect.any(String))
    expect(JSON.stringify(captured.records())).not.toContain('Women')
  })

  it('logs a refusal as a warning with ids and the count of reasons, nothing else (D-155)', async () => {
    const captured = createCapturedLogger()
    const made = setup({
      completed: [tournamentId],
      deleteInfo: { [womenId]: { registrationCount: 4 } },
    })
    const app = createSignedInTestApp({
      divisionWriter: made.writer,
      logger: captured.logger,
    })

    await request(app).delete(url)

    const records = captured.records()
    const line = records.find((record) => record['msg'] === 'Division delete refused')
    expect(line).toMatchObject({ level: 40, tournamentId, divisionId: womenId, reasons: 2 })
    expect(records.some((record) => record['msg'] === 'Division deleted')).toBe(false)
  })

  it('answers 400 for an id that is not a UUID', async () => {
    const { app } = setup()

    const badTournament = await request(app).delete(`/v1/tournaments/nope/divisions/${womenId}`)
    const badDivision = await request(app).delete(`/v1/tournaments/${tournamentId}/divisions/nope`)

    expect(badTournament.status).toBe(400)
    expect(badDivision.status).toBe(400)
  })

  describe('what it cannot find (DIV-03)', () => {
    it('answers 404 for an unknown tournament', async () => {
      const { app } = setup({ known: [otherTournamentId] })

      const response = await request(app).delete(url)

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ message: 'Tournament not found' })
    })

    it('answers 404 for an unknown division', async () => {
      const { app } = setup()

      const response = await request(app).delete(
        `/v1/tournaments/${tournamentId}/divisions/77777777-7777-4777-8777-777777777777`,
      )

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ message: 'Division not found' })
    })

    it('answers 404 for a division of another tournament and deletes nothing', async () => {
      const { app, stored } = setup()

      const response = await request(app).delete(
        `/v1/tournaments/${tournamentId}/divisions/${otherId}`,
      )

      expect(response.status).toBe(404)
      expect(stored).toHaveLength(4)
    })
  })

  it('passes a storage outage on as 503', async () => {
    const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
    const writer: DivisionWriter = {
      create: outage,
      update: outage,
      getEditInfo: outage,
      remove: outage,
      getDeleteInfo: outage,
    }

    const response = await request(createSignedInTestApp({ divisionWriter: writer })).delete(url)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  describe('who may call it (DIV-12, D-96, D-150, D-151)', () => {
    it('answers 401 when signed out', async () => {
      expect((await request(createTestApp()).delete(url)).status).toBe(401)
    })

    it('answers 403 to the API key and to a score keeper', async () => {
      const key = await request(createTestApp()).delete(url).set(apiKeyHeader, testApiKey)
      const keeper = await request(createSignedInTestApp({}, 'scoreKeeper')).delete(url)

      expect(key.status).toBe(403)
      expect(keeper.status).toBe(403)
    })

    it.each(['director', 'admin'] as const)('lets a %s delete', async (role) => {
      const { writer } = setup()
      const app = createSignedInTestApp({ divisionWriter: writer }, role)

      expect((await request(app).delete(url)).status).toBe(204)
    })
  })
})

describe(`GET ${url}/delete-info`, () => {
  const infoUrl = `${url}/delete-info`

  it('answers the registered count and the sweepers holding pins (D-154)', async () => {
    const { app } = setup({
      deleteInfo: { [womenId]: { registrationCount: 12, sweeperCount: 2 } },
    })

    const response = await request(app).get(infoUrl)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ deleteInfo: { registrationCount: 12, sweeperCount: 2 } })
  })

  it('answers zero and zero for a division with nothing under it', async () => {
    const response = await request(setup().app).get(infoUrl)

    expect(response.body).toEqual({ deleteInfo: { registrationCount: 0, sweeperCount: 0 } })
  })

  it('answers 404 for an unknown tournament or division', async () => {
    const missingDivision = await request(setup().app).get(
      `/v1/tournaments/${tournamentId}/divisions/${otherId}/delete-info`,
    )
    const missingTournament = await request(setup({ known: [otherTournamentId] }).app).get(infoUrl)

    expect(missingDivision.body).toEqual({ message: 'Division not found' })
    expect(missingTournament.body).toEqual({ message: 'Tournament not found' })
    expect([missingDivision.status, missingTournament.status]).toEqual([404, 404])
  })

  it('answers 400 for an id that is not a UUID', async () => {
    const response = await request(setup().app).get(
      `/v1/tournaments/${tournamentId}/divisions/nope/delete-info`,
    )

    expect(response.status).toBe(400)
  })

  it('answers 401 signed out, and 403 to the API key and a score keeper', async () => {
    const out = await request(createTestApp()).get(infoUrl)
    const key = await request(createTestApp()).get(infoUrl).set(apiKeyHeader, testApiKey)
    const keeper = await request(createSignedInTestApp({}, 'scoreKeeper')).get(infoUrl)

    expect([out.status, key.status, keeper.status]).toEqual([401, 403, 403])
  })

  it('passes a storage outage on as 503', async () => {
    const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
    const writer: DivisionWriter = {
      create: outage,
      update: outage,
      getEditInfo: outage,
      remove: outage,
      getDeleteInfo: outage,
    }

    const response = await request(createSignedInTestApp({ divisionWriter: writer })).get(infoUrl)

    expect(response.status).toBe(503)
  })
})
