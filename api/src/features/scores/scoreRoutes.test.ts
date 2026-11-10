import { metrics } from '@opentelemetry/api'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { createSessionEvents, type ChangeEvent } from '../../shared/events/sessionEvents.ts'
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
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createInMemoryScoreWriter } from './scoreWriter.ts'
import type { ScoreRepository } from './repository.ts'

function setup(options: { complete?: boolean; tournamentComplete?: boolean } = {}) {
  const tournament = createTournament()
  const open = createDivision({ number: 1, name: 'Open' })
  const squad = createSquad({
    startingLane: 1,
    numberOfLanes: 4,
    games: 3,
    complete: options.complete ?? false,
  })
  const sweeper = createSweeper({ startingLane: 11, numberOfLanes: 4, games: 2 })
  const ann = createLaneEntry({ divisionId: open.id, position: '1A', name: 'Ann Lee' })
  const cal = createLaneEntry({ divisionId: open.id, position: '3A', name: 'Cal Ode' })
  const inSweeper = createLaneEntry({ divisionId: open.id, position: '11A', name: 'Sue Swept' })
  const { writer, state } = createInMemoryScoreWriter({
    tournaments: [{ id: tournament.id, complete: options.tournamentComplete, games: 3 }],
    sessions: [
      { id: squad.id, tournamentId: tournament.id, complete: options.complete },
      { id: sweeper.id, tournamentId: tournament.id, kind: 'sweeper', games: 2 },
    ],
    entries: [
      { sessionId: squad.id, registrationId: ann.registrationId, bowlerId: ann.bowlerId },
      { sessionId: squad.id, registrationId: cal.registrationId, bowlerId: cal.bowlerId },
      {
        sessionId: sweeper.id,
        registrationId: inSweeper.registrationId,
        bowlerId: inSweeper.bowlerId,
      },
    ],
  })
  // The public page reads what the writer wrote, so a test can see the cache at work.
  const scores: ScoreRepository = {
    listScores: (sessionId) =>
      Promise.resolve(
        state.scores
          .filter((row) => row.sessionId === sessionId)
          .map(({ bowlerId, game, score }) => ({ bowlerId, game, score })),
      ),
  }
  const captured = createCapturedLogger('debug')
  const events = createSessionEvents(captured.logger, metrics.getMeter('test'))
  const seen: { sessionId: string; event: ChangeEvent }[] = []
  for (const sessionId of [squad.id, sweeper.id]) {
    events.subscribe(sessionId, {
      send: (event) => seen.push({ sessionId, event }),
      end: () => undefined,
    })
  }
  const overrides = {
    logger: captured.logger,
    events,
    scoreWriter: writer,
    scores,
    tournaments: createInMemoryTournamentRepository([tournament]),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division: open }]),
    squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
    sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
    lanes: createInMemoryLaneRepository([
      { sessionId: squad.id, entry: ann },
      { sessionId: squad.id, entry: cal },
      { sessionId: sweeper.id, entry: inSweeper },
    ]),
  }
  const url = (entry = ann.registrationId, game = 1, session = squad.id, plural = 'squads') =>
    `/v1/tournaments/${tournament.id}/${plural}/${session}/scores/${entry}/${game}`
  return { overrides, url, tournament, squad, sweeper, ann, cal, inSweeper, state, seen, captured }
}

