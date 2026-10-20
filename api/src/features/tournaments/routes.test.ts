import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createInMemoryTournamentRepository } from './repository.ts'
import { tournamentSchema } from './types.ts'
import { createTournament } from '../../test/factories.ts'
import { createTestApp } from '../../test/testApp.ts'

describe('GET /tournaments', () => {
  it('returns the tournaments as JSON', async () => {
    const tournament = createTournament({ name: 'Spring Open', entrants: 42 })
    const app = createTestApp({ tournaments: createInMemoryTournamentRepository([tournament]) })

    const response = await request(app).get('/tournaments')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(response.body).toEqual([tournament])
  })

  it('returns an empty array when there are none', async () => {
    const response = await request(createTestApp()).get('/tournaments')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('returns items the web client accepts', async () => {
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([createTournament()]),
    })

    const response = await request(app).get('/tournaments')

    expect(tournamentSchema.array().safeParse(response.body).success).toBe(true)
  })
})
