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
import { findSquad } from '../lanes/routes.ts'
import { createInMemoryLaneRepository } from '../lanes/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createInMemoryScoreRepository } from './repository.ts'
import { createScoreRouter } from './routes.ts'
import { scorePageSchema } from './types.ts'

function setup(options: { maxPerPair?: number; complete?: boolean } = {}) {
  const tournament = createTournament()
  const other = createTournament()
  const open = createDivision({ number: 1, name: 'Open' })
  const squad = createSquad({
    startingLane: 1,
    numberOfLanes: 6,
    maxPerPair: options.maxPerPair ?? 4,
    complete: options.complete ?? false,
    games: 3,
  })
  const sweeper = createSweeper({ startingLane: 11, numberOfLanes: 4, games: 4 })
  const adams = createLaneEntry({ divisionId: open.id, position: '1A', lastName: 'Adams' })
  const baker = createLaneEntry({ divisionId: open.id, position: '', lastName: 'Baker' })
  const lost = createLaneEntry({ divisionId: open.id, position: '77A', lastName: 'Lost' })
  const inSweeper = createLaneEntry({ divisionId: open.id, position: '11A' })
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
    lanes: createInMemoryLaneRepository([
      { sessionId: squad.id, entry: adams },
      { sessionId: squad.id, entry: baker },
      { sessionId: squad.id, entry: lost },
      { sessionId: sweeper.id, entry: inSweeper },
    ]),
    scores: createInMemoryScoreRepository([
      { sessionId: squad.id, score: { bowlerId: adams.bowlerId, game: 1, score: 212 } },
      { sessionId: squad.id, score: { bowlerId: adams.bowlerId, game: 2, score: 198 } },
      { sessionId: squad.id, score: { bowlerId: lost.bowlerId, game: 1, score: 150 } },
      { sessionId: sweeper.id, score: { bowlerId: inSweeper.bowlerId, game: 1, score: 240 } },
    ]),
  })
  return { app, tournament, other, squad, sweeper, adams, lost, captured }
}

