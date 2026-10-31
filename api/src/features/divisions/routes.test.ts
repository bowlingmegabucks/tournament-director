import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { HttpError } from '../../shared/errors.ts'
import { createDivision, createTournament } from '../../test/factories.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createInMemoryDivisionRepository } from './repository.ts'
import { divisionListSchema } from './types.ts'

function setup() {
  const tournament = createTournament()
  const other = createTournament()
  const divisions = [
    createDivision({ number: 2, name: 'Women', gender: 'Female', handicapPercentage: 90 }),
    createDivision({ number: 1, name: 'Open' }),
  ]
  const app = createTestApp({
    tournaments: createInMemoryTournamentRepository([tournament, other]),
    divisions: createInMemoryDivisionRepository([
      ...divisions.map((division) => ({ tournamentId: tournament.id, division })),
      { tournamentId: other.id, division: createDivision() },
    ]),
  })
  return { app, tournament, other, divisions }
}

describe('GET /v1/tournaments/:id/divisions', () => {
  it("lists the tournament's divisions with every field, sorted by number (DIV-12, DIV-13)", async () => {
    const { app, tournament, divisions } = setup()

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/divisions`)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    const [women, open] = divisions
    expect(response.body).toEqual({ divisions: [open, women] })
    expect(divisionListSchema.safeParse(response.body).success).toBe(true)
  })

  it('returns an empty list for a tournament with no divisions (DIV-12)', async () => {
    const tournament = createTournament()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
    })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/divisions`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ divisions: [] })
  })

  it('returns 404 for an unknown tournament (DIV-12, D-40)', async () => {
    const response = await request(createTestApp()).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/divisions',
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it('returns 400 when the id is not a UUID (DIV-12, D-40)', async () => {
    const response = await request(createTestApp()).get('/v1/tournaments/not-a-uuid/divisions')

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/^Invalid request\. id:/)
  })

  it('answers 503 when the database is down (D-32, D-40)', async () => {
    const { tournament } = setup()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      divisions: {
        listByTournament: () => Promise.reject(new HttpError(503, 'Database unavailable')),
      },
    })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/divisions`)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  it('answers 500 when the tournament row breaks its shape (D-40)', async () => {
    const app = createTestApp({
      tournaments: {
        list: () => Promise.resolve([]),
        get: () => Promise.reject(new Error('Stored tournament x breaks the vendor shape')),
        getRatios: () => Promise.reject(new Error('Stored tournament x breaks the vendor shape')),
      },
    })

    const response = await request(app).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/divisions',
    )

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error' })
  })
})
