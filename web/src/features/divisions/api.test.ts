import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createDivision } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import {
  createDivision as postDivision,
  DivisionRejectedError,
  DivisionWarningsError,
  fetchDivisionEditInfo,
  fetchDivisions,
  updateDivision,
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

  it('names the failure when a 400 body is not JSON', async () => {
    server.use(http.post(postPath, () => new HttpResponse('nope', { status: 400 })))

    await expect(postDivision('t1', input)).rejects.toThrow(
      'Failed to save the division (response is not JSON)',
    )
  })

  it('names the failure when a 201 body is not JSON', async () => {
    server.use(http.post(postPath, () => new HttpResponse('nope', { status: 201 })))

    await expect(postDivision('t1', input)).rejects.toThrow(
      'Failed to save the division (response is not JSON)',
    )
  })

  it('uses its own words when a refusal carries no message', async () => {
    server.use(
      http.post(postPath, () => HttpResponse.json({ errors: { name: 'Taken' } }, { status: 409 })),
    )

    await expect(postDivision('t1', input)).rejects.toThrow('The division was not accepted.')
  })

  it('treats warnings with a missing field or message as a plain refusal', async () => {
    server.use(
      http.post(postPath, () =>
        HttpResponse.json(
          { message: 'Hm', warnings: [{ field: 'x' }], errors: {} },
          { status: 409 },
        ),
      ),
    )

    const failure = await postDivision('t1', input).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(DivisionRejectedError)
  })
})

describe('updateDivision (the API call)', () => {
  const patchPath = '/v1/tournaments/:id/divisions/:divisionId'

  it('patches the division of the tournament with only the changes and returns the division (DIV-12)', async () => {
    let seen: { params: unknown; body: unknown; method: string } | undefined
    const division = createDivision({ name: 'Main' })
    server.use(
      http.patch(patchPath, async ({ params, request }) => {
        seen = { params, body: await request.json(), method: request.method }
        return HttpResponse.json({ division })
      }),
    )

    await expect(updateDivision('t 1', 'd/1', { name: 'Main' })).resolves.toEqual(division)

    expect(seen).toEqual({
      params: { id: 't 1', divisionId: 'd/1' },
      body: { name: 'Main' },
      method: 'PATCH',
    })
  })

  it('adds confirmWarnings only when told to (D-129)', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch(patchPath, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ division: createDivision() })
      }),
    )

    await updateDivision('t1', 'd1', { name: 'A' })
    await updateDivision('t1', 'd1', { name: 'A' }, true)

    expect(bodies).toEqual([{ name: 'A' }, { name: 'A', confirmWarnings: true }])
  })

  it('throws DivisionRejectedError with a message per field for 400 and 409', async () => {
    for (const status of [400, 409]) {
      server.use(
        http.patch(patchPath, () =>
          HttpResponse.json(
            { message: 'No', errors: { name: 'A name', minimumAge: 'An age', other: 'x' } },
            { status },
          ),
        ),
      )

      const failure = await updateDivision('t1', 'd1', {}).catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(DivisionRejectedError)
      expect((failure as DivisionRejectedError).errors).toEqual({
        name: 'A name',
        minimumAge: 'An age',
      })
      expect((failure as DivisionRejectedError).tournament).toBeUndefined()
    }
  })

  it('carries a reason that is not about a field as `tournament` (D-149)', async () => {
    server.use(
      http.patch(patchPath, () =>
        HttpResponse.json(
          { message: 'Complete', errors: { tournament: 'This tournament is complete' } },
          { status: 409 },
        ),
      ),
    )

    const failure = await updateDivision('t1', 'd1', {}).catch((error: unknown) => error)

    expect((failure as DivisionRejectedError).tournament).toBe('This tournament is complete')
  })

  it('throws DivisionWarningsError when the API asks to confirm (D-147)', async () => {
    server.use(
      http.patch(patchPath, () =>
        HttpResponse.json(
          { message: 'Confirm', warnings: [{ field: 'minimumAge', message: 'Careful' }] },
          { status: 409 },
        ),
      ),
    )

    const failure = await updateDivision('t1', 'd1', {}).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(DivisionWarningsError)
    expect((failure as DivisionWarningsError).warnings).toEqual([
      { field: 'minimumAge', message: 'Careful' },
    ])
  })

  it.each([
    [401, 'Sign in to edit a division.'],
    [403, 'You do not have permission to edit a division.'],
    [404, 'This division was not found. It may have been removed.'],
    [503, 'Failed to save the division (503)'],
  ])('says what status %i means', async (status, message) => {
    server.use(http.patch(patchPath, () => new HttpResponse(null, { status })))

    await expect(updateDivision('t1', 'd1', {})).rejects.toThrow(message)
  })

  it('sends the body as JSON (DIV-12)', async () => {
    let type: string | null = null
    server.use(
      http.patch(patchPath, ({ request }) => {
        type = request.headers.get('content-type')
        return HttpResponse.json({ division: createDivision() })
      }),
    )

    await updateDivision('t1', 'd1', { name: 'A' })

    expect(type).toBe('application/json')
  })

  it('names the failure when a 409 or a 200 body is not JSON', async () => {
    server.use(http.patch(patchPath, () => new HttpResponse('nope', { status: 409 })))
    await expect(updateDivision('t1', 'd1', {})).rejects.toThrow(
      'Failed to save the division (response is not JSON)',
    )

    server.use(http.patch(patchPath, () => new HttpResponse('nope', { status: 200 })))
    await expect(updateDivision('t1', 'd1', {})).rejects.toThrow(
      'Failed to save the division (response is not JSON)',
    )
  })

  it('rejects a success that is not a division', async () => {
    server.use(http.patch(patchPath, () => HttpResponse.json({ division: { id: 1 } })))

    await expect(updateDivision('t1', 'd1', {})).rejects.toThrow('unexpected response')
  })
})

