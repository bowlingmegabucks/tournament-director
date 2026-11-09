import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import {
  AlreadyRegisteredError,
  BowlerNotFoundError,
  DeskRejectedError,
  NoSearchFieldError,
  UsbcIdOnFileError,
  createDeskRegistration,
  fetchBowler,
  searchBowlers,
} from './bowlerApi'
import type { BowlerResponse, DeskRegistrationRequest } from './types'

const filter = { lastName: ' Gon ', firstName: '', email: '', usbcId: '1234-56789' }
const found = {
  id: 'b1',
  name: 'Maria Gonzalez',
  firstName: 'Maria',
  lastName: 'Gonzalez',
  usbcId: '1234-56789',
  city: 'Worcester',
  state: 'MA',
  registered: null,
}
const detail: BowlerResponse = {
  bowler: {
    id: 'b1',
    firstName: 'Maria',
    middleInitial: '',
    lastName: 'Gonzalez',
    suffix: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    email: '',
    phoneNumber: '',
    usbcId: '',
    dateOfBirth: '',
    gender: '',
  },
  registration: null,
}
const request: DeskRegistrationRequest = {
  divisionId: 'd1',
  average: null,
  squadIds: ['s1'],
  sweeperIds: [],
  superSweeper: false,
  bowler: { firstName: 'Ann', lastName: 'Lee' },
}

describe('searchBowlers (BWL-14)', () => {
  it('sends only the filled fields, trimmed, with the tournament', async () => {
    let query = ''
    server.use(
      http.get('/v1/bowlers', ({ request: sent }) => {
        query = new URL(sent.url).search
        return HttpResponse.json({ bowlers: [found], more: false })
      }),
    )

    const result = await searchBowlers(filter, 't1')

    expect(result).toEqual({ bowlers: [found], more: false })
    expect(new URLSearchParams(query).toString()).toBe(
      'tournamentId=t1&lastName=Gon&usbcId=1234-56789',
    )
  })

  it('leaves out a box that holds only spaces', async () => {
    let query = ''
    server.use(
      http.get('/v1/bowlers', ({ request: sent }) => {
        query = new URL(sent.url).search
        return HttpResponse.json({ bowlers: [], more: false })
      }),
    )

    await searchBowlers({ lastName: 'Gon', firstName: '   ', email: ' ', usbcId: '' }, 't1')

    expect(new URLSearchParams(query).toString()).toBe('tournamentId=t1&lastName=Gon')
  })

  it('reads a registered marker', async () => {
    const registered = { ...found, registered: { divisionName: 'Handicap' } }
    server.use(
      http.get('/v1/bowlers', () => HttpResponse.json({ bowlers: [registered], more: true })),
    )

    await expect(searchBowlers(filter, 't1')).resolves.toEqual({
      bowlers: [registered],
      more: true,
    })
  })

  it.each([
    [400, NoSearchFieldError, 'Enter at least one search field.'],
    [401, Error, 'Sign in to search for a bowler.'],
    [403, Error, 'You do not have permission to search for a bowler.'],
    [500, Error, 'Failed to search for bowlers (500)'],
  ])('fails on status %s', async (status, type, message) => {
    server.use(http.get('/v1/bowlers', () => new HttpResponse(null, { status })))

    const failure = searchBowlers(filter, 't1')

    await expect(failure).rejects.toBeInstanceOf(type)
    await expect(failure).rejects.toThrow(message)
  })

  it.each<[string, JsonBodyType]>([
    ['not an object', 'nope'],
    ['no more flag', { bowlers: [found] }],
    ['a bowler list that is not a list', { bowlers: 'x', more: false }],
    ['a bowler with no name', { bowlers: [{ ...found, name: 3 }], more: false }],
    [
      'a registered marker of the wrong shape',
      { bowlers: [{ ...found, registered: {} }], more: false },
    ],
  ])('rejects %s', async (_name, body) => {
    server.use(http.get('/v1/bowlers', () => HttpResponse.json(body)))

    await expect(searchBowlers(filter, 't1')).rejects.toThrow(
      'Failed to search for bowlers (unexpected response)',
    )
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get('/v1/bowlers', () => new HttpResponse('<html>', { status: 200 })))

    await expect(searchBowlers(filter, 't1')).rejects.toThrow(
      'Failed to search for bowlers (response is not JSON)',
    )
  })
})

