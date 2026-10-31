import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
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
import { createResultsRouter } from './routes.ts'
import { squadResultsSchema, sweeperResultsSchema } from './types.ts'

function setup(options: { squadOver?: Parameters<typeof createSquad>[0] } = {}) {
  const tournament = createTournament()
  const other = createTournament()
  const open = createDivision({ number: 1, name: 'Open' })
  const squad = createSquad({ finalsRatio: 4, cashRatio: 2, games: 3, ...options.squadOver })
  const sweeper = createSweeper({ cashRatio: 2, games: 2 })
  const bowlers = ['Adams', 'Baker', 'Clark', 'Davis'].map((lastName) =>
    createLaneEntry({ divisionId: open.id, lastName, average: 180 }),
  )
  const totals = [250, 200, 190, 180]
  const captured = createCapturedLogger()
  const app = createTestApp({
    logger: captured.logger,
    tournaments: createInMemoryTournamentRepository([tournament, other]),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division: open }]),
    squads: createInMemorySquadRepository([
      { tournamentId: tournament.id, squad },
      { tournamentId: other.id, squad: createSquad() },
    ]),
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
  return { app, tournament, other, squad, sweeper, bowlers, captured }
}

describe('GET /v1/tournaments/:id/squads/:sessionId/results', () => {
  it('returns the squad results by division, public and as JSON (RES-31, RT-1)', async () => {
    const { app, tournament, squad, bowlers } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/results`,
    )

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(squadResultsSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.session).toMatchObject({ id: squad.id, kind: 'squad', complete: false })
    expect(response.body).toMatchObject({ finalsRatio: 4, cashRatio: 2 })
    expect(response.body.divisions).toHaveLength(1)
    const rows = response.body.divisions[0].rows
    expect(rows.map((row: { registrationId: string }) => row.registrationId)).toEqual(
      bowlers.map((entry) => entry.registrationId),
    )
    expect(rows[0]).toMatchObject({ place: 1, group: 'advancer', total: 750, games: 3 })
    expect(rows[1]).toMatchObject({ place: 2, group: 'casher' })
    expect(rows[2]).toMatchObject({ place: 3, group: 'other' })
  })

  it('sends only the fields the page needs, no personal data (RT-1, BWL-17)', async () => {
    const { app, tournament, squad } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/results`,
    )

    expect(Object.keys(response.body.divisions[0].rows[0]).toSorted()).toEqual(
      [
        'advancedEarlier',
        'games',
        'group',
        'handicap',
        'highGame',
        'name',
        'place',
        'registrationId',
        'ties',
        'total',
      ].toSorted(),
    )
    expect(Object.keys(response.body.divisions[0]).toSorted()).toEqual(
      [
        'didNotFinish',
        'entries',
        'id',
        'name',
        'noShows',
        'number',
        'rows',
        'showGames',
        'showHandicap',
      ].toSorted(),
    )
  })

  it('returns no divisions for a squad nobody has scores in (D-77)', async () => {
    const tournament = createTournament()
    const squad = createSquad()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
    })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/results`,
    )

    expect(response.status).toBe(200)
    expect(response.body.divisions).toEqual([])
  })

  it('returns 404 for an unknown tournament (RT-2)', async () => {
    const { squad } = setup()

    const response = await request(createTestApp()).get(
      `/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/squads/${squad.id}/results`,
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it.each([
    [
      'an unknown squad',
      (s: ReturnType<typeof setup>) =>
        `${s.tournament.id}/squads/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01`,
    ],
    [
      'a squad of another tournament',
      (s: ReturnType<typeof setup>) => `${s.other.id}/squads/${s.squad.id}`,
    ],
    [
      'a sweeper id under squads',
      (s: ReturnType<typeof setup>) => `${s.tournament.id}/squads/${s.sweeper.id}`,
    ],
  ])('returns 404 for %s (RT-2)', async (_name, path) => {
    const state = setup()

    const response = await request(state.app).get(`/v1/tournaments/${path(state)}/results`)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Squad not found' })
  })

  it.each([
    ['/v1/tournaments/not-a-uuid/squads/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/results'],
    ['/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/squads/not-a-uuid/results'],
  ])('returns 400 when an id is not a UUID: %s (RT-2)', async (path) => {
    const response = await request(createTestApp()).get(path)

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/^Invalid request\./)
  })

  it('returns 422 with a message for a ratio of 0 (RT-3, D-83)', async () => {
    const { app, tournament, squad } = setup({ squadOver: { finalsRatio: 0 } })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/results`,
    )

    expect(response.status).toBe(422)
    expect(response.body).toEqual({
      message:
        "This squad's finals ratio is 0, so results cannot be worked out. Set a ratio of 1 or more.",
    })
  })

  it('answers 503 when the database is down (RT-2, D-32)', async () => {
    const { tournament, squad } = setup()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
      scores: { listScores: () => Promise.reject(new HttpError(503, 'Database unavailable')) },
    })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/results`,
    )

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  it('answers a generic 500 for an unexpected failure, with no detail (RT-2)', async () => {
    const { tournament, squad } = setup()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
      scores: { listScores: () => Promise.reject(new Error('disk on fire')) },
    })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/results`,
    )
    spy.mockRestore()

    expect(response.status).toBe(500)
    expect(JSON.stringify(response.body)).not.toContain('disk on fire')
  })

  it('logs an entry left out once across polls, with the registration id and no name (D-51)', async () => {
    const tournament = createTournament()
    const squad = createSquad({ finalsRatio: 4, cashRatio: 2 })
    const lost = createLaneEntry({ divisionId: createDivision().id, lastName: 'Zyxwv' })
    const captured = createCapturedLogger()
    const app = createTestApp({
      logger: captured.logger,
      tournaments: createInMemoryTournamentRepository([tournament]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
      lanes: createInMemoryLaneRepository([{ sessionId: squad.id, entry: lost }]),
      scores: createInMemoryScoreRepository([
        { sessionId: squad.id, score: { bowlerId: lost.bowlerId, game: 1, score: 200 } },
      ]),
    })
    const url = `/v1/tournaments/${tournament.id}/squads/${squad.id}/results`

    await request(app).get(url)
    await request(app).get(url)

    const warnings = captured
      .records()
      .filter(
        (record) =>
          record['msg'] === 'Skipped a result entry whose division is not in this tournament',
      )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ registrationId: lost.registrationId, sessionId: squad.id })
    expect(JSON.stringify(captured.records())).not.toContain('Zyxwv')
  })
})

