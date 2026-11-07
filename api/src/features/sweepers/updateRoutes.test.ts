import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { createSweeper, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemorySweeperWriter, type SweeperWriter } from './writer.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const otherTournamentId = '22222222-2222-4222-8222-222222222222'
const sweeperId = '33333333-3333-4333-8333-333333333333'
const openId = '44444444-4444-4444-8444-444444444444'
const womenId = '55555555-5555-4555-8555-555555555555'
const url = `/v1/tournaments/${tournamentId}/sweepers/${sweeperId}`

const sweeper = createSweeper({
  id: sweeperId,
  date: '2026-10-23T19:00:00',
  startingLane: 11,
  numberOfLanes: 10,
  maxPerPair: 3,
  entryFee: 20,
  games: 3,
  cashRatio: 5,
  bonusPins: [{ divisionId: openId, divisionName: 'Open', bonusPinsPerGame: 10 }],
})

const divisions = [
  { id: openId, name: 'Open', number: 1 },
  { id: womenId, name: 'Women', number: 2 },
]

function setup(options: Parameters<typeof createInMemorySweeperWriter>[0] = {}) {
  const made = createInMemorySweeperWriter({
    dates: { startDate: '2026-10-23', endDate: '2026-10-25' },
    divisions,
    seed: [{ tournamentId, sweeper: { ...sweeper } }],
    ...options,
  })
  return { ...made, app: createSignedInTestApp({ sweeperWriter: made.writer }) }
}

