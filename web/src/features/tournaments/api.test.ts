import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createTournament } from '../../mocks/data'
import { fetchTournaments } from './api'

function respondWith(body: JsonBodyType) {
  server.use(http.get('/tournaments', () => HttpResponse.json(body)))
}

describe('fetchTournaments', () => {
  it('returns the tournaments from the API', async () => {
    const tournaments = [createTournament(), createTournament()]
    respondWith(tournaments)

    await expect(fetchTournaments()).resolves.toEqual(tournaments)
  })

  it('reports the status when the API fails', async () => {
    server.use(http.get('/tournaments', () => new HttpResponse(null, { status: 503 })))

    await expect(fetchTournaments()).rejects.toThrow('Failed to load tournaments (503)')
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get('/tournaments', () => new HttpResponse('<html></html>')))

    await expect(fetchTournaments()).rejects.toThrow('unexpected response')
  })

  it('rejects a body that is not an array', async () => {
    respondWith({ tournaments: [] })

    await expect(fetchTournaments()).rejects.toThrow('unexpected response')
  })

  it.each([
    ['null', null],
    ['a string', 'Spring Open'],
    ['a number', 7],
    ['an empty object', {}],
  ])('rejects a list that contains %s', async (_label, item) => {
    respondWith([createTournament(), item])

    await expect(fetchTournaments()).rejects.toThrow('unexpected response')
  })

  it.each([
    ['id', { id: 1 }],
    ['name', { name: null }],
    ['date', { date: 20260101 }],
    ['entrants', { entrants: '42' }],
  ])('rejects a tournament with a wrong %s', async (_field, override) => {
    respondWith([{ ...createTournament(), ...override }])

    await expect(fetchTournaments()).rejects.toThrow('unexpected response')
  })

  it.each(['id', 'name', 'date', 'entrants'] as const)(
    'rejects a tournament with no %s',
    async (field) => {
      const tournament: Record<string, unknown> = { ...createTournament() }
      delete tournament[field]
      respondWith([tournament])

      await expect(fetchTournaments()).rejects.toThrow('unexpected response')
    },
  )

  it('accepts an empty list', async () => {
    respondWith([])

    await expect(fetchTournaments()).resolves.toEqual([])
  })
})
