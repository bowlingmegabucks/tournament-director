import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import {
  completeSession,
  fetchSessionCompleteInfo,
  SessionCompleteRefusedError,
} from './sessionCompleteApi'

describe.each([
  ['squads', 'squad'],
  ['sweepers', 'sweeper'],
] as const)('completeSession, %s (SQD-15, SQD-16, D-192)', (kind, word) => {
  const path = `/v1/tournaments/:id/${kind}/:sessionId/complete`

  it('sends POST for the session of the tournament and reads the zero count', async () => {
    let asked: unknown
    server.use(
      http.post(path, ({ params }) => {
        asked = params
        return HttpResponse.json({ [word]: {}, noShowCount: 3 })
      }),
    )

    await expect(completeSession(kind, 't1', 's1')).resolves.toEqual({ noShowCount: 3 })
    expect(asked).toEqual({ id: 't1', sessionId: 's1' })
  })

  it('counts 0 when the answer has no count, as a sweeper answers (D-191)', async () => {
    server.use(http.post(path, () => HttpResponse.json({ [word]: {} })))

    await expect(completeSession(kind, 't1', 's1')).resolves.toEqual({ noShowCount: 0 })
  })

  it('names the failure when a success is not JSON', async () => {
    server.use(http.post(path, () => new HttpResponse('nope')))

    await expect(completeSession(kind, 't1', 's1')).rejects.toThrow(
      `Failed to complete the ${word} (response is not JSON)`,
    )
  })

  it('throws the reasons of a refusal, the tournament first', async () => {
    const reasons = {
      tournament: 'This tournament is complete and cannot be changed',
      session: `This ${word} is already complete`,
    }
    server.use(
      http.post(path, () =>
        HttpResponse.json(
          {
            message: reasons.tournament,
            errors: { session: reasons.session, tournament: reasons.tournament },
          },
          { status: 409 },
        ),
      ),
    )

    const failure = await completeSession(kind, 't1', 's1').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(SessionCompleteRefusedError)
    expect(failure).toMatchObject({
      message: reasons.tournament,
      reasons: [reasons.tournament, reasons.session],
    })
  })

  it('falls back to the message when a refusal has no known reason', async () => {
    server.use(
      http.post(path, () =>
        HttpResponse.json({ message: 'Nope', errors: { other: 'x' } }, { status: 409 }),
      ),
    )

    await expect(completeSession(kind, 't1', 's1')).rejects.toMatchObject({
      message: 'Nope',
      reasons: ['Nope'],
    })
  })

  it('uses a plain message when a refusal has none', async () => {
    server.use(http.post(path, () => HttpResponse.json({}, { status: 409 })))

    await expect(completeSession(kind, 't1', 's1')).rejects.toMatchObject({
      message: `The ${word} cannot be completed.`,
      reasons: [`The ${word} cannot be completed.`],
    })
  })

  it('names the failure when a refusal is not JSON', async () => {
    server.use(http.post(path, () => new HttpResponse('nope', { status: 409 })))

    await expect(completeSession(kind, 't1', 's1')).rejects.toThrow(
      `Failed to complete the ${word} (response is not JSON)`,
    )
  })

  it.each([
    [404, `This ${word} was not found. It may have been removed.`],
    [401, `Sign in to complete a ${word}.`],
    [403, `You do not have permission to complete a ${word}.`],
    [503, `Failed to complete the ${word} (503)`],
  ])('explains a %s', async (status, message) => {
    server.use(http.post(path, () => new HttpResponse(null, { status })))

    const failure = await completeSession(kind, 't1', 's1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error(message))
    expect(failure).not.toBeInstanceOf(SessionCompleteRefusedError)
  })
})

describe('fetchSessionCompleteInfo (D-194)', () => {
  const squadPath = '/v1/tournaments/:id/squads/:sessionId/complete-info'
  const sweeperPath = '/v1/tournaments/:id/sweepers/:sessionId/complete-info'

  it('reads the four counts of a squad', async () => {
    let asked: unknown
    server.use(
      http.get(squadPath, ({ params }) => {
        asked = params
        return HttpResponse.json({
          completeInfo: { entryCount: 12, noScoreCount: 3, partialCount: 1, games: 5 },
        })
      }),
    )

    await expect(fetchSessionCompleteInfo('squads', 't1', 's1')).resolves.toEqual({
      entryCount: 12,
      noScoreCount: 3,
      partialCount: 1,
      games: 5,
    })
    expect(asked).toEqual({ id: 't1', sessionId: 's1' })
  })

  it('reads only the entry count of a sweeper', async () => {
    server.use(http.get(sweeperPath, () => HttpResponse.json({ completeInfo: { entryCount: 9 } })))

    await expect(fetchSessionCompleteInfo('sweepers', 't1', 's1')).resolves.toEqual({
      entryCount: 9,
    })
  })

  it('names the failure when the body is not JSON', async () => {
    server.use(http.get(squadPath, () => new HttpResponse('nope')))

    await expect(fetchSessionCompleteInfo('squads', 't1', 's1')).rejects.toThrow(
      'Failed to load the squad (response is not JSON)',
    )
  })

  it.each([
    ['squads', squadPath, { completeInfo: { entryCount: '1' } }],
    ['squads', squadPath, { completeInfo: { entryCount: 1, noScoreCount: 0, partialCount: 0 } }],
    ['squads', squadPath, { completeInfo: { entryCount: 1, noScoreCount: 0, games: 3 } }],
    ['squads', squadPath, { completeInfo: { entryCount: 1, partialCount: 0, games: 3 } }],
    ['sweepers', sweeperPath, { completeInfo: {} }],
  ] as const)('rejects a body of the wrong shape (%s)', async (kind, path, body) => {
    server.use(http.get(path, () => HttpResponse.json(body)))

    await expect(fetchSessionCompleteInfo(kind, 't1', 's1')).rejects.toThrow(
      /Failed to load the (squad|sweeper) \(unexpected response\)/,
    )
  })

  it.each([
    [404, 'This squad was not found. It may have been removed.'],
    [503, 'Failed to load the squad (503)'],
  ])('explains a %s', async (status, message) => {
    server.use(http.get(squadPath, () => new HttpResponse(null, { status })))

    await expect(fetchSessionCompleteInfo('squads', 't1', 's1')).rejects.toThrow(message)
  })
})