describe('PUT .../scores/:registrationId/:game (SCR-19)', () => {
  it("saves a score and answers the bowler's scores and total (SCR-01, D-228)", async () => {
    const { overrides, url, state, squad, ann } = setup()

    const response = await request(createSignedInTestApp(overrides, 'scoreKeeper'))
      .put(url())
      .send({ score: 212 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ scores: [212, null, null], total: 212 })
    expect(state.scores).toEqual([
      { sessionId: squad.id, bowlerId: ann.bowlerId, game: 1, score: 212 },
    ])
  })

  it('fills the games before with 0 and says so in the answer (SCR-03, D-229)', async () => {
    const { overrides, url, state } = setup()

    const response = await request(createSignedInTestApp(overrides))
      .put(url(undefined, 3))
      .send({ score: 167 })

    expect(response.body).toEqual({ scores: [0, 0, 167], total: 167 })
    expect(state.scores.map(({ game, score }) => [game, score])).toEqual([
      [1, 0],
      [2, 0],
      [3, 167],
    ])
  })

  it('updates a score that is already saved, without a second row (SCR-04)', async () => {
    const { overrides, url, state } = setup()
    const app = createSignedInTestApp(overrides)

    await request(app).put(url()).send({ score: 150 })
    const response = await request(app).put(url()).send({ score: 160 })

    expect(response.body).toEqual({ scores: [160, null, null], total: 160 })
    expect(state.scores).toHaveLength(1)
  })

  it("leaves the other bowler's scores alone (SCR-05, SCR-06, D-228)", async () => {
    const { overrides, url, state, cal } = setup()
    const app = createSignedInTestApp(overrides)
    await request(app).put(url(cal.registrationId)).send({ score: 200 })

    await request(app).put(url()).send({ score: 150 })

    expect(state.scores.find((row) => row.bowlerId === cal.bowlerId)?.score).toBe(200)
  })

  it('saves on a sweeper against its own games (SCR-19, D-238)', async () => {
    const { overrides, url, sweeper, inSweeper } = setup()
    const app = createSignedInTestApp(overrides)
    const sweeperUrl = (game: number) => url(inSweeper.registrationId, game, sweeper.id, 'sweepers')

    expect((await request(app).put(sweeperUrl(2)).send({ score: 240 })).body).toEqual({
      scores: [0, 240],
      total: 240,
    })
    const tooFar = await request(app).put(sweeperUrl(3)).send({ score: 240 })
    expect(tooFar.status).toBe(400)
    expect(tooFar.body).toEqual({ message: 'Game must be from 1 to 2.' })
  })

  it('refuses 0, 301, and a fraction with 400 and the message (SCR-01)', async () => {
    const { overrides, url, state } = setup()
    const app = createSignedInTestApp(overrides)
    for (const score of [0, 301, 212.5]) {
      const response = await request(app).put(url()).send({ score })
      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'Enter a score from 1 to 300.' })
    }
    expect(state.scores).toEqual([])
  })

  it('refuses a body with no number, a text score, and extra fields with 400 (SCR-02)', async () => {
    const { overrides, url } = setup()
    const app = createSignedInTestApp(overrides)
    expect((await request(app).put(url()).send({})).status).toBe(400)
    expect((await request(app).put(url()).send({ score: '200' })).status).toBe(400)
    expect((await request(app).put(url()).send({ score: 200, extra: 1 })).status).toBe(400)
  })

  it('says the game must be a whole number when it is not digits (SCR-02)', async () => {
    const { overrides, url, ann } = setup()
    const response = await request(createSignedInTestApp(overrides))
      .put(url(ann.registrationId, 1).replace(/\/1$/, '/abc'))
      .send({ score: 200 })
    expect(JSON.stringify(response.body)).toContain('Game must be a whole number')
  })

  it('reads a game of one to three digits and nothing else (SCR-02)', async () => {
    const { overrides, url, ann } = setup()
    const app = createSignedInTestApp(overrides)
    const at = async (game: string) =>
      (
        await request(app)
          .put(url(ann.registrationId, 1).replace(/\/1$/, `/${game}`))
          .send({ score: 200 })
      ).body
    // Digits that are a game, but past the session's games, are the plan's message.
    expect(await at('10')).toEqual({ message: 'Game must be from 1 to 3.' })
    expect(await at('100')).toEqual({ message: 'Game must be from 1 to 3.' })
    // Anything else around digits is not a game at all.
    for (const game of ['1x', 'x1', '1234', '-1', '1%20']) {
      expect(JSON.stringify(await at(game))).toContain('Game must be a whole number')
    }
  })

  it('logs a refusal with ids and no name (SCR-14, D-231)', async () => {
    const { overrides, url, captured, squad } = setup({ complete: true })
    await request(createSignedInTestApp(overrides)).put(url()).send({ score: 200 })

    const line = captured.records().find((entry) => entry.msg === 'Score change refused')
    expect(line).toMatchObject({ squadId: squad.id, game: 1 })
    expect(JSON.stringify(captured.records())).not.toContain('Ann Lee')
  })

  it('names a sweeper that is not found, and a sweeper bowler who is not entered (SCR-19)', async () => {
    const { overrides, url, tournament, sweeper, inSweeper } = setup()
    const app = createSignedInTestApp(overrides)
    const unknown = 'b0000000-0000-4000-8000-000000000009'

    const noSweeper = await request(app)
      .put(
        `/v1/tournaments/${tournament.id}/sweepers/${unknown}/scores/${inSweeper.registrationId}/1`,
      )
      .send({ score: 200 })
    expect(noSweeper.body).toEqual({ message: 'Sweeper not found' })
    const stranger = await request(app)
      .put(url(unknown, 1, sweeper.id, 'sweepers'))
      .send({ score: 200 })
    expect(stranger.body).toEqual({ message: 'Bowler is not registered for this sweeper' })
  })

  it('refuses a game that is not digits, is 0, or is above the games with 400 (SCR-02, D-238)', async () => {
    const { overrides, url, ann } = setup()
    const app = createSignedInTestApp(overrides)
    const at = (game: string) =>
      request(app)
        .put(url(ann.registrationId, 1).replace(/\/1$/, `/${game}`))
        .send({ score: 200 })
    expect((await at('abc')).status).toBe(400)
    expect((await at('3.5')).status).toBe(400)
    const zero = await at('0')
    expect(zero.body).toEqual({ message: 'Game must be from 1 to 3.' })
    expect((await at('4')).body).toEqual({ message: 'Game must be from 1 to 3.' })
  })

  it('answers 404 for an unknown tournament, session, and a bowler who is not entered (SCR-19)', async () => {
    const { overrides, url, tournament, squad, sweeper, ann } = setup()
    const app = createSignedInTestApp(overrides)
    const unknown = 'b0000000-0000-4000-8000-000000000009'

    const noTournament = await request(app)
      .put(`/v1/tournaments/${unknown}/squads/${squad.id}/scores/${ann.registrationId}/1`)
      .send({ score: 200 })
    expect(noTournament.body).toEqual({ message: 'Tournament not found' })
    const noSession = await request(app)
      .put(`/v1/tournaments/${tournament.id}/squads/${unknown}/scores/${ann.registrationId}/1`)
      .send({ score: 200 })
    expect(noSession.body).toEqual({ message: 'Squad not found' })
    const wrongKind = await request(app)
      .put(url(ann.registrationId, 1, sweeper.id))
      .send({ score: 200 })
    expect(wrongKind.body).toEqual({ message: 'Squad not found' })
    const stranger = await request(app).put(url(unknown)).send({ score: 200 })
    expect(stranger.body).toEqual({ message: 'Bowler is not registered for this squad' })
  })

  it('answers 400 for an id that is not a UUID (SCR-02)', async () => {
    const { overrides, tournament, squad } = setup()
    const response = await request(createSignedInTestApp(overrides))
      .put(`/v1/tournaments/${tournament.id}/squads/${squad.id}/scores/nope/1`)
      .send({ score: 200 })
    expect(response.status).toBe(400)
  })

  it('refuses a complete squad and a complete tournament with 409 and saves nothing (SCR-14, D-231)', async () => {
    const complete = setup({ complete: true })
    const refused = await request(createSignedInTestApp(complete.overrides))
      .put(complete.url())
      .send({ score: 200 })
    expect(refused.status).toBe(409)
    expect(refused.body).toEqual({ message: 'This squad is complete. Scores cannot change.' })
    expect(complete.state.scores).toEqual([])
    expect(complete.seen).toEqual([])

    const frozen = setup({ tournamentComplete: true })
    const response = await request(createSignedInTestApp(frozen.overrides))
      .put(frozen.url())
      .send({ score: 200 })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message: 'This tournament is complete. Scores cannot change.' })
  })

  it('tells the screens of that session once, after the save, with the scores kind (D-232)', async () => {
    const { overrides, url, seen, squad } = setup()

    await request(createSignedInTestApp(overrides)).put(url()).send({ score: 200 })

    expect(seen).toEqual([{ sessionId: squad.id, event: { kind: 'scores', version: 1 } }])
  })

  it('publishes nothing for the same score again, and nothing for a refusal (D-232)', async () => {
    const { overrides, url, seen } = setup()
    const app = createSignedInTestApp(overrides)
    await request(app).put(url()).send({ score: 200 })
    seen.length = 0

    const again = await request(app).put(url()).send({ score: 200 })
    await request(app).put(url()).send({ score: 999 })

    expect(again.body).toEqual({ scores: [200, null, null], total: 200 })
    expect(seen).toEqual([])
  })

  it('shows the new score on the public page at once, inside the 5 s cache (D-232)', async () => {
    const { overrides, url, tournament, squad } = setup()
    const app = createSignedInTestApp(overrides)
    const page = `/v1/tournaments/${tournament.id}/squads/${squad.id}/scores`
    const firstScore = async () => (await request(app).get(page)).body.pairs[0].bowlers[0].scores[0]

    expect(await firstScore()).toBeNull() // now the page is cached
    await request(app).put(url()).send({ score: 188 })

    expect(await firstScore()).toBe(188)
  })

  it('needs scores.write: no sign-in 401, the API key 403 (SCR-19, D-96)', async () => {
    const { overrides, url } = setup()
    const app = createTestApp(overrides)
    expect((await request(app).put(url()).send({ score: 200 })).status).toBe(401)
    expect(
      (await request(app).put(url()).set(apiKeyHeader, testApiKey).send({ score: 200 })).status,
    ).toBe(403)
  })

  it('logs ids, the game, and the filled games, never a name (SCR-19)', async () => {
    const { overrides, url, captured, squad, ann } = setup()
    await request(createSignedInTestApp(overrides)).put(url(undefined, 3)).send({ score: 150 })

    const line = captured.records().find((entry) => entry.msg === 'Score saved')
    expect(line).toMatchObject({
      squadId: squad.id,
      registrationId: ann.registrationId,
      game: 3,
      filledGames: 2,
    })
    expect(JSON.stringify(captured.records())).not.toContain('Ann Lee')
  })
})