describe(`PATCH ${url}`, () => {
  it('changes the fields sent and answers 200 with the sweeper in the list shape (SQD-23)', async () => {
    const { app, stored } = setup()

    const response = await request(app).patch(url).send({ games: 4, entryFee: 25 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ sweeper: { ...sweeper, games: 4, entryFee: 25 } })
    expect(stored[0]?.sweeper).toEqual({ ...sweeper, games: 4, entryFee: 25 })
  })

  it('leaves a pin not sent alone, adds one, and deletes one sent as blank or 0 (SQD-29, D-184)', async () => {
    const { app } = setup()

    const added = await request(app)
      .patch(url)
      .send({ bonusPins: { [womenId]: 6 } })
    expect((added.body as { sweeper: { bonusPins: unknown } }).sweeper.bonusPins).toEqual([
      { divisionId: openId, divisionName: 'Open', bonusPinsPerGame: 10 },
      { divisionId: womenId, divisionName: 'Women', bonusPinsPerGame: 6 },
    ])

    const removed = await request(app)
      .patch(url)
      .send({ bonusPins: { [openId]: '' } })
    expect((removed.body as { sweeper: { bonusPins: unknown } }).sweeper.bonusPins).toEqual([
      { divisionId: womenId, divisionName: 'Women', bonusPinsPerGame: 6 },
    ])
  })

  it('answers 200 and writes nothing when nothing changes (SQD-23)', async () => {
    const { app, stored } = setup()

    const response = await request(app)
      .patch(url)
      .send({ games: 3, bonusPins: { [openId]: 10 } })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ sweeper })
    expect(stored[0]?.sweeper).toEqual(sweeper)
  })

  it('answers 400 with a message for each field, a pin under bonusPins.<id> (SQD-23, SQD-13)', async () => {
    const response = await request(setup().app)
      .patch(url)
      .send({ entryFee: 0, bonusPins: { [openId]: 120 } })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Check the highlighted fields. Entry fee must be greater than $0',
      errors: {
        entryFee: 'Entry fee must be greater than $0',
        [`bonusPins.${openId}`]: 'Bonus pins must be between 0 and 99',
      },
    })
  })

  it('answers 400 for complete and finalsRatio (SQD-18)', async () => {
    const response = await request(setup().app).patch(url).send({ complete: false, finalsRatio: 5 })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      errors: { complete: 'This field is not accepted', finalsRatio: 'This field is not accepted' },
    })
  })

  it('answers 400 when the stored lane and the new one pass lane 200 (D-179)', async () => {
    const response = await request(setup().app).patch(url).send({ startingLane: 197 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Check the highlighted fields. Lanes must end at lane 200 or lower',
      errors: { numberOfLanes: 'Lanes must end at lane 200 or lower' },
    })
  })

  it('answers 400 for a bad id, 404 for an unknown tournament, sweeper, or another tournament', async () => {
    const bad = await request(setup().app)
      .patch(`/v1/tournaments/${tournamentId}/sweepers/x`)
      .send({})
    const tournament = await request(setup({ known: [otherTournamentId] }).app)
      .patch(url)
      .send({})
    const missing = await request(setup().app)
      .patch(`/v1/tournaments/${tournamentId}/sweepers/${otherTournamentId}`)
      .send({})
    const foreign = await request(setup().app)
      .patch(`/v1/tournaments/${otherTournamentId}/sweepers/${sweeperId}`)
      .send({})

    expect(bad.status).toBe(400)
    expect(tournament.body).toEqual({ message: 'Tournament not found' })
    expect(missing.body).toEqual({ message: 'Sweeper not found' })
    expect(foreign.body).toEqual({ message: 'Sweeper not found' })
  })

  describe('refusals (SQD-24, SQD-29, D-177, D-181)', () => {
    it('answers 409 for a complete tournament and for a complete sweeper', async () => {
      const frozen = await request(setup({ completed: [tournamentId] }).app)
        .patch(url)
        .send({ games: 4 })
      const complete = await request(
        setup({ seed: [{ tournamentId, sweeper: { ...sweeper, complete: true } }] }).app,
      )
        .patch(url)
        .send({ games: 4 })

      expect(frozen.status).toBe(409)
      expect(frozen.body).toMatchObject({
        errors: { tournament: 'This tournament is complete and cannot be changed' },
      })
      expect(complete.status).toBe(409)
      expect(complete.body).toEqual({
        message: 'This sweeper is complete and cannot be changed',
        errors: { session: 'This sweeper is complete and cannot be changed' },
      })
    })

    it('answers 409 for games once a score exists, even confirmed', async () => {
      const { app, stored } = setup({ editFacts: { [sweeperId]: { hasScores: true } } })

      const response = await request(app).patch(url).send({ games: 4, confirmWarnings: true })

      expect(response.status).toBe(409)
      expect(response.body).toMatchObject({
        errors: { games: 'Scores are saved, so the number of games cannot change.' },
      })
      expect(stored[0]?.sweeper.games).toBe(3)
    })

    it('answers 409 for a division that is not the tournament’s, saving nothing', async () => {
      const { app, stored } = setup()

      const response = await request(app)
        .patch(url)
        .send({ games: 4, bonusPins: { '99999999-9999-4999-8999-999999999999': 5 } })

      expect(response.status).toBe(409)
      expect(response.body).toMatchObject({
        errors: { bonusPins: 'A division no longer exists. Reload the page' },
      })
      expect(stored[0]?.sweeper).toEqual(sweeper)
    })

    it('answers 409 for a date outside the tournament and for a stranded bowler', async () => {
      const date = await request(setup().app).patch(url).send({ date: '2026-10-26T09:00' })
      const lanes = await request(
        setup({ editFacts: { [sweeperId]: { assignedLanes: [19, 20] } } }).app,
      )
        .patch(url)
        .send({ numberOfLanes: 6 })

      expect(date.body).toMatchObject({
        errors: { date: 'Sweeper date must be before tournament end' },
      })
      expect(lanes.body).toMatchObject({
        errors: { numberOfLanes: 'Lane 20 has a bowler assigned. Move them first.' },
      })
    })
  })

  describe('warnings (SQD-25, D-129)', () => {
    it('answers 409 with warnings, then saves with confirmWarnings', async () => {
      const { app, stored } = setup({
        editFacts: { [sweeperId]: { hasScores: true, entryCount: 9 } },
      })
      const sent = { cashRatio: 4, bonusPins: { [openId]: 8 } }

      const warned = await request(app).patch(url).send(sent)

      expect(warned.status).toBe(409)
      expect(warned.body).toEqual({
        message: 'Confirm these changes to save them.',
        warnings: [
          { field: 'cashRatio', message: 'Scores are saved. Posted results change at once.' },
          {
            field: `bonusPins.${openId}`,
            message: 'Open: scores are saved. Posted results change at once.',
          },
        ],
      })
      expect(stored[0]?.sweeper.cashRatio).toBe(5)

      const saved = await request(app)
        .patch(url)
        .send({ ...sent, confirmWarnings: true })

      expect(saved.status).toBe(200)
      expect(stored[0]?.sweeper.cashRatio).toBe(4)
      expect(stored[0]?.sweeper.bonusPins[0]?.bonusPinsPerGame).toBe(8)
    })
  })

  it('logs who changed which fields, never the values (SQD-23, D-184)', async () => {
    const { logger, records } = createCapturedLogger()
    const app = createSignedInTestApp({ sweeperWriter: setup().writer, logger })

    await request(app).patch(url).send({ games: 4, entryFee: 27.31 })

    const line = records().find((record) => record['msg'] === 'Sweeper updated')
    expect(line).toMatchObject({ tournamentId, sweeperId, fields: ['entryFee', 'games'] })
    expect(typeof line?.['actorId']).toBe('string')
    expect(JSON.stringify(line)).not.toContain('27.31')
  })

  it('does not log a save that changed nothing', async () => {
    const { logger, records } = createCapturedLogger()
    const app = createSignedInTestApp({ sweeperWriter: setup().writer, logger })

    await request(app).patch(url).send({})

    expect(records().find((record) => record['msg'] === 'Sweeper updated')).toBeUndefined()
  })

  it('works out the divisions and the tournament days from the sweeper when none are given', async () => {
    const twoPins = {
      ...sweeper,
      bonusPins: [
        { divisionId: openId, divisionName: 'Open', bonusPinsPerGame: 10 },
        { divisionId: womenId, divisionName: 'Women', bonusPinsPerGame: 6 },
      ],
    }
    const { app } = setup({
      divisions: undefined,
      dates: undefined,
      seed: [{ tournamentId, sweeper: twoPins }],
    })

    const response = await request(app)
      .patch(url)
      .send({ date: '2026-10-26T09:00', bonusPins: { [womenId]: 7 } })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      sweeper: {
        date: '2026-10-26T09:00:00',
        bonusPins: [
          { divisionId: openId, divisionName: 'Open', bonusPinsPerGame: 10 },
          { divisionId: womenId, divisionName: 'Women', bonusPinsPerGame: 7 },
        ],
      },
    })
  })

  it('passes a storage outage on as 503', async () => {
    const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
    const writer: SweeperWriter = { create: outage, update: outage, getEditInfo: outage }

    const response = await request(createSignedInTestApp({ sweeperWriter: writer }))
      .patch(url)
      .send({ games: 4 })

    expect(response.status).toBe(503)
  })

  describe('who may call it (SQD-23, D-96, D-97)', () => {
    it('answers 401 when signed out', async () => {
      expect((await request(createTestApp()).patch(url).send({})).status).toBe(401)
    })

    it('answers 403 to the API key and to a score keeper', async () => {
      const key = await request(createTestApp()).patch(url).set(apiKeyHeader, testApiKey).send({})
      const keeper = await request(createSignedInTestApp({}, 'scoreKeeper')).patch(url).send({})

      expect([key.status, keeper.status]).toEqual([403, 403])
    })

    it.each(['director', 'admin'] as const)('lets a %s edit', async (role) => {
      const { writer } = setup()
      const app = createSignedInTestApp({ sweeperWriter: writer }, role)

      expect((await request(app).patch(url).send({ games: 4 })).status).toBe(200)
    })
  })
})

