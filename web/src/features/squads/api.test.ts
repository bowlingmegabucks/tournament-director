import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createSquad } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { fetchSquads } from './api'

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
  ] as const

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
