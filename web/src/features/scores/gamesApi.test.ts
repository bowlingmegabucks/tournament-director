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
import { fetchGames, saveScore, ScoreSaveError } from './gamesApi'

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
