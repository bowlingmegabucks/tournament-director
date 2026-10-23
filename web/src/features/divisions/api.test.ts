import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createDivision } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { fetchDivisions } from './api'

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
