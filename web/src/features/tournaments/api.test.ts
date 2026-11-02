import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createTournament } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import {
  createTournament as postTournament,
  fetchTournament,
  fetchTournaments,
  fetchTournamentSettings,
  TournamentRejectedError,
} from './api'
import type { NewTournament } from './types'

function respondWith(body: JsonBodyType) {
  server.use(http.get('/v1/tournaments', () => HttpResponse.json(body)))
}

const fields = ['id', 'name', 'startDate', 'endDate', 'entryFee', 'bowlingCenter'] as const

describe('fetchTournaments', () => {
  it('reads the vendor list shape (TRN-11)', async () => {
    const tournaments = [createTournament(), createTournament()]
    respondWith({ tournaments })

    await expect(fetchTournaments()).resolves.toEqual(tournaments)
  })

  it('reports the status when the API fails', async () => {
    server.use(http.get('/v1/tournaments', () => new HttpResponse(null, { status: 503 })))

    await expect(fetchTournaments()).rejects.toThrow('Failed to load tournaments (503)')
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get('/v1/tournaments', () => new HttpResponse('<html></html>')))

    await expect(fetchTournaments()).rejects.toThrow(
      'Failed to load tournaments (response is not JSON)',
    )
  })

  it.each([
    ['a bare array', [createTournament()]],
    ['no tournaments key', {}],
    ['tournaments that is not an array', { tournaments: 'none' }],
    ['null', null],
  ])('rejects %s', async (_label, body) => {
    respondWith(body)

    await expect(fetchTournaments()).rejects.toThrow(
      'Failed to load tournaments (unexpected response)',
    )
  })

  it.each([
    ['null', null],
    ['a string', 'Spring Open'],
    ['a number', 7],
    ['an empty object', {}],
  ])('rejects a list that contains %s', async (_label, item) => {
    respondWith({ tournaments: [createTournament(), item] })

    await expect(fetchTournaments()).rejects.toThrow('unexpected response')
  })

  it.each([
    ['id', { id: 1 }],
    ['name', { name: null }],
    ['startDate', { startDate: 20261023 }],
    ['endDate', { endDate: null }],
    ['entryFee', { entryFee: '50.00' }],
    ['bowlingCenter', { bowlingCenter: 7 }],
  ])('rejects a tournament with a wrong %s', async (_field, override) => {
    respondWith({ tournaments: [{ ...createTournament(), ...override }] })

    await expect(fetchTournaments()).rejects.toThrow('unexpected response')
  })

  it.each(fields)('rejects a tournament with no %s', async (name) => {
    const tournament: Record<string, unknown> = { ...createTournament() }
    delete tournament[name]
    respondWith({ tournaments: [tournament] })

    await expect(fetchTournaments()).rejects.toThrow('unexpected response')
  })

  it('accepts an empty list', async () => {
    respondWith({ tournaments: [] })

    await expect(fetchTournaments()).resolves.toEqual([])
  })
})

describe('fetchTournament', () => {
  it('reads one tournament (TRN-15)', async () => {
    const tournament = createTournament()
    server.use(http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })))

    await expect(fetchTournament(tournament.id)).resolves.toEqual(tournament)
  })

  it('asks for the id it was given', async () => {
    let asked: unknown
    server.use(
      http.get('/v1/tournaments/:id', ({ params }) => {
        asked = params.id
        return HttpResponse.json({ tournament: createTournament() })
      }),
    )

    await fetchTournament('abc-123')

    expect(asked).toBe('abc-123')
  })

  it.each([404, 400])('reports not found for status %i (NAV-03)', async (status) => {
    server.use(http.get('/v1/tournaments/:id', () => new HttpResponse(null, { status })))

    await expect(fetchTournament('x')).rejects.toBeInstanceOf(TournamentNotFoundError)
    await expect(fetchTournament('x')).rejects.toThrow('Tournament not found')
  })

  it('reports the status for another failure', async () => {
    server.use(http.get('/v1/tournaments/:id', () => new HttpResponse(null, { status: 500 })))

    const failure = await fetchTournament('x').catch((error: unknown) => error)

    expect(failure).toEqual(new Error('Failed to load tournament (500)'))
    expect(failure).not.toBeInstanceOf(TournamentNotFoundError)
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get('/v1/tournaments/:id', () => new HttpResponse('<html></html>')))

    await expect(fetchTournament('x')).rejects.toThrow(
      'Failed to load tournament (response is not JSON)',
    )
  })

  it.each([
    ['no tournament key', {}],
    ['a tournament that is not a tournament', { tournament: { id: 'x' } }],
  ])('rejects %s', async (_label, body) => {
    server.use(http.get('/v1/tournaments/:id', () => HttpResponse.json(body)))

    await expect(fetchTournament('x')).rejects.toThrow(
      'Failed to load tournament (unexpected response)',
    )
  })
})