describe('DELETE .../scores/:registrationId/:game (SCR-19)', () => {
  it("clears the last game and answers the bowler's scores (SCR-06, D-228)", async () => {
    const { overrides, url, state } = setup()
    const app = createSignedInTestApp(overrides)
    await request(app).put(url(undefined, 2)).send({ score: 180 })

    const response = await request(app).delete(url(undefined, 2))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ scores: [0, null, null], total: 0 })
    expect(state.scores.map((row) => row.game)).toEqual([1])
  })

  it('refuses a clear that would leave a gap, and names the game to clear first (D-229)', async () => {
    const { overrides, url, state } = setup()
    const app = createSignedInTestApp(overrides)
    await request(app).put(url(undefined, 2)).send({ score: 180 })

    const response = await request(app).delete(url(undefined, 1))

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message: 'Clear game 2 first.' })
    expect(state.scores).toHaveLength(2)
  })

  it('answers 404 when there is no score to clear (SCR-19)', async () => {
    const { overrides, url } = setup()
    const response = await request(createSignedInTestApp(overrides)).delete(url())
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'No score to clear.' })
  })

  it('refuses a complete session with 409 (SCR-14, D-231)', async () => {
    const { overrides, url } = setup({ complete: true })
    const response = await request(createSignedInTestApp(overrides)).delete(url())
    expect(response.status).toBe(409)
  })

  it('logs a clear with ids and the game (SCR-19)', async () => {
    const { overrides, url, captured, squad } = setup()
    const app = createSignedInTestApp(overrides)
    await request(app).put(url()).send({ score: 150 })
    await request(app).delete(url())

    const line = captured.records().find((entry) => entry.msg === 'Score cleared')
    expect(line).toMatchObject({ squadId: squad.id, game: 1 })
  })

  it('publishes and drops the cache like a save (D-232)', async () => {
    const { overrides, url, seen, tournament, squad } = setup()
    const app = createSignedInTestApp(overrides)
    await request(app).put(url()).send({ score: 150 })
    const page = `/v1/tournaments/${tournament.id}/squads/${squad.id}/scores`
    expect((await request(app).get(page)).body.pairs[0].bowlers[0].scores[0]).toBe(150)
    seen.length = 0

    await request(app).delete(url())

    expect(seen.map((item) => item.event.kind)).toEqual(['scores'])
    expect((await request(app).get(page)).body.pairs[0].bowlers[0].scores[0]).toBeNull()
  })

  it('drops the cached results of the session on a save and a clear, in both modes (RES-44, D-241)', async () => {
    const { overrides, url, tournament, squad, ann } = setup()
    const app = createSignedInTestApp(overrides)
    const results = (mode: string) =>
      request(app).get(`/v1/tournaments/${tournament.id}/squads/${squad.id}/results?mode=${mode}`)
    const firstTotal = async (mode: string) =>
      (await results(mode)).body.divisions[0]?.rows[0]?.total
    expect(await firstTotal('full-game')).toBeUndefined()
    expect(await firstTotal('live')).toBeUndefined()

    await request(app).put(url(ann.registrationId, 1)).send({ score: 212 })

    expect(await firstTotal('full-game')).toBe(212)
    expect(await firstTotal('live')).toBe(212)

    await request(app).delete(url(ann.registrationId, 1))

    expect(await firstTotal('full-game')).toBeUndefined()
    expect(await firstTotal('live')).toBeUndefined()
  })

  it('needs scores.write (SCR-19, D-96)', async () => {
    const { overrides, url } = setup()
    const app = createTestApp(overrides)
    expect((await request(app).delete(url())).status).toBe(401)
    expect((await request(app).delete(url()).set(apiKeyHeader, testApiKey)).status).toBe(403)
  })
})