describe(`GET ${url}/edit-info`, () => {
  const infoUrl = `${url}/edit-info`

  it('answers the entries, assignments, scores, and lane facts (SQD-26)', async () => {
    const { app } = setup({
      editFacts: {
        [sweeperId]: { entryCount: 9, hasScores: true, assignedLanes: [11, 11, 12] },
      },
    })

    const response = await request(app).get(infoUrl)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      editInfo: {
        entryCount: 9,
        assignmentCount: 3,
        hasScores: true,
        lowestAssignedLane: 11,
        highestAssignedLane: 12,
        fullestPair: 3,
      },
    })
  })

  it('answers 404 for an unknown tournament or sweeper, 400 for a bad id (SQD-26)', async () => {
    const tournament = await request(setup({ known: [otherTournamentId] }).app).get(infoUrl)
    const missing = await request(setup().app).get(
      `/v1/tournaments/${tournamentId}/sweepers/${otherTournamentId}/edit-info`,
    )
    const bad = await request(setup().app).get(
      `/v1/tournaments/${tournamentId}/sweepers/x/edit-info`,
    )

    expect(tournament.body).toEqual({ message: 'Tournament not found' })
    expect(missing.body).toEqual({ message: 'Sweeper not found' })
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
    const writer: SweeperWriter = { create: outage, update: outage, getEditInfo: outage }

    expect(
      (await request(createSignedInTestApp({ sweeperWriter: writer })).get(infoUrl)).status,
    ).toBe(503)
  })
})
