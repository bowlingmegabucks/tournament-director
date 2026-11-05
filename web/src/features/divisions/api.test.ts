import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createDivision } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import {
  createDivision as postDivision,
  DivisionRejectedError,
  DivisionWarningsError,
  fetchDivisions,
} from './api'

const path = '/v1/tournaments/:id/divisions'

function respondWith(body: JsonBodyType) {
  server.use(http.get(path, () => HttpResponse.json(body)))
}

describe('fetchDivisions', () => {
  it('reads the divisions in the order sent (DIV-12, DIV-13)', async () => {
    const divisions = [
      createDivision({ number: 1, gender: 'Female', handicapPercentage: 90 }),
      createDivision({ number: 2, gender: 'Male' }),
      createDivision({ number: 3 }),
    ]
    respondWith({ divisions })

    await expect(fetchDivisions('t1')).resolves.toEqual(divisions)
  })

  it('asks for the divisions of the tournament it was given (DIV-12)', async () => {
    let asked: unknown
    server.use(
      http.get(path, ({ params }) => {
        asked = params.id
        return HttpResponse.json({ divisions: [] })
      }),
    )

    await fetchDivisions('abc-123')

    expect(asked).toBe('abc-123')
  })

  it('accepts an empty list (DIV-12)', async () => {
    respondWith({ divisions: [] })

    await expect(fetchDivisions('t1')).resolves.toEqual([])
  })

  it.each([404, 400])('reports not found for status %i', async (status) => {
    server.use(http.get(path, () => new HttpResponse(null, { status })))

    await expect(fetchDivisions('t1')).rejects.toBeInstanceOf(TournamentNotFoundError)
  })

  it('reports the status for another failure', async () => {
    server.use(http.get(path, () => new HttpResponse(null, { status: 503 })))

    const failure = await fetchDivisions('t1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error('Failed to load divisions (503)'))
    expect(failure).not.toBeInstanceOf(TournamentNotFoundError)
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get(path, () => new HttpResponse('<html></html>')))

    await expect(fetchDivisions('t1')).rejects.toThrow(
      'Failed to load divisions (response is not JSON)',
    )
  })

  it.each([
    ['a bare array', [createDivision()]],
    ['no divisions key', {}],
    ['divisions that is not an array', { divisions: 'none' }],
    ['null', null],
  ])('rejects %s', async (_label, body) => {
    respondWith(body)

    await expect(fetchDivisions('t1')).rejects.toThrow(
      'Failed to load divisions (unexpected response)',
    )
  })

  it.each([
    ['null', null],
    ['a string', 'Open'],
    ['an empty object', {}],
  ])('rejects a list that contains %s', async (_label, item) => {
    respondWith({ divisions: [createDivision(), item] })

    await expect(fetchDivisions('t1')).rejects.toThrow('unexpected response')
  })

  it.each([
    ['id', { id: 1 }],
    ['number', { number: '1' }],
    ['name', { name: null }],
    ['gender', { gender: 'Other' }],
    ['minimumAge', { minimumAge: '18' }],
    ['maximumAge', { maximumAge: '39' }],
    ['minimumAverage', { minimumAverage: '150' }],
    ['maximumAverage', { maximumAverage: '199' }],
    ['handicapPercentage', { handicapPercentage: '90' }],
    ['handicapBase', { handicapBase: '220' }],
    ['maximumHandicapPerGame', { maximumHandicapPerGame: '40' }],
  ])('rejects a division with a wrong %s', async (_field, override) => {
    respondWith({ divisions: [{ ...createDivision(), ...override }] })

    await expect(fetchDivisions('t1')).rejects.toThrow('unexpected response')
  })

  it.each([
    'id',
    'number',
    'name',
    'gender',
    'minimumAge',
    'maximumAge',
    'minimumAverage',
    'maximumAverage',
    'handicapPercentage',
    'handicapBase',
    'maximumHandicapPerGame',
  ])('rejects a division with no %s', async (name) => {
    const division: Record<string, unknown> = { ...createDivision() }
    delete division[name]
    respondWith({ divisions: [division] })

    await expect(fetchDivisions('t1')).rejects.toThrow('unexpected response')
  })
})