describe('fetchBowler (D-158, D-165)', () => {
  it('reads the bowler and the registration, asking for this tournament', async () => {
    let query = ''
    server.use(
      http.get('/v1/bowlers/:id', ({ request: sent }) => {
        query = new URL(sent.url).search
        return HttpResponse.json(detail)
      }),
    )

    await expect(fetchBowler('b1', 't 1')).resolves.toEqual(detail)
    expect(query).toBe('?tournamentId=t%201')
  })

  it('reads a registration', async () => {
    const registered: BowlerResponse = {
      ...detail,
      registration: {
        id: 'r1',
        divisionId: 'd1',
        divisionName: 'Handicap',
        average: 182,
        superSweeper: true,
        squadIds: ['s1'],
        sweeperIds: ['w1'],
        hasScores: true,
      },
    }
    server.use(http.get('/v1/bowlers/:id', () => HttpResponse.json(registered)))

    await expect(fetchBowler('b1', 't1')).resolves.toEqual(registered)
  })

  it.each([404, 400])('says not found on %s', async (status) => {
    server.use(http.get('/v1/bowlers/:id', () => new HttpResponse(null, { status })))

    const failure = fetchBowler('b1', 't1')

    await expect(failure).rejects.toBeInstanceOf(BowlerNotFoundError)
    await expect(failure).rejects.toThrow('Bowler not found')
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get('/v1/bowlers/:id', () => new HttpResponse('<html>')))

    await expect(fetchBowler('b1', 't1')).rejects.toThrow(
      'Failed to load the bowler (response is not JSON)',
    )
  })

  it.each(['Male', 'Female', ''] as const)('reads the gender "%s"', async (gender) => {
    const body = { ...detail, bowler: { ...detail.bowler, gender } }
    server.use(http.get('/v1/bowlers/:id', () => HttpResponse.json(body)))

    await expect(fetchBowler('b1', 't1')).resolves.toEqual(body)
  })

  it('fails on another status', async () => {
    server.use(http.get('/v1/bowlers/:id', () => new HttpResponse(null, { status: 500 })))

    await expect(fetchBowler('b1', 't1')).rejects.toThrow('Failed to load the bowler (500)')
  })

  it.each<[string, JsonBodyType]>([
    [
      'a gender that is not one of the three',
      { ...detail, bowler: { ...detail.bowler, gender: 'x' } },
    ],
    ['a missing field', { ...detail, bowler: { ...detail.bowler, city: undefined } }],
    ['a registration of the wrong shape', { ...detail, registration: { id: 'r1' } }],
    [
      'a registration with one id missing',
      {
        ...detail,
        registration: {
          id: 'r1',
          divisionId: 'd',
          divisionName: undefined,
          average: null,
          superSweeper: false,
          hasScores: false,
          squadIds: [],
          sweeperIds: [],
        },
      },
    ],
    [
      'a registration with a super sweeper that is not true or false',
      {
        ...detail,
        registration: {
          id: 'r1',
          divisionId: 'd',
          divisionName: 'n',
          average: null,
          superSweeper: 'yes',
          hasScores: false,
          squadIds: [],
          sweeperIds: [],
        },
      },
    ],
    [
      'a registration with hasScores that is not true or false',
      {
        ...detail,
        registration: {
          id: 'r1',
          divisionId: 'd',
          divisionName: 'n',
          average: null,
          superSweeper: false,
          hasScores: 'no',
          squadIds: [],
          sweeperIds: [],
        },
      },
    ],
    [
      'a registration whose squads are not a list of text',
      {
        ...detail,
        registration: {
          id: 'r1',
          divisionId: 'd',
          divisionName: 'n',
          average: null,
          superSweeper: false,
          hasScores: false,
          squadIds: [1],
          sweeperIds: [],
        },
      },
    ],
    [
      'a registration whose sweepers are not a list of text',
      {
        ...detail,
        registration: {
          id: 'r1',
          divisionId: 'd',
          divisionName: 'n',
          average: null,
          superSweeper: false,
          hasScores: false,
          squadIds: [],
          sweeperIds: 'w1',
        },
      },
    ],
    [
      'an average that is text',
      {
        ...detail,
        registration: {
          id: 'r1',
          divisionId: 'd',
          divisionName: 'n',
          average: 'x',
          superSweeper: false,
          hasScores: false,
          squadIds: [],
          sweeperIds: [],
        },
      },
    ],
  ])('rejects %s', async (_name, body) => {
    server.use(http.get('/v1/bowlers/:id', () => HttpResponse.json(body)))

    await expect(fetchBowler('b1', 't1')).rejects.toThrow(
      'Failed to load the bowler (unexpected response)',
    )
  })
})

