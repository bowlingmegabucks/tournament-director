import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { HttpError } from '../../shared/errors.ts'
import {
  createDivision,
  createLaneEntry,
  createSquad,
  createSweeper,
  createTournament,
} from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemoryLaneRepository } from '../lanes/repository.ts'
import { createInMemoryScoreRepository } from '../scores/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import type { TournamentRatios } from '../tournaments/types.ts'
import { createFinalsRouter } from './routes.ts'
import { atLargeResultsSchema, seedingResultsSchema, superSweeperResultsSchema } from './types.ts'

function setup(ratios: TournamentRatios = { finalsRatio: 2, superSweeperCashRatio: 2 }) {
  const tournament = createTournament()
  const open = createDivision({ number: 1, name: 'Open' })
  const squad = createSquad({ finalsRatio: 6, cashRatio: 100, games: 3, complete: true })
  const sweeper = createSweeper({ games: 3, complete: true, cashRatio: 2 })
  const bowlers = ['Adams', 'Baker', 'Clark', 'Davis', 'Evans', 'Ford'].map((lastName) =>
    createLaneEntry({ divisionId: open.id, lastName, average: null, superSweeper: true }),
  )
  const totals = [250, 200, 190, 180, 170, 160]
  const captured = createCapturedLogger()
  const app = createTestApp({
    logger: captured.logger,
    tournaments: createInMemoryTournamentRepository([tournament], { [tournament.id]: ratios }),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division: open }]),
    squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
    sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
    lanes: createInMemoryLaneRepository(
      bowlers.flatMap((entry) => [
        { sessionId: squad.id, entry },
        { sessionId: sweeper.id, entry },
      ]),
    ),
    scores: createInMemoryScoreRepository(
      bowlers.flatMap((entry, index) =>
        [squad.id, sweeper.id].flatMap((sessionId) =>
          [1, 2, 3].map((game) => ({
            sessionId,
            score: { bowlerId: entry.bowlerId, game, score: totals[index] ?? 0 },
          })),
        ),
      ),
    ),
  })
  return { app, tournament, squad, sweeper, bowlers }
}

describe('GET /v1/tournaments/:id/at-large', () => {
  it('returns the at-large advancers by division, public and as JSON (RES-37)', async () => {
    const { app, tournament, bowlers } = setup()

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/at-large`)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(atLargeResultsSchema.safeParse(response.body).success).toBe(true)
    expect(response.body).toMatchObject({ complete: true, finalsRatio: 2 })
    // Six entries at ratio 2 make 3 spots; the squad advances 1, so 2 are open.
    expect(response.body.divisions[0]).toMatchObject({
      name: 'Open',
      entries: 6,
      totalSpots: 3,
      squadAdvancers: 1,
      atLargeSpots: 2,
    })
    expect(
      response.body.divisions[0].rows.map((row: { registrationId: string }) => row.registrationId),
    ).toEqual([bowlers[1]?.registrationId, bowlers[2]?.registrationId])
  })

  it('sends only the fields the page needs, no personal data (BWL-17)', async () => {
    const { app, tournament } = setup()

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/at-large`)

    expect(Object.keys(response.body).toSorted()).toEqual(['complete', 'divisions', 'finalsRatio'])
    expect(Object.keys(response.body.divisions[0].rows[0]).toSorted()).toEqual(
      [
        'highGame',
        'name',
        'place',
        'previousCasher',
        'registrationId',
        'squadDate',
        'ties',
        'total',
      ].toSorted(),
    )
  })

  it('returns 422 for a tournament finals ratio of 0 (D-93)', async () => {
    const { app, tournament } = setup({ finalsRatio: 0, superSweeperCashRatio: 2 })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/at-large`)

    expect(response.status).toBe(422)
    expect(response.body).toEqual({
      message:
        "This tournament's finals ratio is 0, so results cannot be worked out. Set a ratio of 1 or more.",
    })
  })
})

describe('GET /v1/tournaments/:id/seeding', () => {
  it('returns the seeds by division (RES-37)', async () => {
    const { app, tournament } = setup()

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/seeding`)

    expect(response.status).toBe(200)
    expect(seedingResultsSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.divisions[0]).toMatchObject({ finalists: 3, atLarge: 2 })
    expect(response.body.divisions[0].rows.map((row: { seed: number }) => row.seed)).toEqual([
      1, 2, 3, 4, 5, 6,
    ])
    expect(Object.keys(response.body.divisions[0].rows[0]).toSorted()).toEqual(
      [
        'group',
        'handicap',
        'highGame',
        'name',
        'previousCasher',
        'registrationId',
        'seed',
        'squadDate',
        'ties',
        'total',
      ].toSorted(),
    )
  })
})

