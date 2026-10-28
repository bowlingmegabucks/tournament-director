import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { HttpError } from '../../shared/errors.ts'
import { createSweeper, createTournament } from '../../test/factories.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createInMemorySweeperRepository } from './repository.ts'
import { sweeperListSchema } from './types.ts'

function setup() {
  const tournament = createTournament()
  const other = createTournament()
  const sweepers = [
    createSweeper({
      date: '2026-10-24T13:00:00',
      entryFee: 30,
      bonusPins: [
        {
          divisionId: '0b7e1c2a-4d5f-4a60-8b91-aaaaaaaaaaa1',
          divisionName: 'Open',
          bonusPinsPerGame: 10,
        },
      ],
    }),
    createSweeper({ date: '2026-10-24T09:00:00', complete: true }),
  ]
  const app = createTestApp({
    tournaments: createInMemoryTournamentRepository([tournament, other]),
    sweepers: createInMemorySweeperRepository([
      ...sweepers.map((sweeper) => ({ tournamentId: tournament.id, sweeper })),
      { tournamentId: other.id, sweeper: createSweeper() },
    ]),
  })
  return { app, tournament, sweepers }
}

describe('GET /v1/tournaments/:id/sweepers', () => {
  it("lists the tournament's sweepers with every field and the bonus pins, sorted by date (SQD-22, DIV-14, SQD-20)", async () => {
    const { app, tournament, sweepers } = setup()

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/sweepers`)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    const [afternoon, morning] = sweepers
    expect(response.body).toEqual({ sweepers: [morning, afternoon] })
    expect(sweeperListSchema.safeParse(response.body).success).toBe(true)
  })

  it('returns an empty list for a tournament with no sweepers (SQD-22)', async () => {
    const tournament = createTournament()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
    })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/sweepers`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ sweepers: [] })
  })

  it('returns 404 for an unknown tournament (SQD-22, D-44)', async () => {
    const response = await request(createTestApp()).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/sweepers',
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it('returns 400 when the id is not a UUID (SQD-22, D-44)', async () => {
    const response = await request(createTestApp()).get('/v1/tournaments/not-a-uuid/sweepers')

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/^Invalid request\. id:/)
  })

  it('answers 503 when the database is down (D-32, D-44)', async () => {
    const { tournament } = setup()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      sweepers: {
        listByTournament: () => Promise.reject(new HttpError(503, 'Database unavailable')),
      },
    })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/sweepers`)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  it('answers 500 when the tournament row breaks its shape (D-44)', async () => {
    const app = createTestApp({
      tournaments: {
        list: () => Promise.resolve([]),
        get: () => Promise.reject(new Error('Stored tournament x breaks the vendor shape')),
      },
    })

    const response = await request(app).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/sweepers',
    )

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error' })
  })
})