describe('GET /v1/tournaments/:id/sweepers/:sessionId/results', () => {
  it('returns one list with the cash line and cut score (RT-1, RES-22)', async () => {
    const { app, tournament, sweeper } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/sweepers/${sweeper.id}/results`,
    )

    expect(response.status).toBe(200)
    expect(sweeperResultsSchema.safeParse(response.body).success).toBe(true)
    expect(response.body).toMatchObject({
      session: { id: sweeper.id, kind: 'sweeper', games: 2 },
      cashRatio: 2,
      entries: 4,
      cashers: 2,
      cutScore: 600,
    })
    expect(response.body.rows.map((row: { group: string }) => row.group)).toEqual([
      'casher',
      'casher',
      'other',
      'other',
    ])
  })

  it('returns 404 "Sweeper not found" for a squad id under sweepers (RT-2)', async () => {
    const { app, tournament, squad } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/sweepers/${squad.id}/results`,
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Sweeper not found' })
  })

  it('returns 422 for a cash ratio of 0 (RT-3, D-83)', async () => {
    const tournament = createTournament()
    const sweeper = createSweeper({ cashRatio: 0 })
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
    })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/sweepers/${sweeper.id}/results`,
    )

    expect(response.status).toBe(422)
    expect(response.body.message).toMatch(/^This sweeper's cash ratio is 0/)
  })
})

describe('results cache', () => {
  function countingRouter(kind: 'squad' | 'sweeper', cacheMs: number) {
    const tournament = createTournament()
    const squad = createSquad({ finalsRatio: 4, cashRatio: 2, games: 3 })
    const sweeper = createSweeper({ cashRatio: 2, games: 2 })
    const inner = createInMemoryTournamentRepository([tournament])
    let calls = 0
    const tournaments = {
      ...inner,
      get: (id: string) => {
        calls++
        return inner.get(id)
      },
    }
    const router = createResultsRouter(
      kind,
      {
        tournaments,
        divisions: createInMemoryDivisionRepository([]),
        squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
        sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
        lanes: createInMemoryLaneRepository([]),
        scores: createInMemoryScoreRepository([]),
        logger: createCapturedLogger().logger,
      },
      cacheMs,
    )
    const app = express().use('/:id/:sessionId', router)
    const sessionId = kind === 'squad' ? squad.id : sweeper.id
    return {
      app,
      path: `/${tournament.id}/${sessionId}`,
      other: `/${tournament.id}/${crypto.randomUUID()}`,
      calls: () => calls,
    }
  }

  it.each(['squad', 'sweeper'] as const)(
    'answers a second %s poll in the window without reading again',
    async (kind) => {
      const { app, path, calls } = countingRouter(kind, 60_000)
      await request(app).get(path).expect(200)
      await request(app).get(path).expect(200)
      expect(calls()).toBe(1)
    },
  )

  it('reads again when the window is zero', async () => {
    const { app, path, calls } = countingRouter('squad', 0)
    await request(app).get(path).expect(200)
    await request(app).get(path).expect(200)
    expect(calls()).toBe(2)
  })

  it('does not keep a 404, so a session that appears later shows up', async () => {
    const { app, other, calls } = countingRouter('squad', 60_000)
    await request(app).get(other).expect(404)
    await request(app).get(other).expect(404)
    expect(calls()).toBe(2)
  })
})