describe('GET /v1/tournaments/:id/super-sweeper', () => {
  it('returns the combined sweeper results (RES-37)', async () => {
    const { app, tournament, sweeper } = setup()

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/super-sweeper`)

    expect(response.status).toBe(200)
    expect(superSweeperResultsSchema.safeParse(response.body).success).toBe(true)
    expect(response.body).toMatchObject({ complete: true, cashRatio: 2, entries: 6, cashers: 3 })
    expect(response.body.sweepers).toEqual([
      { id: sweeper.id, date: sweeper.date, games: 3, complete: true },
    ])
    expect(response.body.rows[0]).toMatchObject({
      place: 1,
      group: 'casher',
      total: 750,
      sweeperTotals: [750],
      flags: [],
    })
    expect(Object.keys(response.body.rows[0]).toSorted()).toEqual(
      [
        'divisionName',
        'flags',
        'games',
        'group',
        'highGame',
        'name',
        'place',
        'registrationId',
        'sweeperTotals',
        'ties',
        'total',
      ].toSorted(),
    )
  })

  it('returns 422 for the legacy cash ratio of 0 (SS-10, D-17)', async () => {
    const { app, tournament } = setup({ finalsRatio: 2, superSweeperCashRatio: 0 })

    const response = await request(app).get(`/v1/tournaments/${tournament.id}/super-sweeper`)

    expect(response.status).toBe(422)
    expect(response.body.message).toMatch(/super sweeper cash ratio is 0/)
  })
})

describe.each(['at-large', 'seeding', 'super-sweeper'])(
  'GET /v1/tournaments/:id/%s errors',
  (kind) => {
    it('returns 404 for an unknown tournament', async () => {
      const response = await request(createTestApp()).get(
        `/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/${kind}`,
      )

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ message: 'Tournament not found' })
    })

    it('returns 400 when the id is not a UUID', async () => {
      const response = await request(createTestApp()).get(`/v1/tournaments/not-a-uuid/${kind}`)

      expect(response.status).toBe(400)
      expect(response.body.message).toMatch(/^Invalid request\./)
    })

    it('answers 503 when the database is down (D-32)', async () => {
      const tournament = createTournament()
      const app = createTestApp({
        tournaments: createInMemoryTournamentRepository([tournament]),
        squads: createInMemorySquadRepository([
          { tournamentId: tournament.id, squad: createSquad() },
        ]),
        sweepers: createInMemorySweeperRepository([
          { tournamentId: tournament.id, sweeper: createSweeper() },
        ]),
        lanes: {
          listEntries: () => Promise.reject(new HttpError(503, 'Database unavailable')),
        },
      })

      const response = await request(app).get(`/v1/tournaments/${tournament.id}/${kind}`)

      expect(response.status).toBe(503)
      expect(response.body).toEqual({ message: 'Database unavailable' })
    })
  },
)

describe('finals cache', () => {
  function countingRouter(cacheMs: number) {
    const tournament = createTournament()
    const inner = createInMemoryTournamentRepository([tournament], {
      [tournament.id]: { finalsRatio: 2, superSweeperCashRatio: 2 },
    })
    let calls = 0
    const tournaments = {
      ...inner,
      getRatios: (id: string) => {
        calls++
        return inner.getRatios(id)
      },
    }
    const router = createFinalsRouter(
      'at-large',
      {
        tournaments,
        divisions: createInMemoryDivisionRepository([]),
        squads: createInMemorySquadRepository([]),
        sweepers: createInMemorySweeperRepository([]),
        lanes: createInMemoryLaneRepository([]),
        scores: createInMemoryScoreRepository([]),
        logger: createCapturedLogger().logger,
      },
      cacheMs,
    )
    const app = express().use('/:id', router)
    return { app, tournament, calls: () => calls }
  }

  it('answers a second poll in the window without reading again', async () => {
    const { app, tournament, calls } = countingRouter(60_000)
    await request(app).get(`/${tournament.id}`).expect(200)
    await request(app).get(`/${tournament.id}`).expect(200)
    expect(calls()).toBe(1)
  })

  it('reads again when the window is zero', async () => {
    const { app, tournament, calls } = countingRouter(0)
    await request(app).get(`/${tournament.id}`).expect(200)
    await request(app).get(`/${tournament.id}`).expect(200)
    expect(calls()).toBe(2)
  })
})
