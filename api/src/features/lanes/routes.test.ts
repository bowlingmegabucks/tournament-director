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
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createInMemoryLaneRepository } from './repository.ts'
import { lanePageSchema } from './types.ts'

function setup(options: { maxPerPair?: number } = {}) {
  const tournament = createTournament()
  const other = createTournament()
  const open = createDivision({ number: 1, name: 'Open' })
  const scratch = createDivision({ number: 2, name: 'Scratch' })
  const squad = createSquad({
    startingLane: 1,
    numberOfLanes: 6,
    maxPerPair: options.maxPerPair ?? 5,
  })
  const sweeper = createSweeper({
    startingLane: 11,
    numberOfLanes: 4,
    maxPerPair: 4,
    bonusPins: [{ divisionId: scratch.id, divisionName: 'Scratch', bonusPinsPerGame: 12 }],
  })
  const assigned = createLaneEntry({ divisionId: open.id, position: '1A', lastName: 'Adams' })
  const waiting = createLaneEntry({ divisionId: scratch.id, position: '', lastName: 'Baker' })
  const sweeperEntry = createLaneEntry({ divisionId: scratch.id, position: '11A' })
  const captured = createCapturedLogger()
  const app = createTestApp({
    logger: captured.logger,
    tournaments: createInMemoryTournamentRepository([tournament, other]),
    divisions: createInMemoryDivisionRepository([
      { tournamentId: tournament.id, division: scratch },
      { tournamentId: tournament.id, division: open },
    ]),
    squads: createInMemorySquadRepository([
      { tournamentId: tournament.id, squad },
      { tournamentId: other.id, squad: createSquad() },
    ]),
    sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
    lanes: createInMemoryLaneRepository([
      { sessionId: squad.id, entry: assigned },
      { sessionId: squad.id, entry: waiting },
      { sessionId: sweeper.id, entry: sweeperEntry },
    ]),
  })
  return { app, tournament, other, squad, sweeper, assigned, waiting, captured }
}