const postPath = '/v1/tournaments/:id/divisions'
const input = {
  name: 'Open',
  gender: null,
  minimumAge: null,
  maximumAge: null,
  minimumAverage: null,
  maximumAverage: null,
  handicapPercentage: null,
  handicapBase: null,
  maximumHandicapPerGame: null,
} as const

describe('createDivision (the API call)', () => {
  it('posts the division to its tournament and reads the stored one back (DIV-12)', async () => {
    const stored = createDivision({ number: 4, name: 'Open' })
    let sent: unknown
    let asked: unknown
    server.use(
      http.post(postPath, async ({ params, request }) => {
        asked = params.id
        sent = await request.json()
        expect(request.headers.get('content-type')).toBe('application/json')
        return HttpResponse.json({ division: stored }, { status: 201 })
      }),
    )

    await expect(postDivision('t 1', input)).resolves.toEqual(stored)

    expect(asked).toBe('t 1')
    expect(sent).toEqual(input)
  })

  it('sends confirmWarnings only when the director agreed (DIV-08, D-142)', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(postPath, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ division: createDivision() }, { status: 201 })
      }),
    )

    await postDivision('t1', input)
    await postDivision('t1', input, true)

    expect(bodies).toEqual([input, { ...input, confirmWarnings: true }])
  })

  it('throws the field errors of a 400 (DIV-02)', async () => {
    server.use(
      http.post(postPath, () =>
        HttpResponse.json(
          {
            message: 'Check the highlighted fields. Name is required',
            errors: { name: 'Name is required', minimumAge: 'Too young', other: 'x' },
          },
          { status: 400 },
        ),
      ),
    )

    const failure = await postDivision('t1', input).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(DivisionRejectedError)
    expect(failure).toMatchObject({
      message: 'Check the highlighted fields. Name is required',
      errors: { name: 'Name is required', minimumAge: 'Too young' },
      tournament: undefined,
    })
    expect((failure as DivisionRejectedError).errors).not.toHaveProperty('other')
  })

  it('throws the reason of a complete tournament apart from the fields (D-143)', async () => {
    const reason = 'This tournament is complete and cannot be changed'
    server.use(
      http.post(postPath, () =>
        HttpResponse.json({ message: reason, errors: { tournament: reason } }, { status: 409 }),
      ),
    )

    const failure = await postDivision('t1', input).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(DivisionRejectedError)
    expect(failure).toMatchObject({ tournament: reason, errors: {} })
  })

  it('throws the warnings of a 409 that asks for a confirm (D-142)', async () => {
    const warnings = [{ field: 'handicapPercentage', message: 'Unusual.' }]
    server.use(
      http.post(postPath, () =>
        HttpResponse.json({ message: 'Confirm to add this division.', warnings }, { status: 409 }),
      ),
    )

    const failure = await postDivision('t1', input).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(DivisionWarningsError)
    expect(failure).toMatchObject({ message: 'Confirm to add this division.', warnings })
  })

  it('treats an empty warnings list as a plain refusal', async () => {
    server.use(
      http.post(postPath, () =>
        HttpResponse.json(
          { message: 'No.', warnings: [], errors: { name: 'Taken' } },
          { status: 409 },
        ),
      ),
    )

    const failure = await postDivision('t1', input).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(DivisionRejectedError)
  })

  it('throws not found for an unknown tournament (DIV-03)', async () => {
    server.use(
      http.post(postPath, () =>
        HttpResponse.json({ message: 'Tournament not found' }, { status: 404 }),
      ),
    )

    await expect(postDivision('t1', input)).rejects.toBeInstanceOf(TournamentNotFoundError)
  })

  it.each([
    [401, 'Sign in to add a division.'],
    [403, 'You do not have permission to add a division.'],
    [500, 'Failed to save the division (500)'],
    [503, 'Failed to save the division (503)'],
  ])('says what a %s means', async (status, message) => {
    server.use(http.post(postPath, () => new HttpResponse(null, { status })))

    await expect(postDivision('t1', input)).rejects.toThrow(message)
  })

  it('refuses a 201 that is not a division', async () => {
    server.use(
      http.post(postPath, () => HttpResponse.json({ division: { id: 5 } }, { status: 201 })),
    )

    await expect(postDivision('t1', input)).rejects.toThrow(
      'Failed to save the division (unexpected response)',
    )
  })
})
