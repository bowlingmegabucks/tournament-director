import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createEditInfo } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { DeskRejectedError } from './bowlerApi'
import {
  ConfirmWarningsError,
  fetchEditInfo,
  patchRegistration,
  RegistrationChangedError,
  RegistrationNotFoundError,
} from './editApi'

const path = '/v1/tournaments/t1/registrations/r1'

describe('fetchEditInfo (D-197)', () => {
  it('returns the registration, the bowler, and the locks, asking for the right path', async () => {
    const info = createEditInfo()
    let asked = ''
    server.use(
      http.get(`${path}/edit-info`, ({ request }) => {
        asked = new URL(request.url).pathname
        return HttpResponse.json(info)
      }),
    )

    expect(await fetchEditInfo('t1', 'r1')).toEqual(info)
    expect(asked).toBe(`${path}/edit-info`)
  })

  it('encodes the ids in the path', async () => {
    let asked = ''
    server.use(
      http.get('/v1/tournaments/:id/registrations/:rid/edit-info', ({ request }) => {
        asked = new URL(request.url).pathname
        return HttpResponse.json(createEditInfo())
      }),
    )

    await fetchEditInfo('a/b', 'c d')

    expect(asked).toBe('/v1/tournaments/a%2Fb/registrations/c%20d/edit-info')
  })

  it.each([
    [
      'a registration that is not there',
      404,
      { message: 'Registration not found' },
      RegistrationNotFoundError,
    ],
    [
      'a tournament that is not there',
      404,
      { message: 'Tournament not found' },
      TournamentNotFoundError,
    ],
    ['an id that is not valid', 400, { message: 'bad' }, RegistrationNotFoundError],
  ])('throws for %s', async (_name, status, body, expected) => {
    server.use(http.get(`${path}/edit-info`, () => HttpResponse.json(body, { status })))

    await expect(fetchEditInfo('t1', 'r1')).rejects.toBeInstanceOf(expected)
  })

  it.each([
    [401, 'Sign in to edit a registration.'],
    [403, 'You do not have permission to edit a registration.'],
    [500, 'Failed to load the registration (500)'],
  ])('says what went wrong for %i', async (status, message) => {
    server.use(http.get(`${path}/edit-info`, () => new HttpResponse(null, { status })))

    await expect(fetchEditInfo('t1', 'r1')).rejects.toThrow(message)
  })

  it('refuses a body of the wrong shape', async () => {
    server.use(
      http.get(`${path}/edit-info`, () => HttpResponse.json({ ...createEditInfo(), locks: {} })),
    )

    await expect(fetchEditInfo('t1', 'r1')).rejects.toThrow(
      'Failed to load the registration (unexpected response)',
    )
  })
})

