import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createSweeper } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { createSweeper as postSweeper, fetchSweepers, SweeperRejectedError } from './api'

const path = '/v1/tournaments/:id/sweepers'
const pins = { divisionId: 'd1', divisionName: 'Open', bonusPinsPerGame: 10 }

function respondWith(body: JsonBodyType) {
  server.use(http.get(path, () => HttpResponse.json(body)))
}

describe('fetchSweepers', () => {
  it('reads the sweepers and their bonus pins in the order sent (SQD-22, DIV-14)', async () => {
    const sweepers = [createSweeper({ bonusPins: [pins] }), createSweeper({ complete: true })]
    respondWith({ sweepers })

    await expect(fetchSweepers('t1')).resolves.toEqual(sweepers)
  })

  it('asks for the sweepers of the tournament it was given (SQD-22)', async () => {
    let asked: unknown
    server.use(
      http.get(path, ({ params }) => {
        asked = params.id
        return HttpResponse.json({ sweepers: [] })
      }),
    )

    await fetchSweepers('abc-123')

    expect(asked).toBe('abc-123')
  })

  it('accepts an empty list (SQD-22)', async () => {
    respondWith({ sweepers: [] })

    await expect(fetchSweepers('t1')).resolves.toEqual([])
  })

  it.each([404, 400])('reports not found for status %i', async (status) => {
    server.use(http.get(path, () => new HttpResponse(null, { status })))

    await expect(fetchSweepers('t1')).rejects.toBeInstanceOf(TournamentNotFoundError)
  })

  it('reports the status for another failure', async () => {
    server.use(http.get(path, () => new HttpResponse(null, { status: 503 })))

    const failure = await fetchSweepers('t1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error('Failed to load sweepers (503)'))
    expect(failure).not.toBeInstanceOf(TournamentNotFoundError)
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get(path, () => new HttpResponse('<html></html>')))

    await expect(fetchSweepers('t1')).rejects.toThrow(
      'Failed to load sweepers (response is not JSON)',
    )
  })

  it.each([
    ['a bare array', [createSweeper()]],
    ['no sweepers key', {}],
    ['sweepers that is not an array', { sweepers: 'none' }],
    ['null', null],
  ])('rejects %s', async (_label, body) => {
    respondWith(body)

    await expect(fetchSweepers('t1')).rejects.toThrow(
      'Failed to load sweepers (unexpected response)',
    )
  })

  it.each([
    ['null', null],
    ['a string', 'Sat'],
    ['an empty object', {}],
  ])('rejects a list that contains %s', async (_label, item) => {
    respondWith({ sweepers: [createSweeper(), item] })

    await expect(fetchSweepers('t1')).rejects.toThrow('unexpected response')
  })

  const wrong = [
    ['id', { id: 1 }],
    ['date', { date: 20261024 }],
    ['complete', { complete: 'no' }],
    ['startingLane', { startingLane: '1' }],
    ['numberOfLanes', { numberOfLanes: '12' }],
    ['maxPerPair', { maxPerPair: '4' }],
    ['entryFee', { entryFee: '25' }],
    ['games', { games: '3' }],
    ['cashRatio', { cashRatio: null }],
    ['bonusPins', { bonusPins: 'none' }],
  ] as const

  it.each(['garbage', '2026-10-24', '2026-10-24T18:00:00Z'])(
    'rejects a sweeper date of %s (SQD-22)',
    async (date) => {
      respondWith({ sweepers: [{ ...createSweeper(), date }] })

      await expect(fetchSweepers('t1')).rejects.toThrow('unexpected response')
    },
  )

  it('rejects bonus pins of 0, which the API leaves out (D-45)', async () => {
    respondWith({
      sweepers: [{ ...createSweeper(), bonusPins: [{ ...pins, bonusPinsPerGame: 0 }] }],
    })

    await expect(fetchSweepers('t1')).rejects.toThrow('unexpected response')
  })

  it.each(wrong)('rejects a sweeper with a wrong %s', async (_field, override) => {
    respondWith({ sweepers: [{ ...createSweeper(), ...override }] })

    await expect(fetchSweepers('t1')).rejects.toThrow('unexpected response')
  })

  it.each(wrong.map(([name]) => name))('rejects a sweeper with %s missing', async (name) => {
    const item: Record<string, unknown> = { ...createSweeper() }
    delete item[name]
    respondWith({ sweepers: [item] })

    await expect(fetchSweepers('t1')).rejects.toThrow('unexpected response')
  })

  it.each([
    ['divisionId', { divisionId: 1 }],
    ['divisionName', { divisionName: null }],
    ['bonusPinsPerGame', { bonusPinsPerGame: '10' }],
    ['a null entry', null],
  ])('rejects bonus pins with a wrong %s', async (_field, override) => {
    const entry = override === null ? null : { ...pins, ...override }
    respondWith({ sweepers: [{ ...createSweeper(), bonusPins: [entry] }] })

    await expect(fetchSweepers('t1')).rejects.toThrow('unexpected response')
  })
})

