import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import {
  createDivision,
  createLaneEntry,
  createSquad,
  createSweeper,
  createTournament,
  testApiKey,
} from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemoryLaneRepository } from '../lanes/repository.ts'
import { createInMemorySkipStore } from '../skip/store.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { gamesViewSchema } from './gamesTypes.ts'
import { createInMemoryScoreRepository } from './repository.ts'

function setup(options: { maxPerPair?: number } = {}) {
  const tournament = createTournament()
  const other = createTournament()
  const open = createDivision({ number: 1, name: 'Open' })
  const squad = createSquad({
    startingLane: 1,
    numberOfLanes: 4,
    maxPerPair: options.maxPerPair ?? 4,
    games: 3,
  })
  const sweeper = createSweeper({ startingLane: 11, numberOfLanes: 4, games: 2 })
  const ann = createLaneEntry({ divisionId: open.id, position: '1A', name: 'Ann Lee' })
  const cal = createLaneEntry({ divisionId: open.id, position: '3A', name: 'Cal Ode' })
  const inSweeper = createLaneEntry({ divisionId: open.id, position: '11A', name: 'Sue Swept' })
  const { store: skipStore } = createInMemorySkipStore()
  const overrides = {
    skipStore,
    tournaments: createInMemoryTournamentRepository([tournament, other]),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division: open }]),
    squads: createInMemorySquadRepository([
      { tournamentId: tournament.id, squad },
      { tournamentId: other.id, squad: createSquad() },
    ]),
    sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
    lanes: createInMemoryLaneRepository([
      { sessionId: squad.id, entry: ann },
      { sessionId: squad.id, entry: cal },
      { sessionId: sweeper.id, entry: inSweeper },
    ]),
    scores: createInMemoryScoreRepository([
      { sessionId: squad.id, score: { bowlerId: ann.bowlerId, game: 1, score: 212 } },
    ]),
  }
  const url = (session = squad.id, plural = 'squads') =>
    `/v1/tournaments/${tournament.id}/${plural}/${session}/scores/games`
  return { overrides, url, tournament, other, squad, sweeper, skipStore, open }
}

