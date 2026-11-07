import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createSquad } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { createSquad as postSquad, fetchSquads, SquadRejectedError } from './api'

const path = '/v1/tournaments/:id/squads'

function respondWith(body: JsonBodyType) {
  server.use(http.get(path, () => HttpResponse.json(body)))
}

describe('fetchSquads', () => {
  it('reads the squads in the order sent (SQD-21, SQD-20)', async () => {
    const squads = [
      createSquad({ date: '2026-10-24T09:00:00', complete: true }),
      createSquad({ date: '2026-10-24T13:00:00', entryFee: 60, entryFeeOverridden: true }),
    ]
    respondWith({ squads })

    await expect(fetchSquads('t1')).resolves.toEqual(squads)
  })

  it('asks for the squads of the tournament it was given (SQD-21)', async () => {
    let asked: unknown
    server.use(
      http.get(path, ({ params }) => {
        asked = params.id
        return HttpResponse.json({ squads: [] })
      }),
    )

    await fetchSquads('abc-123')

    expect(asked).toBe('abc-123')
  })

  it('accepts an empty list (SQD-21)', async () => {
    respondWith({ squads: [] })

    await expect(fetchSquads('t1')).resolves.toEqual([])
  })

  it.each([404, 400])('reports not found for status %i', async (status) => {
    server.use(http.get(path, () => new HttpResponse(null, { status })))

    await expect(fetchSquads('t1')).rejects.toBeInstanceOf(TournamentNotFoundError)
  })

  it('reports the status for another failure', async () => {
    server.use(http.get(path, () => new HttpResponse(null, { status: 503 })))

    const failure = await fetchSquads('t1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error('Failed to load squads (503)'))
    expect(failure).not.toBeInstanceOf(TournamentNotFoundError)
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get(path, () => new HttpResponse('<html></html>')))

    await expect(fetchSquads('t1')).rejects.toThrow('Failed to load squads (response is not JSON)')
  })

  it.each([
    ['a bare array', [createSquad()]],
    ['no squads key', {}],
    ['squads that is not an array', { squads: 'none' }],
    ['null', null],
  ])('rejects %s', async (_label, body) => {
    respondWith(body)

    await expect(fetchSquads('t1')).rejects.toThrow('Failed to load squads (unexpected response)')
  })

  it.each([
    ['null', null],
    ['a string', 'Sat'],
    ['an empty object', {}],
  ])('rejects a list that contains %s', async (_label, item) => {
    respondWith({ squads: [createSquad(), item] })

    await expect(fetchSquads('t1')).rejects.toThrow('unexpected response')
  })

  const wrong = [
    ['id', { id: 1 }],
    ['date', { date: 20261024 }],
    ['complete', { complete: 'no' }],
    ['startingLane', { startingLane: '1' }],
    ['numberOfLanes', { numberOfLanes: '24' }],
    ['maxPerPair', { maxPerPair: '4' }],
    ['entryFee', { entryFee: '50' }],
    ['entryFeeOverridden', { entryFeeOverridden: 'yes' }],
    ['finalsRatio', { finalsRatio: null }],
    ['finalsRatioOverridden', { finalsRatioOverridden: 1 }],
    ['cashRatio', { cashRatio: '5' }],
    ['cashRatioOverridden', { cashRatioOverridden: null }],
    ['games', { games: '3' }],
  ] as const

  it.each(['garbage', '2026-10-24', '2026-10-24T09:00:00Z'])(
    'rejects a squad date of %s (SQD-21)',
    async (date) => {
      respondWith({ squads: [{ ...createSquad(), date }] })

      await expect(fetchSquads('t1')).rejects.toThrow('unexpected response')
    },
  )

  it.each(wrong)('rejects a squad with a wrong %s', async (_field, override) => {
    respondWith({ squads: [{ ...createSquad(), ...override }] })

    await expect(fetchSquads('t1')).rejects.toThrow('unexpected response')
  })

  it.each(wrong.map(([name]) => name))('rejects a squad with %s missing', async (name) => {
    const item: Record<string, unknown> = { ...createSquad() }
    delete item[name]
    respondWith({ squads: [item] })

    await expect(fetchSquads('t1')).rejects.toThrow('unexpected response')
  })
})