describe('createSweeper (the API call)', () => {
  const postPath = '/v1/tournaments/:id/sweepers'
  const input = {
    date: '2026-10-24T18:00',
    startingLane: 1,
    numberOfLanes: 24,
    maxPerPair: 4,
    entryFee: 20,
    games: 3,
    cashRatio: 5,
    bonusPins: { d1: 10, d2: null },
  }

  it('posts the sweeper to its tournament and reads the stored one back (SQD-10)', async () => {
    const stored = createSweeper({ bonusPins: [pins] })
    let sent: unknown
    let asked: unknown
    server.use(
      http.post(postPath, async ({ params, request }) => {
        asked = params.id
        sent = await request.json()
        expect(request.headers.get('content-type')).toBe('application/json')
        return HttpResponse.json({ sweeper: stored }, { status: 201 })
      }),
    )

    await expect(postSweeper('t 1', input)).resolves.toEqual(stored)

    expect(asked).toBe('t 1')
    expect(sent).toEqual(input)
  })

  it('throws the field errors of a 400, pin boxes included, and ignores other keys (SQD-13)', async () => {
    server.use(
      http.post(postPath, () =>
        HttpResponse.json(
          {
            message: 'Check the highlighted fields. Games must be between 1 and 99',
            errors: {
              games: 'Games must be between 1 and 99',
              'bonusPins.d1': 'Bonus pins must be between 0 and 99',
              bonusPins: 'Bonus pins must be keyed by division id',
              other: 'x',
              cashRatio: 7,
            },
          },
          { status: 400 },
        ),
      ),
    )

    const failure = await postSweeper('t1', input).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(SweeperRejectedError)
    expect(failure).toMatchObject({
      message: 'Check the highlighted fields. Games must be between 1 and 99',
      errors: {
        games: 'Games must be between 1 and 99',
        'bonusPins.d1': 'Bonus pins must be between 0 and 99',
        bonusPins: 'Bonus pins must be keyed by division id',
      },
      tournament: undefined,
    })
    expect((failure as SweeperRejectedError).errors).not.toHaveProperty('other')
    expect((failure as SweeperRejectedError).errors).not.toHaveProperty('cashRatio')
  })

  it('throws the gone-division refusal of a 409 under bonusPins (D-177)', async () => {
    const reason = 'A division no longer exists. Reload the page'
    server.use(
      http.post(postPath, () =>
        HttpResponse.json({ message: reason, errors: { bonusPins: reason } }, { status: 409 }),
      ),
    )

    const failure = await postSweeper('t1', input).catch((error: unknown) => error)

    expect(failure).toMatchObject({ errors: { bonusPins: reason }, tournament: undefined })
  })

  it('throws the reason of a complete tournament apart from the fields (D-171)', async () => {
    const reason = 'This tournament is complete and cannot be changed'
    server.use(
      http.post(postPath, () =>
        HttpResponse.json({ message: reason, errors: { tournament: reason } }, { status: 409 }),
      ),
    )

    const failure = await postSweeper('t1', input).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(SweeperRejectedError)
    expect(failure).toMatchObject({ tournament: reason, errors: {} })
  })

  it('names the failure when a 400 body is not JSON', async () => {
    server.use(http.post(postPath, () => new HttpResponse('nope', { status: 400 })))

    await expect(postSweeper('t1', input)).rejects.toThrow(
      'Failed to save the sweeper (response is not JSON)',
    )
  })

  it('names the failure when a 201 body is not JSON', async () => {
    server.use(http.post(postPath, () => new HttpResponse('nope', { status: 201 })))

    await expect(postSweeper('t1', input)).rejects.toThrow(
      'Failed to save the sweeper (response is not JSON)',
    )
  })

  it('falls back on a plain message when a refusal sends none, or an errors list that is not one', async () => {
    server.use(http.post(postPath, () => HttpResponse.json({ errors: 'x' }, { status: 409 })))

    await expect(postSweeper('t1', input)).rejects.toThrow('The sweeper was not accepted.')
  })

  it.each([
    [404, TournamentNotFoundError, 'Tournament not found'],
    [401, Error, 'Sign in to add a sweeper.'],
    [403, Error, 'You do not have permission to add a sweeper.'],
    [500, Error, 'Failed to save the sweeper (500)'],
  ])('throws a plain error for status %i', async (status, type, message) => {
    server.use(http.post(postPath, () => new HttpResponse(null, { status })))

    const failure = await postSweeper('t1', input).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(type)
    expect(failure).toMatchObject({ message })
  })

  it('refuses an answer that is not a sweeper', async () => {
    server.use(
      http.post(postPath, () => HttpResponse.json({ sweeper: { id: 1 } }, { status: 201 })),
    )

    await expect(postSweeper('t1', input)).rejects.toThrow(
      'Failed to save the sweeper (unexpected response)',
    )
  })
})