describe('GET /v1/tournaments/:id/squads/:sessionId/lanes', () => {
  it('returns the pairs, the unassigned bowlers, and the division counts (LAN-10)', async () => {
    const { app, tournament, squad, assigned, waiting } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/lanes`,
    )

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(lanePageSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.session).toMatchObject({ id: squad.id, kind: 'squad', maxPerPair: 5 })
    expect(response.body.pairs).toHaveLength(3)
    expect(response.body.pairs[0].bowlers.map((b: { position: string }) => b.position)).toEqual([
      '1A',
    ])
    expect(response.body.pairs[0].bowlers[0].registrationId).toBe(assigned.registrationId)
    expect(
      response.body.unassigned.map((b: { registrationId: string }) => b.registrationId),
    ).toEqual([waiting.registrationId])
    expect(response.body.other).toEqual([])
    expect(
      response.body.divisions.map((d: { name: string; entries: number }) => [d.name, d.entries]),
    ).toEqual([
      ['Open', 1],
      ['Scratch', 1],
    ])
  })

  it('sends a squad bowler handicap pins (LAN-11, SCR-07)', async () => {
    const tournament = createTournament()
    const handicapped = createDivision({
      handicapBase: 220,
      handicapPercentage: 90,
      maximumHandicapPerGame: 50,
    })
    const squad = createSquad()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      divisions: createInMemoryDivisionRepository([
        { tournamentId: tournament.id, division: handicapped },
      ]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
      lanes: createInMemoryLaneRepository([
        {
          sessionId: squad.id,
          entry: createLaneEntry({ divisionId: handicapped.id, average: 200 }),
        },
      ]),
    })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/lanes`,
    )

    expect(response.body.unassigned[0].pins).toBe(18)
  })

  it('returns an empty page for a squad nobody entered (LAN-10)', async () => {
    const tournament = createTournament()
    const squad = createSquad({ numberOfLanes: 2 })
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
    })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/lanes`,
    )

    expect(response.status).toBe(200)
    expect(response.body.unassigned).toEqual([])
    expect(response.body.pairs).toHaveLength(1)
  })

  it('marks a complete squad (LAN-13)', async () => {
    const tournament = createTournament()
    const squad = createSquad({ complete: true })
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
    })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/lanes`,
    )

    expect(response.body.session.complete).toBe(true)
  })

  it('returns 404 for an unknown tournament (LAN-10)', async () => {
    const { squad } = setup()

    const response = await request(createTestApp()).get(
      `/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/squads/${squad.id}/lanes`,
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
  ])('returns 404 for %s (LAN-10)', async (_name, path) => {
    const state = setup()

    const response = await request(state.app).get(`/v1/tournaments/${path(state)}/lanes`)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Squad not found' })
  })

  it.each([
    ['/v1/tournaments/not-a-uuid/squads/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/lanes'],
    ['/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/squads/not-a-uuid/lanes'],
  ])('returns 400 when an id is not a UUID: %s (LAN-10)', async (path) => {
    const response = await request(createTestApp()).get(path)

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/^Invalid request\./)
  })

  it.each([1, 6, 0])('returns 422 when bowlers per pair is %i (LAN-02)', async (maxPerPair) => {
    const { app, tournament, squad } = setup({ maxPerPair })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/lanes`,
    )

    expect(response.status).toBe(422)
    expect(response.body).toEqual({
      message: 'Bowlers per pair must be 2 to 5 to assign lanes',
    })
  })

  it.each([2, 5])('serves a session with %i bowlers per pair (LAN-02)', async (maxPerPair) => {
    const { app, tournament, squad } = setup({ maxPerPair })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/lanes`,
    )

    expect(response.status).toBe(200)
    expect(response.body.pairs[0].capacity).toBe(maxPerPair)
  })

  it('answers 503 when the database is down (D-32)', async () => {
    const { tournament, squad } = setup()
    const app = createTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
      lanes: { listEntries: () => Promise.reject(new HttpError(503, 'Database unavailable')) },
    })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/lanes`,
    )

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  it('answers 500 when the tournament row breaks its shape', async () => {
    const app = createTestApp({
      tournaments: {
        list: () => Promise.resolve([]),
        get: () => Promise.reject(new Error('Stored tournament x breaks the vendor shape')),
        getRatios: () => Promise.reject(new Error('Stored tournament x breaks the vendor shape')),
      },
    })

    const response = await request(app).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/squads/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a02/lanes',
    )

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error' })
  })

  it('logs each position outside the lanes once, with the registration id and no name (D-61)', async () => {
    const tournament = createTournament()
    const division = createDivision()
    const squad = createSquad({ numberOfLanes: 4 })
    const lost = createLaneEntry({
      divisionId: division.id,
      position: '31A',
      lastName: 'Secretname',
    })
    const alsoLost = createLaneEntry({ divisionId: division.id, position: 'xyz' })
    const captured = createCapturedLogger('warn')
    const app = createTestApp({
      logger: captured.logger,
      tournaments: createInMemoryTournamentRepository([tournament]),
      divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division }]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
      lanes: createInMemoryLaneRepository([
        { sessionId: squad.id, entry: lost },
        { sessionId: squad.id, entry: alsoLost },
      ]),
    })
    const url = `/v1/tournaments/${tournament.id}/squads/${squad.id}/lanes`

    const first = await request(app).get(url)
    await request(app).get(url)

    expect(first.body.other).toHaveLength(2)
    const warnings = captured
      .records()
      .filter((r) => r['msg'] === 'A lane position fits no pair of this session')
    expect(warnings.map((w) => w['registrationId']).sort()).toEqual(
      [lost.registrationId, alsoLost.registrationId].sort(),
    )
    expect(warnings[0]).toMatchObject({ sessionId: squad.id })
    expect(JSON.stringify(captured.records())).not.toContain('Secretname')
  })

  it('logs each entry whose division is not the tournaments, once (D-51)', async () => {
    const tournament = createTournament()
    const squad = createSquad()
    const stray = createLaneEntry({ position: '1A' })
    const alsoStray = createLaneEntry({ position: '2C' })
    const captured = createCapturedLogger('warn')
    const app = createTestApp({
      logger: captured.logger,
      tournaments: createInMemoryTournamentRepository([tournament]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
      lanes: createInMemoryLaneRepository([
        { sessionId: squad.id, entry: stray },
        { sessionId: squad.id, entry: alsoStray },
      ]),
    })
    const url = `/v1/tournaments/${tournament.id}/squads/${squad.id}/lanes`

    await request(app).get(url)
    await request(app).get(url)

    const warnings = captured
      .records()
      .filter((r) => r['msg'] === 'Skipped a lane entry whose division is not in this tournament')
    expect(warnings.map((w) => w['registrationId']).sort()).toEqual(
      [stray.registrationId, alsoStray.registrationId].sort(),
    )
  })
})

describe('GET /v1/tournaments/:id/sweepers/:sessionId/lanes', () => {
  it('returns the sweeper page, with bonus pins as pins (LAN-10, LAN-11, SCR-09)', async () => {
    const { app, tournament, sweeper } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/sweepers/${sweeper.id}/lanes`,
    )

    expect(response.status).toBe(200)
    expect(lanePageSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.session).toMatchObject({ id: sweeper.id, kind: 'sweeper', maxPerPair: 4 })
    expect(response.body.pairs).toHaveLength(2)
    expect(response.body.pairs[0].bowlers[0]).toMatchObject({ position: '11A', pins: 12 })
  })

  it.each([
    [
      'a squad id under sweepers',
      (s: ReturnType<typeof setup>) => `${s.tournament.id}/sweepers/${s.squad.id}`,
    ],
    [
      'an unknown sweeper',
      (s: ReturnType<typeof setup>) =>
        `${s.tournament.id}/sweepers/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01`,
    ],
  ])('returns 404 for %s (LAN-10)', async (_name, path) => {
    const state = setup()

    const response = await request(state.app).get(`/v1/tournaments/${path(state)}/lanes`)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Sweeper not found' })
  })

  it('returns 404 for an unknown tournament (LAN-10)', async () => {
    const response = await request(createTestApp()).get(
      '/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/sweepers/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a02/lanes',
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })
})