describe('createSquad (the API call)', () => {
  const postPath = '/v1/tournaments/:id/squads'
  const input = {
    date: '2026-10-24T09:00',
    startingLane: 1,
    numberOfLanes: 24,
    maxPerPair: 4,
    entryFee: null,
    finalsRatio: null,
    cashRatio: null,
  }

  it('posts the squad to its tournament and reads the stored one back (SQD-01)', async () => {
    const stored = createSquad({ date: '2026-10-24T09:00:00' })
    let sent: unknown
    let asked: unknown
    server.use(
      http.post(postPath, async ({ params, request }) => {
        asked = params.id
        sent = await request.json()
        expect(request.headers.get('content-type')).toBe('application/json')
        return HttpResponse.json({ squad: stored }, { status: 201 })
      }),
    )

    await expect(postSquad('t 1', input)).resolves.toEqual(stored)

    expect(asked).toBe('t 1')
    expect(sent).toEqual(input)
  })

  it('throws the field errors of a 400 and ignores keys that are not fields (SQD-04)', async () => {
    server.use(
      http.post(postPath, () =>
        HttpResponse.json(
          {
            message: 'Check the highlighted fields. Max per pair must be between 2 and 5',
            errors: { maxPerPair: 'Max per pair must be between 2 and 5', other: 'x' },
          },
          { status: 400 },
        ),
      ),
    )

    const failure = await postSquad('t1', input).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(SquadRejectedError)
    expect(failure).toMatchObject({
      message: 'Check the highlighted fields. Max per pair must be between 2 and 5',
      errors: { maxPerPair: 'Max per pair must be between 2 and 5' },
      tournament: undefined,
    })
    expect((failure as SquadRejectedError).errors).not.toHaveProperty('other')
  })

  it('throws the date refusal of a 409 under its field (SQD-03)', async () => {
    const reason = 'Squad date must be before tournament end'
    server.use(
      http.post(postPath, () =>
        HttpResponse.json({ message: reason, errors: { date: reason } }, { status: 409 }),
      ),
    )

    const failure = await postSquad('t1', input).catch((error: unknown) => error)

    expect(failure).toMatchObject({ errors: { date: reason }, tournament: undefined })
  })

  it('throws the reason of a complete tournament apart from the fields (D-171)', async () => {
    const reason = 'This tournament is complete and cannot be changed'
    server.use(
      http.post(postPath, () =>
        HttpResponse.json({ message: reason, errors: { tournament: reason } }, { status: 409 }),
      ),
    )

    const failure = await postSquad('t1', input).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(SquadRejectedError)
    expect(failure).toMatchObject({ tournament: reason, errors: {} })
  })

  it('names the failure when a 400 body is not JSON', async () => {
    server.use(http.post(postPath, () => new HttpResponse('nope', { status: 400 })))

    await expect(postSquad('t1', input)).rejects.toThrow(
      'Failed to save the squad (response is not JSON)',
    )
  })

  it('names the failure when a 201 body is not JSON', async () => {
    server.use(http.post(postPath, () => new HttpResponse('nope', { status: 201 })))

    await expect(postSquad('t1', input)).rejects.toThrow(
      'Failed to save the squad (response is not JSON)',
    )
  })

  it('falls back on a plain message when a refusal sends none', async () => {
    server.use(http.post(postPath, () => HttpResponse.json({}, { status: 409 })))

    await expect(postSquad('t1', input)).rejects.toThrow('The squad was not accepted.')
  })

  it.each([
    [404, TournamentNotFoundError, 'Tournament not found'],
    [401, Error, 'Sign in to add a squad.'],
    [403, Error, 'You do not have permission to add a squad.'],
    [500, Error, 'Failed to save the squad (500)'],
  ])('throws a plain error for status %i', async (status, type, message) => {
    server.use(http.post(postPath, () => new HttpResponse(null, { status })))

    const failure = await postSquad('t1', input).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(type)
    expect(failure).toMatchObject({ message })
  })

  it('refuses an answer that is not a squad', async () => {
    server.use(http.post(postPath, () => HttpResponse.json({ squad: { id: 1 } }, { status: 201 })))

    await expect(postSquad('t1', input)).rejects.toThrow(
      'Failed to save the squad (unexpected response)',
    )
  })
})
