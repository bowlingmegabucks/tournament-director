import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { HttpError } from '../../shared/errors.ts'
import { createSquad, createTournament } from '../../test/factories.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createInMemorySquadRepository } from './repository.ts'
import { squadListSchema } from './types.ts'

function setup() {
  const tournament = createTournament()
  const other = createTournament()
  const squads = [
    createSquad({ date: '2026-10-24T13:00:00', entryFee: 60, entryFeeOverridden: true }),
    createSquad({ date: '2026-10-24T09:00:00', complete: true }),
  ]
  const app = createTestApp({
    tournaments: createInMemoryTournamentRepository([tournament, other]),
    squads: createInMemorySquadRepository([
      ...squads.map((squad) => ({ tournamentId: tournament.id, squad })),
      { tournamentId: other.id, squad: createSquad() },
    ]),
  })
  return { app, tournament, squads }
}

describe('GET /v1/tournaments/:id/squads', () => {
  it("lists the tournament's squads with every field, sorted by date (SQD-21, SQD-20)", async () => {
    const { app, tournament, squads } = setup()

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/squads`)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    const [afternoon, morning] = squads
    expect(response.body).toEqual({ squads: [morning, afternoon] })
    expect(squadListSchema.safeParse(response.body).success).toBe(true)
  })

  it('returns an empty list for a tournament with no squads (SQD-21)', async () => {
    const tournament = createTournament()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
    })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/squads`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ squads: [] })
  })

  it('returns 404 for an unknown tournament (SQD-21, D-44)', async () => {
    const response = await request(createTestApp()).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/squads',
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it('returns 400 when the id is not a UUID (SQD-21, D-44)', async () => {
    const response = await request(createTestApp()).get('/v1/tournaments/not-a-uuid/squads')

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/^Invalid request\. id:/)
  })

  it('answers 503 when the database is down (D-32, D-44)', async () => {
    const { tournament } = setup()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      squads: {
        listByTournament: () => Promise.reject(new HttpError(503, 'Database unavailable')),
      },
    })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/squads`)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  it('answers 500 when the tournament row breaks its shape (D-44)', async () => {
    const app = createTestApp({
      tournaments: {
        list: () => Promise.resolve([]),
        get: () => Promise.reject(new Error('Stored tournament x breaks the vendor shape')),
        getRatios: () => Promise.reject(new Error('Stored tournament x breaks the vendor shape')),
      },
    })

    const response = await request(app).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/squads',
    )

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error' })
  })
})