describe('createDeskRegistration (D-157)', () => {
  it('posts the request as JSON and reads the id and mode', async () => {
    let sent: unknown
    let type: string | null = null
    server.use(
      http.post('/v1/tournaments/:id/registrations', async ({ request: incoming }) => {
        sent = await incoming.json()
        type = incoming.headers.get('content-type')
        return HttpResponse.json({ registrationId: 'r1', mode: 'appended' }, { status: 201 })
      }),
    )

    await expect(createDeskRegistration('t1', request)).resolves.toEqual({
      registrationId: 'r1',
      mode: 'appended',
    })
    expect(sent).toEqual(request)
    expect(type).toBe('application/json')
  })

  it('throws the field errors of a 400 or a 409 with errors', async () => {
    for (const status of [400, 409]) {
      server.use(
        http.post('/v1/tournaments/:id/registrations', () =>
          HttpResponse.json(
            {
              message: 'First Name is Required',
              errors: { 'bowler.firstName': 'First Name is Required', n: 3 },
            },
            { status },
          ),
        ),
      )

      const failure = createDeskRegistration('t1', request)

      await expect(failure).rejects.toBeInstanceOf(DeskRejectedError)
      await expect(failure).rejects.toMatchObject({ message: 'First Name is Required' })
      await expect(failure).rejects.toHaveProperty('errors', {
        'bowler.firstName': 'First Name is Required',
      })
    }
  })

  it('throws a rejection with a fallback message when the body has none', async () => {
    server.use(
      http.post('/v1/tournaments/:id/registrations', () => HttpResponse.json({}, { status: 400 })),
    )

    await expect(createDeskRegistration('t1', request)).rejects.toMatchObject({
      message: 'The registration was not accepted.',
      errors: {},
    })
  })

  it('throws AlreadyRegisteredError with the existing registration (D-159)', async () => {
    const existing = {
      registrationId: 'r1',
      divisionId: 'd1',
      divisionName: 'Handicap',
      squadIds: ['s1'],
      sweeperIds: [],
    }
    server.use(
      http.post('/v1/tournaments/:id/registrations', () =>
        HttpResponse.json(
          {
            message: 'Bowler is already registered for this tournament.',
            conflict: 'alreadyRegistered',
            existing,
          },
          { status: 409 },
        ),
      ),
    )

    const failure = createDeskRegistration('t1', request)

    await expect(failure).rejects.toBeInstanceOf(AlreadyRegisteredError)
    await expect(failure).rejects.toMatchObject({ existing })
  })

  it('throws UsbcIdOnFileError with the stored bowler (D-161)', async () => {
    server.use(
      http.post('/v1/tournaments/:id/registrations', () =>
        HttpResponse.json(
          {
            message: 'on file',
            conflict: 'usbcIdOnFile',
            bowler: { id: 'b1', name: 'Maria Gonzalez' },
          },
          { status: 409 },
        ),
      ),
    )

    const failure = createDeskRegistration('t1', request)

    await expect(failure).rejects.toBeInstanceOf(UsbcIdOnFileError)
    await expect(failure).rejects.toMatchObject({ bowler: { id: 'b1', name: 'Maria Gonzalez' } })
  })

  it.each<[string, unknown]>([
    ['no division id', { registrationId: 'r', divisionName: 'n', squadIds: [], sweeperIds: [] }],
    ['no division name', { registrationId: 'r', divisionId: 'd', squadIds: [], sweeperIds: [] }],
    [
      'squads that are not text',
      { registrationId: 'r', divisionId: 'd', divisionName: 'n', squadIds: [1], sweeperIds: [] },
    ],
    [
      'sweepers that are not a list',
      { registrationId: 'r', divisionId: 'd', divisionName: 'n', squadIds: [], sweeperIds: 'w' },
    ],
    ['nothing', undefined],
  ])(
    'treats an already-registered conflict with %s as a plain rejection',
    async (_name, existing) => {
      server.use(
        http.post('/v1/tournaments/:id/registrations', () =>
          HttpResponse.json(
            { message: 'x', conflict: 'alreadyRegistered', existing },
            { status: 409 },
          ),
        ),
      )

      await expect(createDeskRegistration('t1', request)).rejects.toBeInstanceOf(DeskRejectedError)
    },
  )

  it.each<[string, unknown]>([
    ['no id', { name: 'Maria' }],
    ['no name', { id: 'b1' }],
    ['nothing', undefined],
  ])('treats a USBC ID conflict with %s as a plain rejection', async (_name, bowler) => {
    server.use(
      http.post('/v1/tournaments/:id/registrations', () =>
        HttpResponse.json({ message: 'x', conflict: 'usbcIdOnFile', bowler }, { status: 409 }),
      ),
    )

    await expect(createDeskRegistration('t1', request)).rejects.toBeInstanceOf(DeskRejectedError)
  })

  it('rejects a refusal body that is not JSON, and a success body that is not JSON', async () => {
    server.use(
      http.post(
        '/v1/tournaments/:id/registrations',
        () => new HttpResponse('<html>', { status: 400 }),
      ),
    )
    await expect(createDeskRegistration('t1', request)).rejects.toThrow(
      'Failed to save the registration (response is not JSON)',
    )

    server.use(
      http.post(
        '/v1/tournaments/:id/registrations',
        () => new HttpResponse('<html>', { status: 201 }),
      ),
    )
    await expect(createDeskRegistration('t1', request)).rejects.toThrow(
      'Failed to save the registration (response is not JSON)',
    )
  })

  it('treats a conflict with a broken body as a plain rejection', async () => {
    server.use(
      http.post('/v1/tournaments/:id/registrations', () =>
        HttpResponse.json(
          { message: 'x', conflict: 'alreadyRegistered', existing: { registrationId: 1 } },
          { status: 409 },
        ),
      ),
    )

    await expect(createDeskRegistration('t1', request)).rejects.toBeInstanceOf(DeskRejectedError)
  })

  it.each([
    [404, TournamentNotFoundError, 'Tournament not found'],
    [401, Error, 'Sign in to add a registration.'],
    [403, Error, 'You do not have permission to add a registration.'],
    [500, Error, 'Failed to save the registration (500)'],
  ])('fails on status %s', async (status, type, message) => {
    server.use(
      http.post('/v1/tournaments/:id/registrations', () => new HttpResponse(null, { status })),
    )

    const failure = createDeskRegistration('t1', request)

    await expect(failure).rejects.toBeInstanceOf(type)
    await expect(failure).rejects.toThrow(message)
  })

  it('tells a missing bowler from a missing tournament by the 404 message', async () => {
    server.use(
      http.post('/v1/tournaments/:id/registrations', () =>
        HttpResponse.json({ message: 'Bowler not found' }, { status: 404 }),
      ),
    )

    await expect(createDeskRegistration('t1', request)).rejects.toBeInstanceOf(BowlerNotFoundError)

    server.use(
      http.post('/v1/tournaments/:id/registrations', () =>
        HttpResponse.json({ message: 'Tournament not found' }, { status: 404 }),
      ),
    )

    await expect(createDeskRegistration('t1', request)).rejects.toBeInstanceOf(
      TournamentNotFoundError,
    )
  })

  it.each<[string, JsonBodyType]>([
    ['no id', { mode: 'created' }],
    ['an unknown mode', { registrationId: 'r1', mode: 'maybe' }],
  ])('rejects a success body with %s', async (_name, body) => {
    server.use(
      http.post('/v1/tournaments/:id/registrations', () =>
        HttpResponse.json(body, { status: 201 }),
      ),
    )

    await expect(createDeskRegistration('t1', request)).rejects.toThrow(
      'Failed to save the registration (unexpected response)',
    )
  })
})