describe('fetchDivisionEditInfo', () => {
  const infoPath = '/v1/tournaments/:id/divisions/:divisionId/edit-info'

  it('reads the registered count and whether scores exist (D-147, D-148)', async () => {
    let asked: unknown
    server.use(
      http.get(infoPath, ({ params }) => {
        asked = params
        return HttpResponse.json({ editInfo: { registrationCount: 12, hasScores: true } })
      }),
    )

    await expect(fetchDivisionEditInfo('t1', 'd1')).resolves.toEqual({
      registrationCount: 12,
      hasScores: true,
    })
    expect(asked).toEqual({ id: 't1', divisionId: 'd1' })
  })

  it('names the failure when the body is not JSON', async () => {
    server.use(http.get(infoPath, () => new HttpResponse('nope')))

    await expect(fetchDivisionEditInfo('t1', 'd1')).rejects.toThrow(
      'Failed to load the division (response is not JSON)',
    )
  })

  it('says the division was not found for 404, not that the tournament was', async () => {
    server.use(http.get(infoPath, () => new HttpResponse(null, { status: 404 })))

    const failure = await fetchDivisionEditInfo('t1', 'd1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error('This division was not found. It may have been removed.'))
    expect(failure).not.toBeInstanceOf(TournamentNotFoundError)
  })

  it('reports the status for another failure', async () => {
    server.use(http.get(infoPath, () => new HttpResponse(null, { status: 503 })))

    await expect(fetchDivisionEditInfo('t1', 'd1')).rejects.toThrow(
      'Failed to load the division (503)',
    )
  })

  it.each([
    ['no editInfo', {}],
    ['a count that is text', { editInfo: { registrationCount: '3', hasScores: false } }],
    ['scores that are not a boolean', { editInfo: { registrationCount: 3, hasScores: 'no' } }],
  ])('rejects %s', async (_label, body) => {
    server.use(http.get(infoPath, () => HttpResponse.json(body)))

    await expect(fetchDivisionEditInfo('t1', 'd1')).rejects.toThrow('unexpected response')
  })
})
