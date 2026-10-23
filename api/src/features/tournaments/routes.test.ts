import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { HttpError } from '../../shared/errors.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemoryTournamentRepository } from './repository.ts'
import { tournamentDetailSchema, tournamentListSchema } from './types.ts'
import { createDivision, createTournament } from '../../test/factories.ts'
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
    expect(response.body).toEqual({ tournament: { ...tournament, divisions: [] } })
    expect(tournamentDetailSchema.safeParse(response.body).success).toBe(true)
  })

  it('lists the tournament divisions in the vendor shape and no more (DIV-12, D-37)', async () => {
    const tournament = createTournament()
    const second = createDivision({ number: 2, name: 'Women', gender: 'Female', handicapBase: 220 })
    const first = createDivision({ number: 1, name: 'Open', maximumAverage: 200 })
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      divisions: createInMemoryDivisionRepository([
        { tournamentId: tournament.id, division: second },
        { tournamentId: tournament.id, division: first },
        { tournamentId: createTournament().id, division: createDivision() },
      ]),
    })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}`)

    expect(response.body.tournament.divisions).toEqual([
      {
        id: first.id,
        name: 'Open',
        minimumAge: null,
        maximumAge: null,
        minimumAverage: null,
        maximumAverage: 200,
        gender: null,
      },
      {
        id: second.id,
        name: 'Women',
        minimumAge: null,
        maximumAge: null,
        minimumAverage: null,
        maximumAverage: null,
        gender: 'Female',
      },
    ])
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

describe('when storage fails', () => {
  const database = { code: 503, message: 'Database unavailable' }

  function failingRepository(error: Error) {
    return {
      list: () => Promise.reject(error),
      get: () => Promise.reject(error),
    }
  }

  it.each(['/v1/tournaments', '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01'])(
    'GET %s answers 503 when the database is down (D-32)',
    async (path) => {
      const app = createTestApp({
        tournaments: failingRepository(new HttpError(database.code, database.message)),
      })

      const response = await request(app).get(path)

      expect(response.status).toBe(503)
      expect(response.body).toEqual({ message: 'Database unavailable' })
    },
  )

  it('answers 500 for a stored row that breaks the vendor shape, without the cause (D-31)', async () => {
    const app = createTestApp({
      tournaments: failingRepository(new Error('Stored tournament x breaks the vendor shape')),
    })

    const response = await request(app).get('/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error' })
  })
})
