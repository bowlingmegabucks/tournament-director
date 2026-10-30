import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createScoreBowler, createScorePage, createScorePair } from '../../mocks/data'
import { SessionNotFoundError } from '../../shared/session'
import { fetchScores } from './api'

const squadPath = '/v1/tournaments/:id/squads/:sessionId/scores'
const sweeperPath = '/v1/tournaments/:id/sweepers/:sessionId/scores'

function respondWith(body: JsonBodyType, path = squadPath) {
  server.use(http.get(path, () => HttpResponse.json(body)))
}

const page = createScorePage({
  pairs: [createScorePair(1, [createScoreBowler({ position: '1A', scores: [200, null, 0] })])],
  noLane: 2,
  other: [createScoreBowler({ position: '99A' })],
})

describe('fetchScores', () => {
  it('reads the scores of a squad (SCR-16)', async () => {
    respondWith(page)

    await expect(fetchScores('squad', 't1', 's1')).resolves.toEqual(page)
  })

  it('reads the scores of a sweeper from the sweeper path (SCR-16)', async () => {
    const sweeperPage = createScorePage({ session: { ...page.session, kind: 'sweeper' } })
    respondWith(sweeperPage, sweeperPath)

    await expect(fetchScores('sweeper', 't1', 's1')).resolves.toEqual(sweeperPage)
  })

  it('asks for the tournament and session it was given', async () => {
    let asked: unknown
    server.use(
      http.get(squadPath, ({ params }) => {
        asked = params
        return HttpResponse.json(page)
      }),
    )

    await fetchScores('squad', 'abc-123', 'def-456')

    expect(asked).toEqual({ id: 'abc-123', sessionId: 'def-456' })
  })

  it.each([404, 400])('reports a missing squad for status %i', async (status) => {
    server.use(http.get(squadPath, () => new HttpResponse(null, { status })))

    const failure = await fetchScores('squad', 't1', 's1').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(SessionNotFoundError)
    expect(failure).toHaveProperty('message', 'Squad not found')
  })

  it('names a missing sweeper as one', async () => {
    server.use(http.get(sweeperPath, () => new HttpResponse(null, { status: 404 })))

    await expect(fetchScores('sweeper', 't1', 's1')).rejects.toThrow('Sweeper not found')
  })

  it('reports the status for another failure', async () => {
    server.use(http.get(squadPath, () => new HttpResponse(null, { status: 503 })))

    const failure = await fetchScores('squad', 't1', 's1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error('Failed to load scores (503)'))
    expect(failure).not.toBeInstanceOf(SessionNotFoundError)
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get(squadPath, () => new HttpResponse('<html></html>')))

    await expect(fetchScores('squad', 't1', 's1')).rejects.toThrow(
      'Failed to load scores (response is not JSON)',
    )
  })

  const bowler = createScoreBowler()
  it.each([
    ['null', null],
    ['an empty object', {}],
    ['a bare array', [page]],
    ['no session', { ...page, session: undefined }],
    ['a session kind that is neither', { ...page, session: { ...page.session, kind: 'league' } }],
    ['a session date that is not a date', { ...page, session: { ...page.session, date: 'soon' } }],
    ['a session with no complete flag', { ...page, session: { ...page.session, complete: 'no' } }],
    ['a session with no games', { ...page, session: { ...page.session, games: undefined } }],
    ['no pairs', { ...page, pairs: undefined }],
    ['pairs that is not an array', { ...page, pairs: 'none' }],
    ['a pair with no lanes', { ...page, pairs: [{ firstLane: 1, bowlers: [bowler] }] }],
    ['a pair with no first lane', { ...page, pairs: [{ lanes: [1, 2], bowlers: [bowler] }] }],
    ['a pair with bad bowlers', { ...page, pairs: [{ firstLane: 1, lanes: [1], bowlers: [{}] }] }],
    ['no noLane count', { ...page, noLane: undefined }],
    ['no other', { ...page, other: undefined }],
    ['a bowler with no name', { ...page, other: [{ ...bowler, name: undefined }] }],
    ['a bowler with no division', { ...page, other: [{ ...bowler, divisionName: undefined }] }],
    ['a bowler with no position', { ...page, other: [{ ...bowler, position: undefined }] }],
    ['scores that is not an array', { ...page, other: [{ ...bowler, scores: 'none' }] }],
    ['a score that is text', { ...page, other: [{ ...bowler, scores: ['200'] }] }],
    ['a bowler with no total', { ...page, other: [{ ...bowler, total: undefined }] }],
    ['a bowler with no registration id', { ...page, other: [{ ...bowler, registrationId: 7 }] }],
  ])('rejects %s', async (_label, body) => {
    respondWith(body)

    await expect(fetchScores('squad', 't1', 's1')).rejects.toThrow(
      'Failed to load scores (unexpected response)',
    )
  })
})
