import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { createNewTournament, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { completeMessage, paidMessage, scoresMessage, type DeleteFacts } from './deletePlan.ts'
import {
  createInMemoryTournamentWriter,
  type DeleteTournamentOutcome,
  type TournamentWriter,
} from './writer.ts'

const first = { id: crypto.randomUUID(), ...createNewTournament({ name: 'Spring Classic' }) }
const second = {
  id: crypto.randomUUID(),
  ...createNewTournament({ name: 'Fall Classic', startDate: '2027-10-01', endDate: '2027-10-03' }),
}
const path = `/v1/tournaments/${first.id}`

function setup(options: { facts?: Partial<DeleteFacts>; completed?: boolean } = {}) {
  const captured = createCapturedLogger()
  const { writer, stored, deleted } = createInMemoryTournamentWriter(
    [{ ...first }, { ...second }],
    {
      deleteFacts: { [first.id]: options.facts ?? {} },
      completed: options.completed ? [first.id] : [],
    },
  )
  const app = createSignedInTestApp({ tournamentWriter: writer, logger: captured.logger }, 'admin')
  return { app, stored, deleted, captured }
}

describe('DELETE /v1/tournaments/:id', () => {
  it('deletes the tournament and answers 204 with no body (TRN-32)', async () => {
    const { app, stored } = setup()

    const response = await request(app).delete(path)

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(stored).toEqual([second])
  })

  it('logs who deleted which tournament, in counts and not names (TRN-32)', async () => {
    const { app, captured } = setup({ facts: { divisions: 4, squads: 3, sweepers: 1 } })

    await request(app).delete(path)

    const line = captured.records().find((record) => record['msg'] === 'Tournament deleted')
    expect(line).toMatchObject({
      tournamentId: first.id,
      registrations: 0,
      divisions: 4,
      squads: 3,
      sweepers: 1,
    })
    expect(line?.['actorId']).toEqual(expect.any(String))
    expect(JSON.stringify(line)).not.toContain('Spring Classic')
  })

  it('answers 404 for an unknown tournament (TRN-32)', async () => {
    const response = await request(setup().app).delete(`/v1/tournaments/${crypto.randomUUID()}`)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it('answers 400 for an id that is not a UUID (TRN-32)', async () => {
    const response = await request(setup().app).delete('/v1/tournaments/not-a-uuid')

    expect(response.status).toBe(400)
  })

  it.each(['1', 'yes', 'false', ''])(
    'answers 400 for confirmWarnings=%s: only "true" confirms (TRN-32)',
    async (value) => {
      const { app, stored } = setup()

      const response = await request(app).delete(`${path}?confirmWarnings=${value}`)

      expect(response.status).toBe(400)
      expect(stored).toHaveLength(2)
    },
  )

  describe('refusals (TRN-33, D-133)', () => {
    it('answers 409 with errors for a complete tournament, and deletes nothing', async () => {
      const { app, stored } = setup({ completed: true })

      const response = await request(app).delete(path)

      expect(response.status).toBe(409)
      expect(response.body).toEqual({
        message: completeMessage,
        errors: { tournament: completeMessage },
      })
      expect(stored).toHaveLength(2)
    })

    it('answers 409 for a tournament with scores', async () => {
      const response = await request(setup({ facts: { hasScores: true } }).app).delete(path)

      expect(response.status).toBe(409)
      expect(response.body).toEqual({
        message: scoresMessage,
        errors: { tournament: scoresMessage },
      })
    })

    it('names how many bowlers paid', async () => {
      const response = await request(
        setup({ facts: { paidRegistrations: 3, registrations: 5 } }).app,
      ).delete(path)

      expect(response.status).toBe(409)
      expect(response.body).toEqual({
        message: '3 bowlers paid online. Remove their registrations first.',
        errors: { tournament: paidMessage(3) },
      })
    })

    it('gives the first reason as the message and every reason under errors', async () => {
      const response = await request(
        setup({ completed: true, facts: { hasScores: true, paidRegistrations: 1 } }).app,
      ).delete(path)

      expect(response.body).toEqual({
        message: completeMessage,
        errors: { tournament: [completeMessage, scoresMessage, paidMessage(1)].join('\n') },
      })
    })

    it('does not let confirmWarnings override a refusal', async () => {
      const { app, stored } = setup({ facts: { hasScores: true } })

      const response = await request(app).delete(`${path}?confirmWarnings=true`)

      expect(response.status).toBe(409)
      expect(stored).toHaveLength(2)
    })

    it('logs a refused delete as a warning with the reason count and no names', async () => {
      const { app, captured } = setup({ facts: { hasScores: true, paidRegistrations: 1 } })

      await request(app).delete(path)

      const record = captured
        .records()
        .find((entry) => entry['msg'] === 'Tournament delete refused')
      expect(record).toMatchObject({ level: 40, tournamentId: first.id, reasons: 2 })
      expect(JSON.stringify(record)).not.toContain('Spring Classic')
    })

    it('does not log a refused delete as a delete', async () => {
      const { app, captured } = setup({ facts: { hasScores: true } })

      await request(app).delete(path)

      expect(captured.records().some((record) => record['msg'] === 'Tournament deleted')).toBe(
        false,
      )
    })
  })

  describe('the registrations warning (TRN-34, D-134)', () => {
    const facts = { registrations: 12, divisions: 4, squads: 3, sweepers: 1 }

    it('answers 409 with warnings and deletes nothing until confirmed', async () => {
      const { app, stored, captured } = setup({ facts })

      const response = await request(app).delete(path)

      expect(response.status).toBe(409)
      expect(response.body).toEqual({
        message: 'Confirm to delete this tournament.',
        warnings: [
          {
            field: 'tournament',
            message:
              '12 registrations, 4 divisions, 3 squads, and 1 sweeper will be deleted, with their lane assignments and payment records. The bowlers stay.',
          },
        ],
      })
      expect(stored).toHaveLength(2)
      expect(captured.records().some((record) => record['msg'] === 'Tournament deleted')).toBe(
        false,
      )
    })

    it('deletes once confirmWarnings=true', async () => {
      const { app, stored } = setup({ facts })

      const response = await request(app).delete(`${path}?confirmWarnings=true`)

      expect(response.status).toBe(204)
      expect(stored).toEqual([second])
    })
  })

  it('passes a storage outage on as 503', async () => {
    const writer: TournamentWriter = {
      ...createInMemoryTournamentWriter().writer,
      remove: () => Promise.reject(new HttpError(503, 'Database unavailable')),
    }

    const response = await request(
      createSignedInTestApp({ tournamentWriter: writer }, 'admin'),
    ).delete(path)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  it('answers 500 without the cause for an unexpected failure', async () => {
    const writer: TournamentWriter = {
      ...createInMemoryTournamentWriter().writer,
      remove: (): Promise<DeleteTournamentOutcome> =>
        Promise.reject(new Error('db password is hunter2')),
    }

    const response = await request(
      createSignedInTestApp({ tournamentWriter: writer }, 'admin'),
    ).delete(path)

    expect(response.status).toBe(500)
    expect(JSON.stringify(response.body)).not.toContain('hunter2')
  })

  describe('who may call it (TRN-32, D-96, D-97, D-132)', () => {
    it('answers 401 when signed out', async () => {
      const response = await request(createTestApp()).delete(path)

      expect(response.status).toBe(401)
    })

    it('answers 403 to the API key', async () => {
      const response = await request(createTestApp()).delete(path).set(apiKeyHeader, testApiKey)

      expect(response.status).toBe(403)
    })

    it.each(['scoreKeeper', 'director'] as const)('answers 403 to a %s', async (role) => {
      const { writer, stored } = createInMemoryTournamentWriter([{ ...first }])

      const response = await request(
        createSignedInTestApp({ tournamentWriter: writer }, role),
      ).delete(path)

      expect(response.status).toBe(403)
      expect(stored).toHaveLength(1)
    })

    it('lets an admin delete', async () => {
      const { writer } = createInMemoryTournamentWriter([{ ...first }])

      const response = await request(
        createSignedInTestApp({ tournamentWriter: writer }, 'admin'),
      ).delete(path)

      expect(response.status).toBe(204)
    })

    it('leaves GET on the same path public (D-09)', async () => {
      const response = await request(createTestApp()).get(path)

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ message: 'Tournament not found' })
    })
  })
})
