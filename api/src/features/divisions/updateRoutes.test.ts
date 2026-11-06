import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { createDivision } from '../../test/factories.ts'
import { testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { completeMessage, duplicateNameMessage, unusualPercentMessage } from './createPlan.ts'
import { eligibilityMessage, handicapScoresMessage } from './editPlan.ts'
import { createInMemoryDivisionWriter, type DivisionWriter } from './writer.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const otherTournamentId = '22222222-2222-4222-8222-222222222222'
const openId = '33333333-3333-4333-8333-333333333333'
const womenId = '44444444-4444-4444-8444-444444444444'
const url = `/v1/tournaments/${tournamentId}/divisions/${openId}`

const open = createDivision({
  id: openId,
  number: 1,
  name: 'Open',
  gender: null,
  minimumAge: null,
  maximumAge: null,
  minimumAverage: null,
  maximumAverage: null,
  handicapPercentage: 90,
  handicapBase: 220,
  maximumHandicapPerGame: 40,
})
const women = createDivision({ id: womenId, number: 2, name: 'Women', gender: 'Female' })

function setup(options: Parameters<typeof createInMemoryDivisionWriter>[0] = {}) {
  const made = createInMemoryDivisionWriter({
    seed: [
      { tournamentId, division: { ...open } },
      { tournamentId, division: { ...women } },
    ],
    ...options,
  })
  return { ...made, app: createSignedInTestApp({ divisionWriter: made.writer }) }
}

describe(`PATCH ${url}`, () => {
  it('changes the fields sent and answers 200 with the whole division (DIV-12)', async () => {
    const { app, stored } = setup()

    const response = await request(app).patch(url).send({ name: 'Main', gender: 'Male' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ division: { ...open, name: 'Main', gender: 'Male' } })
    expect(stored[0]?.division).toEqual({ ...open, name: 'Main', gender: 'Male' })
  })

  it('clears a limit sent as null or blank (D-147)', async () => {
    const { app } = setup()

    const response = await request(app)
      .patch(url)
      .send({ handicapPercentage: null, handicapBase: '', maximumHandicapPerGame: null })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      division: { handicapPercentage: null, handicapBase: null, maximumHandicapPerGame: null },
    })
  })

  it('answers 200 and writes nothing when nothing changes (DIV-12)', async () => {
    const captured = createCapturedLogger()
    const made = createInMemoryDivisionWriter({ seed: [{ tournamentId, division: { ...open } }] })
    const app = createSignedInTestApp({ divisionWriter: made.writer, logger: captured.logger })

    const response = await request(app).patch(url).send({ name: 'Open' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ division: open })
    expect(captured.records().some((record) => record['msg'] === 'Division updated')).toBe(false)
  })

  it('logs who changed which fields, never the values (DIV-12)', async () => {
    const captured = createCapturedLogger()
    const made = createInMemoryDivisionWriter({ seed: [{ tournamentId, division: { ...open } }] })
    const app = createSignedInTestApp({ divisionWriter: made.writer, logger: captured.logger })

    await request(app).patch(url).send({ name: 'Secret name', minimumAge: 20 })

    const line = captured.records().find((record) => record['msg'] === 'Division updated')
    expect(line).toMatchObject({ tournamentId, divisionId: openId, fields: ['name', 'minimumAge'] })
    expect(line?.['actorId']).toEqual(expect.any(String))
    expect(JSON.stringify(line)).not.toContain('Secret')
  })

  it('refuses the number and any key it does not know with 400 (D-146)', async () => {
    const { app, stored } = setup()

    const number = await request(app).patch(url).send({ number: 5 })
    const unknown = await request(app).patch(url).send({ tournamentId: otherTournamentId })

    expect(number.status).toBe(400)
    expect(unknown.status).toBe(400)
    expect(stored[0]?.division.number).toBe(1)
  })

  it('answers 400 with a message per field and stores nothing (DIV-02, DIV-04 to DIV-11)', async () => {
    const { app, stored } = setup()

    const response = await request(app).patch(url).send({ name: '', minimumAge: 0 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Check the highlighted fields. Name is required',
      errors: { name: 'Name is required', minimumAge: 'Minimum age must be between 1 and 120' },
    })
    expect(stored[0]?.division.name).toBe('Open')
  })

  it('answers 400 for a pair rule on the merged values (DIV-05)', async () => {
    const aged = createInMemoryDivisionWriter({
      seed: [{ tournamentId, division: { ...open, minimumAge: 40, maximumAge: 60 } }],
    })
    const app = createSignedInTestApp({ divisionWriter: aged.writer })

    const response = await request(app).patch(url).send({ maximumAge: 30 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message:
        'Check the highlighted fields. Minimum age must be less than or equal to maximum age',
      errors: { minimumAge: 'Minimum age must be less than or equal to maximum age' },
    })
  })

  it('answers 400 for a body that is not JSON', async () => {
    const response = await request(setup().app)
      .patch(url)
      .set('content-type', 'application/json')
      .send('{not json')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is not valid JSON.' })
  })

  it('answers 400 for an id that is not a UUID', async () => {
    const app = setup().app

    const tournament = await request(app).patch(`/v1/tournaments/x/divisions/${openId}`).send({})
    const division = await request(app)
      .patch(`/v1/tournaments/${tournamentId}/divisions/x`)
      .send({})

    expect(tournament.status).toBe(400)
    expect(division.status).toBe(400)
  })

  describe('what it cannot find (DIV-03)', () => {
    it('answers 404 for an unknown tournament', async () => {
      const { app } = setup({ known: [otherTournamentId] })

      const response = await request(app).patch(url).send({ name: 'Main' })

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ message: 'Tournament not found' })
    })

    it('answers 404 for an unknown division', async () => {
      const { app } = setup()

      const response = await request(app)
        .patch(`/v1/tournaments/${tournamentId}/divisions/${otherTournamentId}`)
        .send({ name: 'Main' })

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ message: 'Division not found' })
    })

    it('answers 404 for a division of another tournament', async () => {
      const { app } = setup()

      const response = await request(app)
        .patch(`/v1/tournaments/${otherTournamentId}/divisions/${openId}`)
        .send({ name: 'Main' })

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ message: 'Division not found' })
    })
  })

  describe('what it refuses with 409 (DIV-03, DIV-15, D-149)', () => {
    it('refuses a name another division uses, ignoring case, under the name (DIV-15)', async () => {
      const { app, stored } = setup()

      const response = await request(app).patch(url).send({ name: 'WOMEN' })

      expect(response.status).toBe(409)
      expect(response.body).toEqual({
        message: duplicateNameMessage,
        errors: { name: duplicateNameMessage },
      })
      expect(stored[0]?.division.name).toBe('Open')
    })

    it('refuses every change in a complete tournament and never lets a confirm override it (D-149)', async () => {
      const { app, stored } = setup({
        completed: [tournamentId],
        editFacts: { [openId]: { registrationCount: 3 } },
      })

      const response = await request(app)
        .patch(url)
        .send({ name: 'Main', gender: 'Male', confirmWarnings: true })

      expect(response.status).toBe(409)
      expect(response.body).toEqual({
        message: completeMessage,
        errors: { tournament: completeMessage },
      })
      expect(stored[0]?.division.name).toBe('Open')
    })
  })

  describe('what asks to confirm (D-147, D-148)', () => {
    it('answers 409 with warnings and saves nothing, then saves with confirmWarnings (D-12)', async () => {
      const { app, stored } = setup({ editFacts: { [openId]: { registrationCount: 12 } } })

      const first = await request(app).patch(url).send({ minimumAge: 18 })

      expect(first.status).toBe(409)
      expect(first.body).toEqual({
        message: 'Confirm these changes to save them.',
        warnings: [{ field: 'minimumAge', message: eligibilityMessage(12) }],
      })
      expect(stored[0]?.division.minimumAge).toBeNull()

      const second = await request(app).patch(url).send({ minimumAge: 18, confirmWarnings: true })

      expect(second.status).toBe(200)
      expect(stored[0]?.division.minimumAge).toBe(18)
    })

    it('warns that results change at once when scores exist (D-147)', async () => {
      const { app } = setup({ editFacts: { [openId]: { hasScores: true } } })

      const response = await request(app).patch(url).send({ handicapBase: 200 })

      expect(response.status).toBe(409)
      expect(response.body).toMatchObject({
        warnings: [{ field: 'handicapBase', message: handicapScoresMessage }],
      })
    })

    it('warns about a percent over 100 with nobody registered (D-142)', async () => {
      const response = await request(setup().app).patch(url).send({ handicapPercentage: 110 })

      expect(response.status).toBe(409)
      expect(response.body).toMatchObject({
        warnings: [{ field: 'handicapPercentage', message: unusualPercentMessage }],
      })
    })

    it('leaves a name change free even with bowlers and scores (D-147)', async () => {
      const { app } = setup({
        editFacts: { [openId]: { registrationCount: 12, hasScores: true } },
      })

      const response = await request(app).patch(url).send({ name: 'Main' })

      expect(response.status).toBe(200)
    })
  })

  it('passes a storage outage on as 503 (DIV-12)', async () => {
    const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
    const writer: DivisionWriter = { create: outage, update: outage, getEditInfo: outage }

    const response = await request(createSignedInTestApp({ divisionWriter: writer }))
      .patch(url)
      .send({ name: 'Main' })

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  describe('who may call it (DIV-12, D-96, D-97, D-150)', () => {
    it('answers 401 when signed out', async () => {
      expect((await request(createTestApp()).patch(url).send({})).status).toBe(401)
    })

    it('answers 403 to the API key and to a score keeper', async () => {
      const key = await request(createTestApp()).patch(url).set(apiKeyHeader, testApiKey).send({})
      const keeper = await request(createSignedInTestApp({}, 'scoreKeeper')).patch(url).send({})

      expect(key.status).toBe(403)
      expect(keeper.status).toBe(403)
    })

    it.each(['director', 'admin'] as const)('lets a %s edit', async (role) => {
      const { writer } = setup()
      const app = createSignedInTestApp({ divisionWriter: writer }, role)

      expect((await request(app).patch(url).send({ name: 'Main' })).status).toBe(200)
    })
  })
})

