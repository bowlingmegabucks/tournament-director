import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createTournament } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { fetchTournament, fetchTournaments } from './api'

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