describe('patchRegistration (D-197, D-199, D-201)', () => {
  it('sends the request as JSON and returns the counts', async () => {
    let sent: unknown
    let method = ''
    server.use(
      http.patch(path, async ({ request }) => {
        method = request.method
        sent = await request.json()
        return HttpResponse.json({ registrationId: 'r1', added: 1, removed: 2 })
      }),
    )

    const result = await patchRegistration('t1', 'r1', { addSquadIds: ['s1'], average: null })

    expect(result).toEqual({ registrationId: 'r1', added: 1, removed: 2 })
    expect(method).toBe('PATCH')
    expect(sent).toEqual({ addSquadIds: ['s1'], average: null })
  })

  it('throws DeskRejectedError with a message per field for a 400', async () => {
    server.use(
      http.patch(path, () =>
        HttpResponse.json(
          { message: 'Invalid Email', errors: { 'bowler.email': 'Invalid Email', average: 7 } },
          { status: 400 },
        ),
      ),
    )

    const error = await patchRegistration('t1', 'r1', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DeskRejectedError)
    expect((error as DeskRejectedError).errors).toEqual({ 'bowler.email': 'Invalid Email' })
    expect((error as DeskRejectedError).message).toBe('Invalid Email')
  })

  it('throws DeskRejectedError for a 409 with errors, such as a complete tournament (D-130)', async () => {
    server.use(
      http.patch(path, () =>
        HttpResponse.json(
          {
            message: 'This tournament is complete.',
            errors: { form: 'This tournament is complete.' },
          },
          { status: 409 },
        ),
      ),
    )

    const error = await patchRegistration('t1', 'r1', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DeskRejectedError)
    expect((error as DeskRejectedError).errors).toEqual({ form: 'This tournament is complete.' })
  })

  it('throws RegistrationChangedError with the current registration for a 409 changed (D-199)', async () => {
    const existing = {
      registrationId: 'r1',
      divisionId: 'd1',
      divisionName: 'Handicap',
      squadIds: ['s1'],
      sweeperIds: [],
    }
    server.use(
      http.patch(path, () =>
        HttpResponse.json(
          {
            message: 'This registration changed. Review and save again.',
            conflict: 'changed',
            existing,
          },
          { status: 409 },
        ),
      ),
    )

    const error = await patchRegistration('t1', 'r1', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(RegistrationChangedError)
    expect((error as RegistrationChangedError).existing).toEqual(existing)
    expect((error as RegistrationChangedError).message).toBe(
      'This registration changed. Review and save again.',
    )
  })

  it('still throws RegistrationChangedError when the current registration is not readable', async () => {
    server.use(
      http.patch(path, () =>
        HttpResponse.json(
          { message: 'changed', conflict: 'changed', existing: 5 },
          { status: 409 },
        ),
      ),
    )

    const error = await patchRegistration('t1', 'r1', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(RegistrationChangedError)
    expect((error as RegistrationChangedError).existing).toBeUndefined()
  })

  it('throws ConfirmWarningsError with the warnings for a 409 with warnings (D-201)', async () => {
    server.use(
      http.patch(path, () =>
        HttpResponse.json(
          {
            message: 'Confirm these changes to save them.',
            warnings: [
              { field: 'average', message: 'Handicap and results will change.' },
              { field: 7, message: 'skipped' },
              'skipped',
            ],
          },
          { status: 409 },
        ),
      ),
    )

    const error = await patchRegistration('t1', 'r1', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConfirmWarningsError)
    expect((error as ConfirmWarningsError).warnings).toEqual([
      { field: 'average', message: 'Handicap and results will change.' },
    ])
  })

  it('falls back to a plain refusal for a 409 with neither errors nor warnings', async () => {
    server.use(http.patch(path, () => HttpResponse.json({ warnings: 'nope' }, { status: 409 })))

    const error = await patchRegistration('t1', 'r1', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DeskRejectedError)
    expect((error as DeskRejectedError).message).toBe('The change was not accepted.')
    expect((error as DeskRejectedError).errors).toEqual({})
  })

  it.each([
    [
      'a registration that is not there',
      { message: 'Registration not found' },
      RegistrationNotFoundError,
    ],
    [
      'a tournament that is not there',
      { message: 'Tournament not found' },
      TournamentNotFoundError,
    ],
  ])('throws for %s', async (_name, body, expected) => {
    server.use(http.patch(path, () => HttpResponse.json(body, { status: 404 })))

    await expect(patchRegistration('t1', 'r1', {})).rejects.toBeInstanceOf(expected)
  })

  it('throws for a 404 with no body, as a missing tournament', async () => {
    server.use(http.patch(path, () => new HttpResponse(null, { status: 404 })))

    await expect(patchRegistration('t1', 'r1', {})).rejects.toBeInstanceOf(TournamentNotFoundError)
  })

  it.each([
    [401, 'Sign in to edit a registration.'],
    [403, 'You do not have permission to edit a registration.'],
    [500, 'Failed to save the registration (500)'],
  ])('says what went wrong for %i', async (status, message) => {
    server.use(http.patch(path, () => new HttpResponse(null, { status })))

    await expect(patchRegistration('t1', 'r1', {})).rejects.toThrow(message)
  })

  it('refuses a success body of the wrong shape', async () => {
    server.use(http.patch(path, () => HttpResponse.json({ registrationId: 'r1', added: 'x' })))

    await expect(patchRegistration('t1', 'r1', {})).rejects.toThrow(
      'Failed to save the registration (unexpected response)',
    )
  })
})
