import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { createSquad, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemorySquadWriter, type SquadWriter } from './writer.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const otherTournamentId = '22222222-2222-4222-8222-222222222222'
const squadId = '33333333-3333-4333-8333-333333333333'
const url = `/v1/tournaments/${tournamentId}/squads/${squadId}`

const squad = createSquad({
  id: squadId,
  date: '2026-10-24T09:00:00',
  startingLane: 1,
  numberOfLanes: 20,
  maxPerPair: 4,
  entryFee: 60,
  entryFeeOverridden: true,
})

function setup(options: Parameters<typeof createInMemorySquadWriter>[0] = {}) {
  const made = createInMemorySquadWriter({
    tournament: {
      startDate: '2026-10-23',
      endDate: '2026-10-25',
      entryFee: 50,
      finalsRatio: 7,
      cashRatio: 5,
      games: 3,
    },
    seed: [{ tournamentId, squad: { ...squad } }],
    ...options,
  })
  return { ...made, app: createSignedInTestApp({ squadWriter: made.writer }) }
}

describe(`PATCH ${url}`, () => {
  it('changes the fields sent and answers 200 with the squad in the list shape (SQD-23)', async () => {
    const { app, stored } = setup()

    const response = await request(app).patch(url).send({ maxPerPair: 3, entryFee: 70 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ squad: { ...squad, maxPerPair: 3, entryFee: 70 } })
    expect(stored[0]?.squad).toEqual({ ...squad, maxPerPair: 3, entryFee: 70 })
  })

  it('clears an override: the tournament value shows with no override flag (D-183)', async () => {
    const { app } = setup()

    const response = await request(app).patch(url).send({ entryFee: '' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ squad: { entryFee: 50, entryFeeOverridden: false } })
  })

  it('answers 200 and writes nothing when nothing changes (SQD-23)', async () => {
    const { app, stored } = setup()

    const response = await request(app).patch(url).send({ maxPerPair: 4 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ squad })
    expect(stored[0]?.squad).toEqual(squad)
  })

  it('answers 400 with a message for each field that breaks a rule (SQD-23)', async () => {
    const { app } = setup()

    const response = await request(app).patch(url).send({ startingLane: 2, maxPerPair: 9 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Check the highlighted fields. Starting lane must be odd',
      errors: {
        startingLane: 'Starting lane must be odd',
        maxPerPair: 'Max per pair must be between 2 and 5',
      },
    })
  })

  it('answers 400 for complete and any unknown key (SQD-18)', async () => {
    const response = await request(setup().app).patch(url).send({ complete: false })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errors: { complete: 'This field is not accepted' } })
  })

  it('answers 400 when the stored lane and the new one pass lane 200 (D-179)', async () => {
    const response = await request(setup().app).patch(url).send({ startingLane: 199 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Check the highlighted fields. Lanes must end at lane 200 or lower',
      errors: { numberOfLanes: 'Lanes must end at lane 200 or lower' },
    })
  })

  it('answers 400 for an id that is not a UUID, and 404 for an unknown tournament or squad', async () => {
    const bad = await request(setup().app)
      .patch(`/v1/tournaments/${tournamentId}/squads/x`)
      .send({})
    const tournament = await request(setup({ known: [otherTournamentId] }).app)
      .patch(url)
      .send({})
    const missing = await request(setup().app)
      .patch(`/v1/tournaments/${tournamentId}/squads/${otherTournamentId}`)
      .send({})

    expect(bad.status).toBe(400)
    expect(tournament.status).toBe(404)
    expect(tournament.body).toEqual({ message: 'Tournament not found' })
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({ message: 'Squad not found' })
  })

  it('treats a squad of another tournament as not found (SQD-23)', async () => {
    const { app } = setup()

    const response = await request(app)
      .patch(`/v1/tournaments/${otherTournamentId}/squads/${squadId}`)
      .send({})

    expect(response.body).toEqual({ message: 'Squad not found' })
  })

  describe('refusals (SQD-24, D-181, D-182)', () => {
    it('answers 409 with errors for a complete tournament', async () => {
      const { app, stored } = setup({ completed: [tournamentId] })

      const response = await request(app).patch(url).send({ entryFee: 70 })

      expect(response.status).toBe(409)
      expect(response.body).toEqual({
        message: 'This tournament is complete and cannot be changed',
        errors: { tournament: 'This tournament is complete and cannot be changed' },
      })
      expect(stored[0]?.squad).toEqual(squad)
    })

    it('answers 409 with errors for a complete squad', async () => {
      const { app } = setup({ seed: [{ tournamentId, squad: { ...squad, complete: true } }] })

      const response = await request(app).patch(url).send({ entryFee: 70 })

      expect(response.status).toBe(409)
      expect(response.body).toEqual({
        message: 'This squad is complete and cannot be changed',
        errors: { session: 'This squad is complete and cannot be changed' },
      })
    })

    it('answers 409 for a date outside the tournament', async () => {
      const response = await request(setup().app).patch(url).send({ date: '2026-10-22T09:00' })

      expect(response.status).toBe(409)
      expect(response.body).toMatchObject({
        errors: { date: 'Squad date must be after tournament start' },
      })
    })

    it('answers 409 for a change that strands a bowler, and confirming cannot override it', async () => {
      const { app, stored } = setup({ editFacts: { [squadId]: { assignedLanes: [19, 20] } } })

      const response = await request(app)
        .patch(url)
        .send({ numberOfLanes: 10, confirmWarnings: true })

      expect(response.status).toBe(409)
      expect(response.body).toMatchObject({
        errors: { numberOfLanes: 'Lane 20 has a bowler assigned. Move them first.' },
      })
      expect(stored[0]?.squad).toEqual(squad)
    })
  })

  describe('warnings (SQD-25, D-129)', () => {
    it('answers 409 with warnings and saves nothing, then saves with confirmWarnings', async () => {
      const { app, stored } = setup({ editFacts: { [squadId]: { entryCount: 12 } } })

      const warned = await request(app).patch(url).send({ entryFee: 75 })

      expect(warned.status).toBe(409)
      expect(warned.body).toEqual({
        message: 'Confirm these changes to save them.',
        warnings: [
          {
            field: 'entryFee',
            message:
              '12 bowlers are entered. They keep what they paid. New entries pay the new fee.',
          },
        ],
      })
      expect(stored[0]?.squad.entryFee).toBe(60)

      const saved = await request(app).patch(url).send({ entryFee: 75, confirmWarnings: true })

      expect(saved.status).toBe(200)
      expect(stored[0]?.squad.entryFee).toBe(75)
    })
  })

  it('logs who changed which fields, never the values (SQD-23, D-184)', async () => {
    const { logger, records } = createCapturedLogger()
    const { writer } = setup()
    const app = createSignedInTestApp({ squadWriter: writer, logger })

    await request(app).patch(url).send({ maxPerPair: 3, entryFee: 70.25 })

    const line = records().find((record) => record['msg'] === 'Squad updated')
    expect(line).toMatchObject({
      level: 30,
      tournamentId,
      squadId,
      fields: ['maxPerPair', 'entryFee'],
    })
    expect(typeof line?.['actorId']).toBe('string')
    expect(JSON.stringify(line)).not.toContain('70.25')
  })

  it('does not log a save that changed nothing', async () => {
    const { logger, records } = createCapturedLogger()
    const app = createSignedInTestApp({ squadWriter: setup().writer, logger })

    await request(app).patch(url).send({})

    expect(records().find((record) => record['msg'] === 'Squad updated')).toBeUndefined()
  })

  it('passes a storage outage on as 503', async () => {
    const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
    const writer: SquadWriter = { create: outage, update: outage, getEditInfo: outage }

    const response = await request(createSignedInTestApp({ squadWriter: writer }))
      .patch(url)
      .send({ entryFee: 70 })

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  describe('who may call it (SQD-23, D-96, D-97)', () => {
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
      const app = createSignedInTestApp({ squadWriter: writer }, role)

      expect((await request(app).patch(url).send({ entryFee: 70 })).status).toBe(200)
    })
  })
})

