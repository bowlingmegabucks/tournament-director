import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { createNewTournament, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import type { EditFacts } from './editFacts.ts'
import {
  createInMemoryTournamentWriter,
  type TournamentWriter,
  type UpdateTournamentOutcome,
} from './writer.ts'

const first = { id: crypto.randomUUID(), ...createNewTournament({ name: 'Spring Classic' }) }
const second = {
  id: crypto.randomUUID(),
  ...createNewTournament({ name: 'Fall Classic', startDate: '2027-10-01', endDate: '2027-10-03' }),
}
const path = `/v1/tournaments/${first.id}`

function setup(options: { facts?: Partial<EditFacts>; completed?: boolean } = {}) {
  const captured = createCapturedLogger()
  const { writer, stored } = createInMemoryTournamentWriter([{ ...first }, { ...second }], {
    facts: { [first.id]: options.facts ?? {} },
    completed: options.completed ? [first.id] : [],
  })
  const app = createSignedInTestApp({ tournamentWriter: writer, logger: captured.logger })
  return { app, stored, captured }
}

describe('PATCH /v1/tournaments/:id', () => {
  it('changes the fields it was sent and answers 200 with the tournament (TRN-24)', async () => {
    const { app, stored } = setup()

    const response = await request(app).patch(path).send({ name: 'Renamed', entryFee: 70 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ tournament: { ...first, name: 'Renamed', entryFee: 70 } })
    expect(stored[0]).toEqual({ ...first, name: 'Renamed', entryFee: 70 })
    expect(stored[1]).toEqual(second)
  })

  it('trims the text it stores (TRN-01, TRN-07)', async () => {
    const { app, stored } = setup()

    await request(app).patch(path).send({ name: '  Renamed ', bowlingCenter: ' Elsewhere ' })

    expect(stored[0]).toMatchObject({ name: 'Renamed', bowlingCenter: 'Elsewhere' })
  })

  it('answers 200 and changes nothing for an empty body or the same values (TRN-24)', async () => {
    const { app, stored, captured } = setup()

    const empty = await request(app).patch(path).send({})
    const same = await request(app).patch(path).send({ name: first.name })

    expect(empty.status).toBe(200)
    expect(same.body).toEqual({ tournament: first })
    expect(stored[0]).toEqual(first)
    expect(captured.records().some((record) => record['msg'] === 'Tournament updated')).toBe(false)
  })

  it('logs who changed which fields, and not the values (TRN-24)', async () => {
    const { app, captured } = setup()

    await request(app).patch(path).send({ name: 'Secret Renamed Name', entryFee: 71.37 })

    const line = captured.records().find((record) => record['msg'] === 'Tournament updated')
    expect(line).toMatchObject({ tournamentId: first.id, fields: ['name', 'entryFee'] })
    expect(line?.['actorId']).toEqual(expect.any(String))
    expect(JSON.stringify(line)).not.toContain('Secret Renamed Name')
    expect(JSON.stringify(line)).not.toContain('71.37')
  })

  it('answers 404 for an unknown tournament', async () => {
    const response = await request(setup().app)
      .patch(`/v1/tournaments/${crypto.randomUUID()}`)
      .send({ name: 'x' })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it('answers 400 for an id that is not a UUID', async () => {
    const response = await request(setup().app).patch('/v1/tournaments/nope').send({ name: 'x' })

    expect(response.status).toBe(400)
  })

  describe('bad input (TRN-24, D-125)', () => {
    it('answers 400 with one message per field and a summary', async () => {
      const response = await request(setup().app).patch(path).send({ name: '', games: 0 })

      expect(response.status).toBe(400)
      expect(response.body).toEqual({
        message: 'Check the highlighted fields. Name is required',
        errors: { name: 'Name is required', games: 'Must have at least one game' },
      })
    })

    it('refuses a completed field (D-130)', async () => {
      const response = await request(setup().app).patch(path).send({ completed: true })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({ errors: { completed: 'This field is not accepted' } })
    })

    it('answers 400 for a body that is not JSON', async () => {
      const response = await request(setup().app)
        .patch(path)
        .set('content-type', 'application/json')
        .send('{not json')

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'The request body is not valid JSON.' })
    })

    it('answers 400 for a missing body', async () => {
      const response = await request(setup().app).patch(path)

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({ message: 'Send the tournament as a JSON object.' })
    })

    it('answers 400 when the end date would come before the start date (TRN-02)', async () => {
      const response = await request(setup().app).patch(path).send({ endDate: '2026-10-01' })

      expect(response.status).toBe(400)
      expect(response.body).toEqual({
        message: 'Check the highlighted fields. End date must be on or after start date',
        errors: { endDate: 'End date must be on or after start date' },
      })
    })
  })

  describe('refusals (TRN-25, D-128, D-130, D-129)', () => {
    it('answers 409 with errors for a locked field, and saves nothing', async () => {
      const { app, stored } = setup({ facts: { hasScores: true } })

      const response = await request(app)
        .patch(path)
        .send({ games: first.games + 1 })

      expect(response.status).toBe(409)
      expect(response.body).toEqual({
        message: 'Scores are saved, so the number of games cannot change.',
        errors: { games: 'Scores are saved, so the number of games cannot change.' },
      })
      expect(stored[0]).toEqual(first)
    })

    it('answers 409 for every field of a complete tournament', async () => {
      const response = await request(setup({ completed: true }).app)
        .patch(path)
        .send({ name: 'Renamed', bowlingCenter: 'Elsewhere' })

      expect(response.status).toBe(409)
      expect(response.body).toEqual({
        message: 'This tournament is complete. Nothing can change.',
        errors: {
          name: 'This tournament is complete. Nothing can change.',
          bowlingCenter: 'This tournament is complete. Nothing can change.',
        },
      })
    })

    it('does not let confirmWarnings override a refusal', async () => {
      const response = await request(setup({ facts: { hasScores: true } }).app)
        .patch(path)
        .send({ games: first.games + 1, confirmWarnings: true })

      expect(response.status).toBe(409)
    })

    it('does not log a refused edit as an update', async () => {
      const { app, captured } = setup({ completed: true })

      await request(app).patch(path).send({ name: 'Renamed' })

      expect(captured.records().some((record) => record['msg'] === 'Tournament updated')).toBe(
        false,
      )
    })
  })

  it('answers 409 under the name for the name and start date of another tournament (TRN-27)', async () => {
    const response = await request(setup().app)
      .patch(path)
      .send({ name: ' fall CLASSIC', startDate: second.startDate, endDate: second.endDate })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: 'A tournament with this name and start date already exists',
      errors: { name: 'A tournament with this name and start date already exists' },
    })
  })

  describe('warnings (TRN-26, D-129)', () => {
    it('answers 409 with warnings and saves nothing until confirmed', async () => {
      const { app, stored } = setup({ facts: { registrationCount: 38 } })

      const asked = await request(app).patch(path).send({ entryFee: 75 })

      expect(asked.status).toBe(409)
      expect(asked.body).toEqual({
        message: 'Confirm these changes to save them.',
        warnings: [
          {
            field: 'entryFee',
            message:
              '38 bowlers are registered. They keep what they paid. New entries pay the new fee.',
          },
        ],
      })
      expect(stored[0]).toEqual(first)
    })

    it('saves the same body once confirmWarnings is true', async () => {
      const { app, stored } = setup({ facts: { registrationCount: 38 } })

      const confirmed = await request(app).patch(path).send({ entryFee: 75, confirmWarnings: true })

      expect(confirmed.status).toBe(200)
      expect(stored[0]).toMatchObject({ entryFee: 75 })
    })
  })

  it('passes a storage outage on as 503', async () => {
    const writer: TournamentWriter = {
      ...createInMemoryTournamentWriter().writer,
      update: () => Promise.reject(new HttpError(503, 'Database unavailable')),
    }

    const response = await request(createSignedInTestApp({ tournamentWriter: writer }))
      .patch(path)
      .send({ name: 'x' })

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  it('answers 500 without the cause for an unexpected failure', async () => {
    const writer: TournamentWriter = {
      ...createInMemoryTournamentWriter().writer,
      update: (): Promise<UpdateTournamentOutcome> =>
        Promise.reject(new Error('db password is hunter2')),
    }

    const response = await request(createSignedInTestApp({ tournamentWriter: writer }))
      .patch(path)
      .send({ name: 'x' })

    expect(response.status).toBe(500)
    expect(JSON.stringify(response.body)).not.toContain('hunter2')
  })

  describe('who may call it (TRN-24, D-96, D-97)', () => {
    it('answers 401 when signed out, before it reads the body', async () => {
      const response = await request(createTestApp()).patch(path).send({})

      expect(response.status).toBe(401)
    })

    it('answers 403 to the API key', async () => {
      const response = await request(createTestApp())
        .patch(path)
        .set(apiKeyHeader, testApiKey)
        .send({ name: 'x' })

      expect(response.status).toBe(403)
    })

    it('answers 403 to a score keeper', async () => {
      const response = await request(createSignedInTestApp({}, 'scoreKeeper'))
        .patch(path)
        .send({ name: 'x' })

      expect(response.status).toBe(403)
    })

    it.each(['director', 'admin'] as const)('lets a %s edit', async (role) => {
      const { writer } = createInMemoryTournamentWriter([{ ...first }])
      const response = await request(createSignedInTestApp({ tournamentWriter: writer }, role))
        .patch(path)
        .send({ name: 'Renamed' })

      expect(response.status).toBe(200)
    })

    it('leaves GET on the same path public (D-09)', async () => {
      const response = await request(createTestApp()).get(path)

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ message: 'Tournament not found' })
    })
  })
})
