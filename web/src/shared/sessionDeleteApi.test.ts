import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import {
  deleteSession,
  fetchSessionDeleteInfo,
  SessionDeleteRefusedError,
} from './sessionDeleteApi'

describe.each([
  ['squads', 'squad'],
  ['sweepers', 'sweeper'],
] as const)('deleteSession, %s (SQD-14, D-186)', (kind, word) => {
  const deletePath = `/v1/tournaments/:id/${kind}/:sessionId`

  it('sends DELETE for the session of the tournament and resolves on 204', async () => {
    let asked: unknown
    server.use(
      http.delete(deletePath, ({ params }) => {
        asked = params
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(deleteSession(kind, 't1', 's1')).resolves.toBeUndefined()
    expect(asked).toEqual({ id: 't1', sessionId: 's1' })
  })

  it('throws the reasons of a refusal, the tournament first, then session, entries, scores', async () => {
    const reasons = {
      tournament: 'This tournament is complete and cannot be changed',
      session: `This ${word} is complete and cannot be deleted.`,
      entries: `2 bowlers are entered in this ${word}. Remove them from the ${word} first.`,
      scores: `Scores are saved for this ${word}, so it cannot be deleted.`,
    }
    server.use(
      http.delete(deletePath, () =>
        HttpResponse.json(
          {
            message: reasons.tournament,
            errors: {
              scores: reasons.scores,
              entries: reasons.entries,
              session: reasons.session,
              tournament: reasons.tournament,
            },
          },
          { status: 409 },
        ),
      ),
    )

    const failure = await deleteSession(kind, 't1', 's1').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(SessionDeleteRefusedError)
    expect(failure).toMatchObject({
      message: reasons.tournament,
      reasons: [reasons.tournament, reasons.session, reasons.entries, reasons.scores],
    })
  })

  it('falls back to the message when a refusal has no known reason', async () => {
    server.use(
      http.delete(deletePath, () =>
        HttpResponse.json({ message: 'Nope', errors: { other: 'x' } }, { status: 409 }),
      ),
    )

    await expect(deleteSession(kind, 't1', 's1')).rejects.toMatchObject({
      message: 'Nope',
      reasons: ['Nope'],
    })
  })

  it('uses a plain message when a refusal has none', async () => {
    server.use(http.delete(deletePath, () => HttpResponse.json({}, { status: 409 })))

    await expect(deleteSession(kind, 't1', 's1')).rejects.toMatchObject({
      message: `The ${word} cannot be deleted.`,
      reasons: [`The ${word} cannot be deleted.`],
    })
  })

  it('names the failure when a refusal is not JSON', async () => {
    server.use(http.delete(deletePath, () => new HttpResponse('nope', { status: 409 })))

    await expect(deleteSession(kind, 't1', 's1')).rejects.toThrow(
      `Failed to delete the ${word} (response is not JSON)`,
    )
  })

  it.each([
    [404, `This ${word} was not found. It may have been removed.`],
    [401, `Sign in to delete a ${word}.`],
    [403, `You do not have permission to delete a ${word}.`],
    [503, `Failed to delete the ${word} (503)`],
  ])('explains a %s', async (status, message) => {
    server.use(http.delete(deletePath, () => new HttpResponse(null, { status })))

    const failure = await deleteSession(kind, 't1', 's1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error(message))
    expect(failure).not.toBeInstanceOf(SessionDeleteRefusedError)
  })
})

describe.each([
  ['squads', 'squad'],
  ['sweepers', 'sweeper'],
] as const)('fetchSessionDeleteInfo, %s (D-188)', (kind, word) => {
  const infoPath = `/v1/tournaments/:id/${kind}/:sessionId/delete-info`

  it('reads the entry and score counts', async () => {
    let asked: unknown
    server.use(
      http.get(infoPath, ({ params }) => {
        asked = params
        return HttpResponse.json({ deleteInfo: { entryCount: 12, scoreCount: 3 } })
      }),
    )

    await expect(fetchSessionDeleteInfo(kind, 't1', 's1')).resolves.toEqual({
      entryCount: 12,
      scoreCount: 3,
    })
    expect(asked).toEqual({ id: 't1', sessionId: 's1' })
  })

  it('names the failure when the body is not JSON', async () => {
    server.use(http.get(infoPath, () => new HttpResponse('nope')))

    await expect(fetchSessionDeleteInfo(kind, 't1', 's1')).rejects.toThrow(
      `Failed to load the ${word} (response is not JSON)`,
    )
  })

  it('rejects a body of the wrong shape', async () => {
    server.use(http.get(infoPath, () => HttpResponse.json({ deleteInfo: { entryCount: '1' } })))

    await expect(fetchSessionDeleteInfo(kind, 't1', 's1')).rejects.toThrow(
      `Failed to load the ${word} (unexpected response)`,
    )
  })

  it('says the session was not found for 404', async () => {
    server.use(http.get(infoPath, () => new HttpResponse(null, { status: 404 })))

    await expect(fetchSessionDeleteInfo(kind, 't1', 's1')).rejects.toThrow(
      `This ${word} was not found. It may have been removed.`,
    )
  })

  it('reports the status for another failure', async () => {
    server.use(http.get(infoPath, () => new HttpResponse(null, { status: 503 })))

    await expect(fetchSessionDeleteInfo(kind, 't1', 's1')).rejects.toThrow(
      `Failed to load the ${word} (503)`,
    )
  })
})
