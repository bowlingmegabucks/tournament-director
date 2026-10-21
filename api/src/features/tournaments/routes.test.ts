import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createInMemoryTournamentRepository } from './repository.ts'
import { tournamentDetailSchema, tournamentListSchema } from './types.ts'
import { createTournament } from '../../test/factories.ts'
import { createTestApp } from '../../test/testApp.ts'

describe('GET /v1/tournaments', () => {
  it('returns every tournament in the vendor shape (TRN-11)', async () => {
    const tournament = createTournament({
      name: 'Spring Open',
      startDate: '2025-10-10',
      endDate: '2025-10-12',
      entryFee: 50,
      bowlingCenter: 'Spare Time Lanes',
    })
    const app = createTestApp({ tournaments: createInMemoryTournamentRepository([tournament]) })

    const response = await request(app).get('/v1/tournaments')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(response.body).toEqual({ tournaments: [tournament] })
  })

  it('returns an empty list when there are none (TRN-11)', async () => {
    const response = await request(createTestApp()).get('/v1/tournaments')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ tournaments: [] })
  })

  it('applies no filter or sort (TRN-11)', async () => {
    const past = createTournament({ startDate: '2020-01-01', endDate: '2020-01-03' })
    const future = createTournament({ startDate: '2099-01-01', endDate: '2099-01-03' })
    const middle = createTournament({ startDate: '2030-01-01', endDate: '2030-01-03' })
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([middle, future, past]),
    })

    const response = await request(app).get('/v1/tournaments')

    expect(response.body).toEqual({ tournaments: [middle, future, past] })
  })

  it('returns a body the web client accepts (TRN-11)', async () => {
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([createTournament()]),
    })

    const response = await request(app).get('/v1/tournaments')

    expect(tournamentListSchema.safeParse(response.body).success).toBe(true)
  })
})

describe('GET /v1/tournaments/:id', () => {
  it('returns one tournament (TRN-15)', async () => {
    const tournament = createTournament()
    const other = createTournament()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([other, tournament]),
    })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ tournament })
    expect(tournamentDetailSchema.safeParse(response.body).success).toBe(true)
  })

  it('returns 404 for an unknown id (TRN-15)', async () => {
    const response = await request(createTestApp()).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01',
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it('returns 400 when the id is not a UUID (TRN-15)', async () => {
    const response = await request(createTestApp()).get('/v1/tournaments/not-a-uuid')

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/^Invalid request\. id:/)
  })
})