describe('GET /v1/tournaments/:id/squads/:sessionId/scores', () => {
  it('returns the pairs with scores, the no-lane count, and other positions (SCR-16, SCR-13)', async () => {
    const { app, tournament, squad, adams, lost } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/scores`,
    )

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(scorePageSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.session).toMatchObject({
      id: squad.id,
      kind: 'squad',
      complete: false,
      games: 3,
    })
    expect(response.body.pairs).toHaveLength(1)
    expect(response.body.pairs[0].bowlers[0]).toMatchObject({
      registrationId: adams.registrationId,
      position: '1A',
      scores: [212, 198, null],
      total: 410,
    })
    expect(response.body.noLane).toBe(1)
    expect(response.body.other).toHaveLength(1)
    expect(response.body.other[0]).toMatchObject({
      registrationId: lost.registrationId,
      position: '77A',
      scores: [150, null, null],
    })
  })

  it('serves a sweeper with its own game count (SCR-16)', async () => {
    const { app, tournament, sweeper } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/sweepers/${sweeper.id}/scores`,
    )

    expect(response.status).toBe(200)
    expect(response.body.session).toMatchObject({ kind: 'sweeper', games: 4 })
    expect(response.body.pairs[0].bowlers[0].scores).toEqual([240, null, null, null])
  })

  it('marks a complete squad (SCR-14)', async () => {
    const { app, tournament, squad } = setup({ complete: true })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/scores`,
    )

    expect(response.body.session.complete).toBe(true)
  })

  it.each([1, 6, 0])('serves a session with %i bowlers per pair (D-73)', async (maxPerPair) => {
    const { app, tournament, squad } = setup({ maxPerPair })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/scores`,
    )

    expect(response.status).toBe(200)
    expect(response.body.pairs).toHaveLength(1)
  })

  it('returns an empty page for a squad nobody entered (SCR-17)', async () => {
    const tournament = createTournament()
    const squad = createSquad()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
    })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/scores`,
    )

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ pairs: [], noLane: 0, other: [] })
  })

  it('returns 404 for an unknown tournament (SCR-16)', async () => {
    const { squad } = setup()

    const response = await request(createTestApp()).get(
      `/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/squads/${squad.id}/scores`,
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it('answers 404 for an unknown tournament even when the score read fails (SCR-16)', async () => {
    const { squad } = setup()
    const app = createTestApp({
      scores: { listScores: () => Promise.reject(new HttpError(503, 'Database unavailable')) },
    })

    const response = await request(app).get(
      `/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/squads/${squad.id}/scores`,
    )

    expect(response.status).toBe(404)
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
  ])('returns 404 for %s (SCR-16)', async (_name, path) => {
    const state = setup()

    const response = await request(state.app).get(`/v1/tournaments/${path(state)}/scores`)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Squad not found' })
  })

  it('returns 404 "Sweeper not found" for a squad id under sweepers (SCR-16)', async () => {
    const { app, tournament, squad } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/sweepers/${squad.id}/scores`,
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Sweeper not found' })
  })

  it.each([
    ['/v1/tournaments/not-a-uuid/squads/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/scores'],
    ['/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/squads/not-a-uuid/scores'],
  ])('returns 400 when an id is not a UUID: %s (SCR-16)', async (path) => {
    const response = await request(createTestApp()).get(path)

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/^Invalid request\./)
  })

  it('answers 503 when the database is down (D-32)', async () => {
    const { tournament, squad } = setup()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
      scores: { listScores: () => Promise.reject(new HttpError(503, 'Database unavailable')) },
    })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/scores`,
    )

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  it('logs a position outside the lanes once, with the registration id and no name (D-61)', async () => {
    const { app, tournament, squad, lost, captured } = setup()
    const url = `/v1/tournaments/${tournament.id}/squads/${squad.id}/scores`

    await request(app).get(url)
    await request(app).get(url)

    const warnings = captured
      .records()
      .filter((record) => record['msg'] === 'A lane position fits no pair of this session')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ registrationId: lost.registrationId, sessionId: squad.id })
    expect(JSON.stringify(captured.records())).not.toContain('Lost')
  })
})

describe('score cache', () => {
  function countingRouter(cacheMs: number) {
    const tournament = createTournament()
    const squad = createSquad({ startingLane: 1, numberOfLanes: 2, games: 3 })
    const inner = createInMemoryScoreRepository([])
    let calls = 0
    const scores = {
      ...inner,
      listScores: (sessionId: string) => {
        calls++
        return inner.listScores(sessionId)
      },
    }
    const router = createScoreRouter(
      'squad',
      findSquad(createInMemorySquadRepository([{ tournamentId: tournament.id, squad }])),
      {
        tournaments: createInMemoryTournamentRepository([tournament]),
        divisions: createInMemoryDivisionRepository([]),
        lanes: createInMemoryLaneRepository([]),
        scores,
        logger: createCapturedLogger().logger,
      },
      cacheMs,
    )
    const app = express().use('/:id/:sessionId', router)
    return { app, path: `/${tournament.id}/${squad.id}`, calls: () => calls }
  }

  it('answers a second poll in the window without reading again', async () => {
    const { app, path, calls } = countingRouter(60_000)
    await request(app).get(path).expect(200)
    await request(app).get(path).expect(200)
    expect(calls()).toBe(1)
  })

  it('shares one entry between an upper-case and a lower-case id', async () => {
    const { app, path, calls } = countingRouter(60_000)
    await request(app).get(path).expect(200)
    await request(app).get(path.toUpperCase()).expect(200)
    expect(calls()).toBe(1)
  })

  it('reads again when the window is zero', async () => {
    const { app, path, calls } = countingRouter(0)
    await request(app).get(path).expect(200)
    await request(app).get(path).expect(200)
    expect(calls()).toBe(2)
  })
})
