import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createGameBowler,
  createGame,
  createGamePair,
  createGamesView,
} from '../../mocks/gamesData'
import { LaneSetupError, SessionNotFoundError } from '../../shared/session'
import { fetchGames, saveScore, ScoreSaveError, setDnf } from './gamesApi'

const gamesPath = '/v1/tournaments/:id/squads/:sessionId/scores/games'
const view = createGamesView({
  games: [
    createGame(1, [
      createGamePair(1, [createGameBowler({ lane: '1A', score: 200, scores: [200, null, null] })]),
    ]),
  ],
})

describe('fetchGames (SCR-22)', () => {
  it('reads the games of a squad and of a sweeper', async () => {
    server.use(
      http.get(gamesPath, () => HttpResponse.json(view)),
      http.get('/v1/tournaments/:id/sweepers/:sessionId/scores/games', () =>
        HttpResponse.json({ ...view, session: { ...view.session, kind: 'sweeper' } }),
      ),
    )
    await expect(fetchGames('squad', 't1', 's1')).resolves.toEqual(view)
    expect((await fetchGames('sweeper', 't1', 's1')).session.kind).toBe('sweeper')
  })

  it('asks for the ids it was given, encoded', async () => {
    let asked: unknown
    server.use(
      http.get(gamesPath, ({ params }) => {
        asked = params
        return HttpResponse.json(view)
      }),
    )
    await fetchGames('squad', 'a b', 'c/d')
    expect(asked).toEqual({ id: 'a b', sessionId: 'c/d' })
  })

  it.each([404, 400])('reports a missing session for status %i', async (status) => {
    server.use(http.get(gamesPath, () => new HttpResponse(null, { status })))
    await expect(fetchGames('squad', 't1', 's1')).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('reports the setup message for a 422 (LAN-02)', async () => {
    server.use(
      http.get(gamesPath, () =>
        HttpResponse.json({ message: 'Bowlers per pair must be 2 to 5' }, { status: 422 }),
      ),
    )
    const error = await fetchGames('squad', 't1', 's1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LaneSetupError)
    expect((error as Error).message).toBe('Bowlers per pair must be 2 to 5')
  })

  it('uses a fallback setup message when the 422 has none', async () => {
    server.use(http.get(gamesPath, () => HttpResponse.json({}, { status: 422 })))
    await expect(fetchGames('squad', 't1', 's1')).rejects.toThrow(
      'This session cannot take lane assignments',
    )
  })

  it('says a user without the permission may not enter scores (403)', async () => {
    server.use(http.get(gamesPath, () => new HttpResponse(null, { status: 403 })))
    await expect(fetchGames('squad', 't1', 's1')).rejects.toThrow('not allowed to enter scores')
  })

  it('fails on another status, and on a body of the wrong shape', async () => {
    server.use(http.get(gamesPath, () => new HttpResponse(null, { status: 503 })))
    await expect(fetchGames('squad', 't1', 's1')).rejects.toThrow('Failed to load the games (503)')
    server.use(http.get(gamesPath, () => HttpResponse.json({ games: 'no' })))
    await expect(fetchGames('squad', 't1', 's1')).rejects.toThrow('unexpected response')
    server.use(
      http.get(gamesPath, () =>
        HttpResponse.json({ ...view, games: [{ ...view.games[0], pairs: [{ firstLane: 1 }] }] }),
      ),
    )
    await expect(fetchGames('squad', 't1', 's1')).rejects.toThrow('unexpected response')
    server.use(http.get(gamesPath, () => HttpResponse.json({ ...view, skip: 'zigzag' })))
    await expect(fetchGames('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })
})

describe('fetchGames shape checks (SCR-22)', () => {
  const bowler = createGameBowler({ registrationId: 'r1', scores: [200, null] })
  const good = createGamesView({
    games: [createGame(1, [createGamePair(1, [bowler])])],
  })
  const clone = () => structuredClone(good) as unknown as Record<string, unknown>
  type Loose = {
    session: Record<string, unknown>
    games: { pairs: { bowlers: Record<string, unknown>[] }[] }[]
  } & Record<string, unknown>
  const edit = (change: (body: Loose) => void) => () => {
    const body = clone() as Loose
    change(body)
    return body
  }
  const bowlerOf = (body: Loose) => body.games[0]?.pairs[0]?.bowlers[0] ?? {}
  const pairOf = (body: Loose) => (body.games[0]?.pairs[0] ?? {}) as Record<string, unknown>
  const gameOf = (body: Loose) => (body.games[0] ?? {}) as Record<string, unknown>

  const wrong: [string, () => unknown][] = [
    ['a bowler id', edit((b) => (bowlerOf(b).registrationId = 1))],
    ['a bowler name', edit((b) => (bowlerOf(b).name = 1))],
    ['a bowler division', edit((b) => (bowlerOf(b).divisionName = null))],
    ['a bowler lane', edit((b) => (bowlerOf(b).lane = 1))],
    ['a bowler score', edit((b) => (bowlerOf(b).score = '200'))],
    ['a missing bowler score', edit((b) => delete bowlerOf(b).score)],
    ['a bowler scores list', edit((b) => (bowlerOf(b).scores = 'x'))],
    ['a bowler score inside the list', edit((b) => (bowlerOf(b).scores = [200, 'x']))],
    ['a bowler total', edit((b) => (bowlerOf(b).total = '200'))],
    ['a pair first lane', edit((b) => (pairOf(b).firstLane = '1'))],
    ['a pair lanes list', edit((b) => (pairOf(b).lanes = 'x'))],
    ['a pair lane inside the list', edit((b) => (pairOf(b).lanes = [1, 'x']))],
    ['a pair bowlers list', edit((b) => (pairOf(b).bowlers = 'x'))],
    ['a bowler of the wrong shape inside the list', edit((b) => (pairOf(b).bowlers = [{}]))],
    ['a game number', edit((b) => (gameOf(b).game = '1'))],
    ['a game entered count', edit((b) => (gameOf(b).entered = '1'))],
    ['a game total', edit((b) => (gameOf(b).total = '1'))],
    ['a game pairs list', edit((b) => (gameOf(b).pairs = 'x'))],
    ['a pair of the wrong shape inside the list', edit((b) => (gameOf(b).pairs = [{}]))],
    ['a games list', edit((b) => (b.games = 'x' as never))],
    ['a game of the wrong shape inside the list', edit((b) => (b.games = [{}] as never))],
    ['a session id', edit((b) => (b.session.id = 1))],
    ['a session kind', edit((b) => (b.session.kind = 'finals'))],
    ['a session date', edit((b) => (b.session.date = '2026-10-24'))],
    ['a session complete flag', edit((b) => (b.session.complete = 'no'))],
    ['a session games count', edit((b) => (b.session.games = '3'))],
    ['a session', edit((b) => delete (b as Record<string, unknown>).session)],
    ['a without-lane count', edit((b) => (b.withoutLane = '2'))],
    ['a skip', edit((b) => delete b.skip)],
  ]

  it('accepts a bowler whose scores hold nulls and numbers, and either session kind', async () => {
    server.use(http.get(gamesPath, () => HttpResponse.json(good)))
    await expect(fetchGames('squad', 't1', 's1')).resolves.toEqual(good)
    server.use(
      http.get(gamesPath, () =>
        HttpResponse.json({ ...good, session: { ...good.session, kind: 'sweeper' } }),
      ),
    )
    await expect(fetchGames('squad', 't1', 's1')).resolves.toBeDefined()
  })

  it.each(wrong)('rejects %s of the wrong shape', async (_label, make) => {
    server.use(http.get(gamesPath, () => HttpResponse.json(make() as never)))
    await expect(fetchGames('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })
})

const scorePath = '/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/:game'

describe('saveScore (SCR-19, D-228)', () => {
  it('sends the score with PUT to the bowler and game, and returns the answer', async () => {
    let seen: { method: string; body: unknown; params: unknown } | undefined
    server.use(
      http.put(scorePath, async ({ request, params }) => {
        seen = { method: request.method, body: await request.json(), params }
        return HttpResponse.json({ scores: [0, 212, null], total: 212 })
      }),
    )

    const saved = await saveScore('squad', 't1', 's1', 'r1', 2, 212)

    expect(saved).toEqual({ scores: [0, 212, null], total: 212 })
    expect(seen).toEqual({
      method: 'PUT',
      body: { score: 212 },
      params: { id: 't1', sessionId: 's1', registrationId: 'r1', game: '2' },
    })
  })

  it('clears with DELETE and no body when the score is null (D-228)', async () => {
    let seen: { method: string; text: string } | undefined
    server.use(
      http.delete(scorePath, async ({ request }) => {
        seen = { method: request.method, text: await request.text() }
        return HttpResponse.json({ scores: [null, null, null], total: 0 })
      }),
    )

    await expect(saveScore('squad', 't1', 's1', 'r1', 1, null)).resolves.toEqual({
      scores: [null, null, null],
      total: 0,
    })
    expect(seen).toEqual({ method: 'DELETE', text: '' })
  })

  it('uses the sweeper path for a sweeper', async () => {
    server.use(
      http.put('/v1/tournaments/:id/sweepers/:sessionId/scores/:registrationId/:game', () =>
        HttpResponse.json({ scores: [200], total: 200 }),
      ),
    )
    await expect(saveScore('sweeper', 't1', 's1', 'r1', 1, 200)).resolves.toEqual({
      scores: [200],
      total: 200,
    })
  })

  it.each([
    [400, 'Enter a score from 1 to 300.'],
    [409, 'This squad is complete. Scores cannot change.'],
    [404, 'No score to clear.'],
  ])('keeps the API message for status %i', async (status, message) => {
    server.use(http.put(scorePath, () => HttpResponse.json({ message }, { status })))
    const error = await saveScore('squad', 't1', 's1', 'r1', 1, 200).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ScoreSaveError)
    expect(error).toMatchObject({ message, status })
  })

  it('uses a fallback message when the API sends none', async () => {
    server.use(http.put(scorePath, () => new HttpResponse(null, { status: 409 })))
    await expect(saveScore('squad', 't1', 's1', 'r1', 1, 200)).rejects.toThrow(
      'The score was refused.',
    )
    server.use(http.put(scorePath, () => new HttpResponse(null, { status: 404 })))
    await expect(saveScore('squad', 't1', 's1', 'r1', 1, 200)).rejects.toThrow(
      'That score is no longer there.',
    )
  })

  it.each([401, 403])('says the user may not enter scores for %i', async (status) => {
    server.use(http.put(scorePath, () => new HttpResponse(null, { status })))
    await expect(saveScore('squad', 't1', 's1', 'r1', 1, 200)).rejects.toMatchObject({
      message: 'You are not allowed to enter scores.',
      status,
    })
  })

  it('says the connection failed when the request never answers', async () => {
    server.use(http.put(scorePath, () => HttpResponse.error()))
    const error = await saveScore('squad', 't1', 's1', 'r1', 1, 200).catch((e: unknown) => e)
    expect(error).toMatchObject({ message: 'Could not save. Check the connection.' })
    expect((error as ScoreSaveError).status).toBeUndefined()
  })

  it('fails on a server error, and on an answer of the wrong shape', async () => {
    server.use(http.put(scorePath, () => new HttpResponse(null, { status: 500 })))
    await expect(saveScore('squad', 't1', 's1', 'r1', 1, 200)).rejects.toMatchObject({
      message: 'Could not save. Try again.',
      status: 500,
    })
    server.use(http.put(scorePath, () => HttpResponse.json({ scores: 'no' })))
    await expect(saveScore('squad', 't1', 's1', 'r1', 1, 200)).rejects.toThrow(
      'unexpected response',
    )
  })
})

describe('saveScore request and messages', () => {
  it('says the body is JSON', async () => {
    let type: string | null | undefined
    server.use(
      http.put(scorePath, ({ request }) => {
        type = request.headers.get('content-type')
        return HttpResponse.json({ scores: [200], total: 200 })
      }),
    )

    await saveScore('squad', 't1', 's1', 'r1', 1, 200)

    expect(type).toBe('application/json')
  })

  it('uses the fallback when the API message is empty or not text', async () => {
    server.use(http.put(scorePath, () => HttpResponse.json({ message: '' }, { status: 409 })))
    await expect(saveScore('squad', 't1', 's1', 'r1', 1, 200)).rejects.toThrow(
      'The score was refused.',
    )
    server.use(http.put(scorePath, () => HttpResponse.json({ message: 7 }, { status: 409 })))
    await expect(saveScore('squad', 't1', 's1', 'r1', 1, 200)).rejects.toThrow(
      'The score was refused.',
    )
  })

  it('refuses an answer whose scores are right but whose total is not a number', async () => {
    server.use(http.put(scorePath, () => HttpResponse.json({ scores: [200], total: 'x' })))
    await expect(saveScore('squad', 't1', 's1', 'r1', 1, 200)).rejects.toThrow(
      'Could not save (unexpected response).',
    )
    server.use(http.put(scorePath, () => HttpResponse.json({ scores: ['x'], total: 200 })))
    await expect(saveScore('squad', 't1', 's1', 'r1', 1, 200)).rejects.toThrow(
      'Could not save (unexpected response).',
    )
  })
})

describe('setDnf (SCR-24, D-248, D-249)', () => {
  const dnfPath = '/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/dnf'

  it('flags with PUT and takes the flag off with DELETE', async () => {
    const seen: { method: string; params: unknown }[] = []
    server.use(
      http.put(dnfPath, ({ request, params }) => {
        seen.push({ method: request.method, params })
        return new HttpResponse(null, { status: 204 })
      }),
      http.delete(dnfPath, ({ request, params }) => {
        seen.push({ method: request.method, params })
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await setDnf('squad', 't1', 's1', 'r1', true)
    await setDnf('squad', 't1', 's1', 'r1', false)

    const params = { id: 't1', sessionId: 's1', registrationId: 'r1' }
    expect(seen).toEqual([
      { method: 'PUT', params },
      { method: 'DELETE', params },
    ])
  })

  it('uses the sweeper path for a sweeper', async () => {
    let hit = false
    server.use(
      http.put('/v1/tournaments/:id/sweepers/:sessionId/scores/:registrationId/dnf', () => {
        hit = true
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await setDnf('sweeper', 't1', 's1', 'r1', true)

    expect(hit).toBe(true)
  })

  it.each([401, 403])('says the user may not enter scores for %i', async (status) => {
    server.use(http.put(dnfPath, () => new HttpResponse(null, { status })))

    await expect(setDnf('squad', 't1', 's1', 'r1', true)).rejects.toMatchObject({
      message: 'You are not allowed to enter scores.',
      status,
    })
  })

  it.each([400, 404, 409])('keeps the API message for status %i', async (status) => {
    server.use(http.put(dnfPath, () => HttpResponse.json({ message: 'No score yet.' }, { status })))

    const error = await setDnf('squad', 't1', 's1', 'r1', true).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ScoreSaveError)
    expect(error).toMatchObject({ message: 'No score yet.', status })
  })

  it('uses a fallback message when the API sends none', async () => {
    server.use(http.put(dnfPath, () => new HttpResponse(null, { status: 409 })))

    await expect(setDnf('squad', 't1', 's1', 'r1', true)).rejects.toThrow(
      'Could not change did not finish.',
    )
  })

  it('says to try again on a server error, and that the connection failed when nothing answers', async () => {
    server.use(http.put(dnfPath, () => new HttpResponse(null, { status: 500 })))
    await expect(setDnf('squad', 't1', 's1', 'r1', true)).rejects.toMatchObject({
      message: 'Could not save. Try again.',
      status: 500,
    })

    server.use(http.put(dnfPath, () => HttpResponse.error()))
    const error = await setDnf('squad', 't1', 's1', 'r1', true).catch((e: unknown) => e)
    expect(error).toMatchObject({ message: 'Could not save. Check the connection.' })
    expect((error as ScoreSaveError).status).toBeUndefined()
  })
})