describe(`GET ${url}/edit-info`, () => {
  const infoUrl = `${url}/edit-info`

  it('answers the entries, assignments, scores, and lane facts (SQD-26)', async () => {
    const { app } = setup({
      editFacts: {
        [squadId]: { entryCount: 12, hasScores: true, assignedLanes: [15, 15, 16, 3] },
      },
    })

    const response = await request(app).get(infoUrl)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      editInfo: {
        entryCount: 12,
        assignmentCount: 4,
        hasScores: true,
        lowestAssignedLane: 3,
        highestAssignedLane: 16,
        fullestPair: 3,
      },
    })
  })

  it('answers zeros and nulls for a squad nobody is in (SQD-26)', async () => {
    const response = await request(setup().app).get(infoUrl)

    expect(response.body).toEqual({
      editInfo: {
        entryCount: 0,
        assignmentCount: 0,
        hasScores: false,
        lowestAssignedLane: null,
        highestAssignedLane: null,
        fullestPair: null,
      },
    })
  })

  it('answers 404 for an unknown tournament or squad, and 400 for a bad id (SQD-26)', async () => {
    const tournament = await request(setup({ known: [otherTournamentId] }).app).get(infoUrl)
    const missing = await request(setup().app).get(
      `/v1/tournaments/${tournamentId}/squads/${otherTournamentId}/edit-info`,
    )
    const bad = await request(setup().app).get(`/v1/tournaments/${tournamentId}/squads/x/edit-info`)

    expect(tournament.body).toEqual({ message: 'Tournament not found' })
    expect(missing.body).toEqual({ message: 'Squad not found' })
    expect(bad.status).toBe(400)
  })

  it('answers 401 signed out, and 403 to the API key and a score keeper (SQD-26)', async () => {
    const out = await request(createTestApp()).get(infoUrl)
    const key = await request(createTestApp()).get(infoUrl).set(apiKeyHeader, testApiKey)
    const keeper = await request(createSignedInTestApp({}, 'scoreKeeper')).get(infoUrl)

    expect([out.status, key.status, keeper.status]).toEqual([401, 403, 403])
  })

  it('passes a storage outage on as 503', async () => {
    const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
    const writer: SquadWriter = { create: outage, update: outage, getEditInfo: outage }

    const response = await request(createSignedInTestApp({ squadWriter: writer })).get(infoUrl)

    expect(response.status).toBe(503)
  })
})