describe(`GET ${url}/edit-info`, () => {
  const infoUrl = `${url}/edit-info`

  it('answers the registered count and whether scores exist (D-147, D-148)', async () => {
    const { app } = setup({ editFacts: { [openId]: { registrationCount: 12, hasScores: true } } })

    const response = await request(app).get(infoUrl)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ editInfo: { registrationCount: 12, hasScores: true } })
  })

  it('answers zero and false for a division nobody is in', async () => {
    const response = await request(setup().app).get(infoUrl)

    expect(response.body).toEqual({ editInfo: { registrationCount: 0, hasScores: false } })
  })

  it('answers 404 for an unknown tournament or division', async () => {
    const tournament = await request(setup({ known: [otherTournamentId] }).app).get(infoUrl)
    const division = await request(setup().app).get(
      `/v1/tournaments/${tournamentId}/divisions/${otherTournamentId}/edit-info`,
    )

    expect(tournament.body).toEqual({ message: 'Tournament not found' })
    expect(division.body).toEqual({ message: 'Division not found' })
  })

  it('answers 400 for an id that is not a UUID', async () => {
    const response = await request(setup().app).get(
      `/v1/tournaments/${tournamentId}/divisions/x/edit-info`,
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
    const writer: DivisionWriter = { create: outage, update: outage, getEditInfo: outage }

    const response = await request(createSignedInTestApp({ divisionWriter: writer })).get(infoUrl)

    expect(response.status).toBe(503)
  })
})