const newTournament: NewTournament = {
  name: 'Spring Classic',
  startDate: '2027-03-12',
  endDate: '2027-03-14',
  bowlingCenter: 'Bowl-O-Rama',
  entryFee: 60,
  games: 5,
  finalsRatio: 8,
  cashRatio: 5,
  superSweeperCashRatio: 4,
}

describe('createTournament (TRN-19)', () => {
  it('posts the JSON body and returns the stored tournament', async () => {
    const stored = createTournament({ name: 'Spring Classic' })
    let sent: unknown
    let contentType: string | null = null
    server.use(
      http.post('/v1/tournaments', async ({ request }) => {
        sent = await request.json()
        contentType = request.headers.get('content-type')
        return HttpResponse.json({ tournament: stored }, { status: 201 })
      }),
    )

    await expect(postTournament(newTournament)).resolves.toEqual(stored)
    expect(sent).toEqual(newTournament)
    expect(contentType).toBe('application/json')
  })

  it.each([400, 409])('turns a %i into per-field errors (D-121)', async (status) => {
    server.use(
      http.post('/v1/tournaments', () =>
        HttpResponse.json(
          {
            message: 'Check the highlighted fields.',
            errors: { name: 'Name is required', other: 'x', games: 5 },
          },
          { status },
        ),
      ),
    )

    const error = await postTournament(newTournament).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TournamentRejectedError)
    expect((error as TournamentRejectedError).message).toBe('Check the highlighted fields.')
    // Only form fields with text messages are kept.
    expect((error as TournamentRejectedError).errors).toEqual({ name: 'Name is required' })
  })

  it('still rejects a 400 that has no usable body', async () => {
    server.use(http.post('/v1/tournaments', () => HttpResponse.json({}, { status: 400 })))

    const error = await postTournament(newTournament).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TournamentRejectedError)
    expect((error as TournamentRejectedError).message).toBe('The tournament was not accepted.')
    expect((error as TournamentRejectedError).errors).toEqual({})
  })

  it.each([
    [401, 'Sign in to create a tournament.'],
    [403, 'You do not have permission to create a tournament.'],
    [503, 'Failed to save the tournament (503)'],
  ])('reports a %i', async (status, message) => {
    server.use(http.post('/v1/tournaments', () => new HttpResponse(null, { status })))

    await expect(postTournament(newTournament)).rejects.toThrow(message)
  })

  it.each([
    ['not a tournament', { tournament: { id: 5 } }],
    ['no tournament key', {}],
  ])('rejects a 201 with %s', async (_label, body) => {
    server.use(http.post('/v1/tournaments', () => HttpResponse.json(body, { status: 201 })))

    await expect(postTournament(newTournament)).rejects.toThrow(
      'Failed to save the tournament (unexpected response)',
    )
  })
})

describe('fetchTournamentSettings (TRN-21)', () => {
  const id = '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01'
  const settings = { games: 4, finalsRatio: 7.5, cashRatio: 5, superSweeperCashRatio: 0 }

  it('reads the settings', async () => {
    server.use(http.get(`/v1/tournaments/${id}/settings`, () => HttpResponse.json({ settings })))

    await expect(fetchTournamentSettings(id)).resolves.toEqual(settings)
  })

  it.each([400, 404])('treats a %i as a missing tournament', async (status) => {
    server.use(http.get(`/v1/tournaments/${id}/settings`, () => new HttpResponse(null, { status })))

    await expect(fetchTournamentSettings(id)).rejects.toBeInstanceOf(TournamentNotFoundError)
  })

  it('reports the status when the API fails', async () => {
    server.use(
      http.get(`/v1/tournaments/${id}/settings`, () => new HttpResponse(null, { status: 503 })),
    )

    await expect(fetchTournamentSettings(id)).rejects.toThrow(
      'Failed to load the tournament format (503)',
    )
  })

  it.each([
    ['no settings key', {}],
    ['no super sweeper ratio', { settings: { games: 4, finalsRatio: 7, cashRatio: 5 } }],
    ['no finals ratio', { settings: { games: 4, cashRatio: 5, superSweeperCashRatio: 3 } }],
    ['no cash ratio', { settings: { games: 4, finalsRatio: 7, superSweeperCashRatio: 3 } }],
    ['a text ratio', { settings: { ...settings, cashRatio: '5' } }],
    ['a text game count', { settings: { ...settings, games: '4' } }],
  ])('rejects %s', async (_label, body) => {
    server.use(http.get(`/v1/tournaments/${id}/settings`, () => HttpResponse.json(body)))

    await expect(fetchTournamentSettings(id)).rejects.toThrow(
      'Failed to load the tournament format (unexpected response)',
    )
  })
})
