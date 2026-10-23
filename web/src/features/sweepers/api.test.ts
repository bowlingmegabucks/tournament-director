import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createSweeper } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { fetchSweepers } from './api'

const path = '/v1/tournaments/:id/sweepers'
const pins = { divisionId: 'd1', divisionName: 'Open', bonusPinsPerGame: 10 }

function respondWith(body: JsonBodyType) {
  server.use(http.get(path, () => HttpResponse.json(body)))
}

describe('fetchSweepers', () => {
  it('reads the sweepers and their bonus pins in the order sent (SQD-22, DIV-14)', async () => {
    const sweepers = [createSweeper({ bonusPins: [pins] }), createSweeper({ complete: true })]
    respondWith({ sweepers })

    await expect(fetchSweepers('t1')).resolves.toEqual(sweepers)
  })

  it('asks for the sweepers of the tournament it was given (SQD-22)', async () => {
    let asked: unknown
    server.use(
      http.get(path, ({ params }) => {
        asked = params.id
        return HttpResponse.json({ sweepers: [] })
      }),
    )

    await fetchSweepers('abc-123')

    expect(asked).toBe('abc-123')
  })

  it('accepts an empty list (SQD-22)', async () => {
    respondWith({ sweepers: [] })

    await expect(fetchSweepers('t1')).resolves.toEqual([])
  })

  it.each([404, 400])('reports not found for status %i', async (status) => {
    server.use(http.get(path, () => new HttpResponse(null, { status })))

    await expect(fetchSweepers('t1')).rejects.toBeInstanceOf(TournamentNotFoundError)
  })

  it('reports the status for another failure', async () => {
    server.use(http.get(path, () => new HttpResponse(null, { status: 503 })))

    const failure = await fetchSweepers('t1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error('Failed to load sweepers (503)'))
    expect(failure).not.toBeInstanceOf(TournamentNotFoundError)
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get(path, () => new HttpResponse('<html></html>')))

    await expect(fetchSweepers('t1')).rejects.toThrow(
      'Failed to load sweepers (response is not JSON)',
    )
  })

  it.each([
    ['a bare array', [createSweeper()]],
    ['no sweepers key', {}],
    ['sweepers that is not an array', { sweepers: 'none' }],
    ['null', null],
  ])('rejects %s', async (_label, body) => {
    respondWith(body)

    await expect(fetchSweepers('t1')).rejects.toThrow(
      'Failed to load sweepers (unexpected response)',
    )
  })

  it.each([
    ['null', null],
    ['a string', 'Sat'],
    ['an empty object', {}],
  ])('rejects a list that contains %s', async (_label, item) => {
    respondWith({ sweepers: [createSweeper(), item] })

    await expect(fetchSweepers('t1')).rejects.toThrow('unexpected response')
  })

  const wrong = [
    ['id', { id: 1 }],
    ['date', { date: 20261024 }],
    ['complete', { complete: 'no' }],
    ['startingLane', { startingLane: '1' }],
    ['numberOfLanes', { numberOfLanes: '12' }],
    ['maxPerPair', { maxPerPair: '4' }],
    ['entryFee', { entryFee: '25' }],
    ['games', { games: '3' }],
    ['cashRatio', { cashRatio: null }],
    ['bonusPins', { bonusPins: 'none' }],
  ] as const

  it.each(wrong)('rejects a sweeper with a wrong %s', async (_field, override) => {
    respondWith({ sweepers: [{ ...createSweeper(), ...override }] })

    await expect(fetchSweepers('t1')).rejects.toThrow('unexpected response')
  })

  it.each(wrong.map(([name]) => name))('rejects a sweeper with %s missing', async (name) => {
    const item: Record<string, unknown> = { ...createSweeper() }
    delete item[name]
    respondWith({ sweepers: [item] })

    await expect(fetchSweepers('t1')).rejects.toThrow('unexpected response')
  })

  it.each([
    ['divisionId', { divisionId: 1 }],
    ['divisionName', { divisionName: null }],
    ['bonusPinsPerGame', { bonusPinsPerGame: '10' }],
    ['a null entry', null],
  ])('rejects bonus pins with a wrong %s', async (_field, override) => {
    const entry = override === null ? null : { ...pins, ...override }
    respondWith({ sweepers: [{ ...createSweeper(), bonusPins: [entry] }] })

    await expect(fetchSweepers('t1')).rejects.toThrow('unexpected response')
  })
})
