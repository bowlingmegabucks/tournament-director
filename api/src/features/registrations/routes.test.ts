import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { HttpError } from '../../shared/errors.ts'
import {
  createDivision,
  createRegistration,
  createSquad,
  createSweeper,
  createTournament,
} from '../../test/factories.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createInMemoryRegistrationRepository } from './repository.ts'
import { registrationListSchema } from './types.ts'

function setup() {
  const tournament = createTournament()
  const division = createDivision({ name: 'Open', number: 1 })
  const idle = createSquad({ date: '2026-10-24T17:00:00' })
  const squad = createSquad({ date: '2026-10-24T09:00:00' })
  const sweeper = createSweeper()
  const base = createRegistration()
  const registrations = [
    createRegistration({
      divisionId: division.id,
      divisionName: 'Open',
      superSweeper: true,
      squadIds: [squad.id],
      sweeperIds: [sweeper.id],
      bowler: { ...base.bowler, firstName: 'Zed', lastName: 'Adams', name: 'Zed Adams' },
    }),
    createRegistration({
      divisionId: division.id,
      bowler: {
        ...base.bowler,
        firstName: 'Amy',
        lastName: 'Adams',
        name: 'Amy Adams',
        usbcId: '',
      },
    }),
  ]
  const app = createTestApp({
    tournaments: createInMemoryTournamentRepository([tournament, createTournament()]),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division }]),
    squads: createInMemorySquadRepository(
      [squad, idle].map((entry) => ({ tournamentId: tournament.id, squad: entry })),
    ),
    sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
    registrations: createInMemoryRegistrationRepository(
      registrations.map((registration) => ({ tournamentId: tournament.id, registration })),
    ),
  })
  return { app, tournament, division, squad, idle, sweeper, registrations }
}

describe('GET /v1/tournaments/:id/registrations', () => {
  it('lists registrations with counts, sorted by name (REG-23, REG-26)', async () => {
    const { app, tournament, division } = setup()

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/registrations`)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(registrationListSchema.safeParse(response.body).success).toBe(true)
    expect(
      response.body.registrations.map((r: { bowler: { name: string } }) => r.bowler.name),
    ).toEqual(['Amy Adams', 'Zed Adams'])
    expect(response.body.registrations[1]).toMatchObject({
      divisionId: division.id,
      divisionName: 'Open',
      squads: 1,
      sweepers: 1,
      superSweeper: true,
    })
    expect(response.body.registrations[0]).toMatchObject({ squads: 0, sweepers: 0 })
  })

  it('does not send the id lists behind the counts (REG-26)', async () => {
    const { app, tournament } = setup()

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/registrations`)

    expect(response.body.registrations[0]).not.toHaveProperty('squadIds')
    expect(response.body.registrations[0]).not.toHaveProperty('sweeperIds')
  })

  it('sends the whole-tournament summary (REG-24, D-50)', async () => {
    const { app, tournament, division, squad, idle, sweeper } = setup()

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/registrations`)

    expect(response.body.summary).toEqual({
      registrations: 2,
      superSweepers: 1,
      divisions: [{ id: division.id, number: 1, name: 'Open', entries: 1 }],
      squads: [
        { id: squad.id, date: squad.date, entries: 1 },
        { id: idle.id, date: idle.date, entries: 0 },
      ],
      sweepers: [{ id: sweeper.id, date: sweeper.date, entries: 1 }],
    })
  })

  it('sends no personal data beyond the name and USBC ID (BWL-17)', async () => {
    const { app, tournament } = setup()

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/registrations`)

    expect(Object.keys(response.body.registrations[0].bowler).sort()).toEqual([
      'firstName',
      'id',
      'lastName',
      'name',
      'usbcId',
    ])
    expect(JSON.stringify(response.body)).not.toMatch(
      /socialSecurity|gender|dateOfBirth|email|phone|address|payment/i,
    )
  })

  it('returns empty lists for a tournament with no registrations (REG-26)', async () => {
    const tournament = createTournament()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
    })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/registrations`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      registrations: [],
      summary: { registrations: 0, superSweepers: 0, divisions: [], squads: [], sweepers: [] },
    })
  })

  it('returns 404 for an unknown tournament (REG-26)', async () => {
    const response = await request(createTestApp()).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/registrations',
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it('returns 400 when the id is not a UUID (REG-26)', async () => {
    const response = await request(createTestApp()).get('/v1/tournaments/not-a-uuid/registrations')

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/^Invalid request\. id:/)
  })

  it('answers 503 when the database is down (REG-26, D-32)', async () => {
    const { tournament } = setup()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      registrations: {
        listByTournament: () => Promise.reject(new HttpError(503, 'Database unavailable')),
      },
    })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/registrations`)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  it('answers 500 when the tournament row breaks its shape (REG-26)', async () => {
    const app = createTestApp({
      tournaments: {
        list: () => Promise.resolve([]),
        get: () => Promise.reject(new Error('Stored tournament x breaks the vendor shape')),
      },
    })

    const response = await request(app).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/registrations',
    )

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error' })
  })
})
