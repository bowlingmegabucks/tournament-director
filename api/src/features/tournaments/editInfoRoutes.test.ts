import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { createTournament, testApiKey } from '../../test/factories.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { editInfoSchema } from './types.ts'
import { createInMemoryTournamentRepository } from './repository.ts'

const info = { registrationCount: 38, hasScores: true, hasSweeperScores: false }

function appWith(role: 'director' | 'admin' | 'scoreKeeper' = 'director') {
  const tournament = createTournament()
  const tournaments = createInMemoryTournamentRepository(
    [tournament],
    {},
    {},
    { [tournament.id]: info },
  )
  return { tournament, app: createSignedInTestApp({ tournaments }, role) }
}

describe('GET /v1/tournaments/:id/edit-info (TRN-28, D-131)', () => {
  it('returns the registration count and whether scores exist', async () => {
    const { tournament, app } = appWith()

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/edit-info`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ editInfo: info })
    expect(
      editInfoSchema.safeParse((response.body as { editInfo: unknown }).editInfo).success,
    ).toBe(true)
  })

  it('reports nothing for a tournament with no registrations or scores', async () => {
    const tournament = createTournament()
    const app = createSignedInTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
    })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/edit-info`)

    expect(response.body).toEqual({
      editInfo: { registrationCount: 0, hasScores: false, hasSweeperScores: false },
    })
  })

  it('answers 404 for an unknown tournament', async () => {
    const response = await request(createSignedInTestApp()).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/edit-info',
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it('answers 400 for an id that is not a UUID', async () => {
    const response = await request(createSignedInTestApp()).get('/v1/tournaments/nope/edit-info')

    expect(response.status).toBe(400)
  })

  it('answers 503 while the database is down', async () => {
    const tournaments = {
      ...createInMemoryTournamentRepository([]),
      getEditInfo: () => Promise.reject(new HttpError(503, 'Database unavailable')),
    }
    const response = await request(createSignedInTestApp({ tournaments })).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/edit-info',
    )

    expect(response.status).toBe(503)
  })

  describe('who may call it (D-96, D-105)', () => {
    it('answers 401 when signed out', async () => {
      const { tournament } = appWith()
      const response = await request(createTestApp()).get(
        `/v1/tournaments/${tournament.id}/edit-info`,
      )

      expect(response.status).toBe(401)
    })

    it('answers 403 to the API key', async () => {
      const { tournament } = appWith()
      const response = await request(createTestApp())
        .get(`/v1/tournaments/${tournament.id}/edit-info`)
        .set(apiKeyHeader, testApiKey)

      expect(response.status).toBe(403)
    })

    it('answers 403 to a score keeper', async () => {
      const { tournament, app } = appWith('scoreKeeper')
      const response = await request(app).get(`/v1/tournaments/${tournament.id}/edit-info`)

      expect(response.status).toBe(403)
    })

    it.each(['director', 'admin'] as const)('lets a %s read it', async (role) => {
      const { tournament, app } = appWith(role)
      const response = await request(app).get(`/v1/tournaments/${tournament.id}/edit-info`)

      expect(response.status).toBe(200)
    })
  })
})