describe('GET /v1/tournaments/:id/squads/:sessionId/scores/games (SCR-22)', () => {
  it('returns every game with the pairs as bowled and each bowler their lane and score (D-234)', async () => {
    const { overrides, url, squad } = setup()

    const response = await request(createSignedInTestApp(overrides, 'scoreKeeper')).get(url())

    expect(response.status).toBe(200)
    expect(gamesViewSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.session).toMatchObject({ id: squad.id, kind: 'squad', games: 3 })
    expect(response.body.skip).toBe('staggered')
    expect(response.body.games).toHaveLength(3)
    const game1 = response.body.games[0]
    expect(game1).toMatchObject({ game: 1, entered: 1, total: 2 })
    expect(game1.pairs[0].bowlers[0]).toMatchObject({
      lane: '1A',
      name: 'Ann Lee',
      score: 212,
      scores: [212, null, null],
      total: 212,
    })
  })

  it('uses the stored skip for the lanes (SCR-23, D-235)', async () => {
    const { overrides, url, squad, skipStore } = setup()
    const app = createSignedInTestApp(overrides)
    const laneOfAnnInGame3 = async () => {
      const body = (await request(app).get(url())).body
      return body.games[2].pairs
        .flatMap((pair: { bowlers: { name: string; lane: string }[] }) => pair.bowlers)
        .find((bowler: { name: string }) => bowler.name === 'Ann Lee').lane
    }

    const staggered = await laneOfAnnInGame3()
    await skipStore.set(squad.id, 'same')
    const same = await laneOfAnnInGame3()

    expect(staggered).toBe('3A')
    expect(same).toBe('1A')
  })

  it('works for a sweeper with its own games (SCR-22)', async () => {
    const { overrides, url, sweeper } = setup()
    const response = await request(createSignedInTestApp(overrides)).get(
      url(sweeper.id, 'sweepers'),
    )
    expect(response.status).toBe(200)
    expect(response.body.session.kind).toBe('sweeper')
    expect(response.body.games).toHaveLength(2)
  })

  it('answers 404 for an unknown tournament, an unknown session, one of another tournament, and the wrong kind (SCR-22)', async () => {
    const { overrides, tournament, other, squad, sweeper, url } = setup()
    const app = createSignedInTestApp(overrides)
    const unknown = 'b0000000-0000-4000-8000-000000000009'

    const noTournament = await request(app).get(
      `/v1/tournaments/${unknown}/squads/${squad.id}/scores/games`,
    )
    expect(noTournament.body).toEqual({ message: 'Tournament not found' })
    const noSquad = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${unknown}/scores/games`,
    )
    expect(noSquad.body).toEqual({ message: 'Squad not found' })
    const foreign = await request(app).get(
      `/v1/tournaments/${other.id}/squads/${squad.id}/scores/games`,
    )
    expect(foreign.status).toBe(404)
    const wrongKind = await request(app).get(url(sweeper.id, 'squads'))
    expect(wrongKind.body).toEqual({ message: 'Squad not found' })
  })

  it('answers 400 for an id that is not a UUID (SCR-22)', async () => {
    const { overrides, tournament } = setup()
    const response = await request(createSignedInTestApp(overrides)).get(
      `/v1/tournaments/${tournament.id}/squads/nope/scores/games`,
    )
    expect(response.status).toBe(400)
  })

  it('answers 422 when bowlers per pair is not 2 to 5 (LAN-02)', async () => {
    const { overrides, url } = setup({ maxPerPair: 1 })
    const response = await request(createSignedInTestApp(overrides)).get(url())
    expect(response.status).toBe(422)
  })

  it('needs scores.write: no sign-in is 401 and the API key is 403 (SCR-22, D-96)', async () => {
    const { overrides, url } = setup()
    const app = createTestApp(overrides)
    expect((await request(app).get(url())).status).toBe(401)
    expect((await request(app).get(url()).set(apiKeyHeader, testApiKey)).status).toBe(403)
  })

  it('is not cached: a changed skip shows on the next call (SCR-22)', async () => {
    const { overrides, url, squad, skipStore } = setup()
    const app = createSignedInTestApp(overrides)
    expect((await request(app).get(url())).body.skip).toBe('staggered')
    await skipStore.set(squad.id, 'same')
    expect((await request(app).get(url())).body.skip).toBe('same')
  })

  it('leaves the public scores page as it was (SCR-16)', async () => {
    const { overrides, tournament, squad } = setup()
    const response = await request(createTestApp(overrides)).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/scores`,
    )
    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('pairs')
  })
})

describe('GET .../scores/games problems and failures (SCR-22, D-51, D-61)', () => {
  it('warns once about a lane position that fits no pair and an entry with no division, with ids only', async () => {
    const { overrides, url, squad, open } = setup()
    const lost = createLaneEntry({ divisionId: open.id, position: '77A' })
    const orphan = createLaneEntry({ position: '1A' })
    const captured = createCapturedLogger()
    const lanes = createInMemoryLaneRepository([
      { sessionId: squad.id, entry: lost },
      { sessionId: squad.id, entry: orphan },
    ])
    const app = createSignedInTestApp({ ...overrides, lanes, logger: captured.logger })

    await request(app).get(url())
    await request(app).get(url())

    const lines = (message: string) =>
      captured.records().filter((record) => record['msg'] === message)
    expect(lines('A lane position fits no pair of this session')).toHaveLength(1)
    expect(lines('A lane position fits no pair of this session')[0]).toMatchObject({
      registrationId: lost.registrationId,
      sessionId: squad.id,
    })
    expect(lines('Skipped a lane entry whose division is not in this tournament')).toHaveLength(1)
  })

  it('answers 404 for an unknown squad even when the score read fails, with nothing left unhandled', async () => {
    const { overrides, url } = setup()
    const app = createSignedInTestApp({
      ...overrides,
      scores: { listScores: () => Promise.reject(new Error('database is down')) },
    })

    const response = await request(app).get(url('b0000000-0000-4000-8000-000000000009'))

    expect(response.status).toBe(404)
  })
})
