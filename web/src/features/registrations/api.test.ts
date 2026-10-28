import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createRegistration } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { fetchRegistrations } from './api'
import type { RegistrationList } from './types'

const path = '/v1/tournaments/:id/registrations'

function createList(overrides: Partial<RegistrationList> = {}): RegistrationList {
  return {
    registrations: [createRegistration()],
    summary: {
      registrations: 1,
      superSweepers: 0,
      divisions: [{ id: 'd1', number: 1, name: 'Open', entries: 1 }],
      squads: [{ id: 's1', date: '2026-10-24T09:00:00', complete: true, entries: 1 }],
      sweepers: [{ id: 'w1', date: '2026-10-24T18:00:00', complete: false, entries: 0 }],
    },
    ...overrides,
  }
}

function respondWith(body: JsonBodyType) {
  server.use(http.get(path, () => HttpResponse.json(body)))
}

describe('fetchRegistrations', () => {
  it('reads the registrations and the summary (REG-23, REG-24)', async () => {
    const list = createList()
    respondWith(list)

    await expect(fetchRegistrations('t1')).resolves.toEqual(list)
  })

  it('keeps the order sent (REG-23)', async () => {
    const [first, second] = [createRegistration(), createRegistration()]
    respondWith(createList({ registrations: [second, first] }))

    const { registrations } = await fetchRegistrations('t1')

    expect(registrations.map((r) => r.id)).toEqual([second.id, first.id])
  })

  it('asks for the registrations of the tournament it was given (REG-26)', async () => {
    let asked: unknown
    server.use(
      http.get(path, ({ params }) => {
        asked = params.id
        return HttpResponse.json(createList())
      }),
    )

    await fetchRegistrations('abc-123')

    expect(asked).toBe('abc-123')
  })

  it('accepts empty lists (REG-26)', async () => {
    const empty = createList({
      registrations: [],
      summary: { registrations: 0, superSweepers: 0, divisions: [], squads: [], sweepers: [] },
    })
    respondWith(empty)

    await expect(fetchRegistrations('t1')).resolves.toEqual(empty)
  })

  it.each([404, 400])('reports not found for status %i (REG-26)', async (status) => {
    server.use(http.get(path, () => new HttpResponse(null, { status })))

    await expect(fetchRegistrations('t1')).rejects.toBeInstanceOf(TournamentNotFoundError)
  })

  it('reports the status for another failure (REG-26)', async () => {
    server.use(http.get(path, () => new HttpResponse(null, { status: 503 })))

    const failure = await fetchRegistrations('t1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error('Failed to load registrations (503)'))
    expect(failure).not.toBeInstanceOf(TournamentNotFoundError)
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get(path, () => new HttpResponse('<html></html>')))

    await expect(fetchRegistrations('t1')).rejects.toThrow(
      'Failed to load registrations (response is not JSON)',
    )
  })

  it.each([
    ['a bare array', [createRegistration()]],
    ['null', null],
    ['no summary', { registrations: [] }],
    ['no registrations', { summary: createList().summary }],
    ['registrations that is not an array', { ...createList(), registrations: 'none' }],
  ])('rejects %s', async (_label, body) => {
    respondWith(body)

    await expect(fetchRegistrations('t1')).rejects.toThrow('unexpected response')
  })

  it.each([
    ['null', null],
    ['a string', 'Dana'],
    ['an empty object', {}],
  ])('rejects a list that contains %s', async (_label, item) => {
    respondWith({ ...createList(), registrations: [createRegistration(), item] })

    await expect(fetchRegistrations('t1')).rejects.toThrow('unexpected response')
  })

  const wrongRegistration = [
    ['id', { id: 1 }],
    ['divisionId', { divisionId: null }],
    ['divisionName', { divisionName: 1 }],
    ['squadIds', { squadIds: 'a' }],
    ['a squad id that is not text', { squadIds: [1] }],
    ['sweeperIds', { sweeperIds: null }],
    ['a sweeper id that is not text', { sweeperIds: [2] }],
    ['superSweeper', { superSweeper: 'yes' }],
    ['bowler', { bowler: null }],
  ] as const

  it.each(wrongRegistration)('rejects a registration with a wrong %s', async (_name, override) => {
    respondWith({ ...createList(), registrations: [{ ...createRegistration(), ...override }] })

    await expect(fetchRegistrations('t1')).rejects.toThrow('unexpected response')
  })

  it.each(['id', 'name', 'firstName', 'lastName', 'usbcId'])(
    'rejects a bowler with a wrong %s',
    async (name) => {
      const item = createRegistration()
      respondWith({
        ...createList(),
        registrations: [{ ...item, bowler: { ...item.bowler, [name]: 5 } }],
      })

      await expect(fetchRegistrations('t1')).rejects.toThrow('unexpected response')
    },
  )

  it.each(['id', 'divisionId', 'divisionName', 'squadIds', 'sweeperIds', 'superSweeper', 'bowler'])(
    'rejects a registration with %s missing',
    async (name) => {
      const item: Record<string, unknown> = { ...createRegistration() }
      delete item[name]
      respondWith({ ...createList(), registrations: [item] })

      await expect(fetchRegistrations('t1')).rejects.toThrow('unexpected response')
    },
  )

  it.each([
    ['registrations', { registrations: 'many' }],
    ['superSweepers', { superSweepers: null }],
    ['divisions', { divisions: 'none' }],
    [
      'a division with a text number',
      { divisions: [{ id: 'd', number: '1', name: 'x', entries: 1 }] },
    ],
    ['a division with no name', { divisions: [{ id: 'd', number: 1, entries: 1 }] }],
    ['a division with a text id', { divisions: [{ id: 1, number: 1, name: 'x', entries: 1 }] }],
    ['a division with no entries', { divisions: [{ id: 'd', number: 1, name: 'x' }] }],
    ['squads', { squads: 'none' }],
    ['a squad with a bad date', { squads: [{ id: 's', date: 'Sat', complete: true, entries: 1 }] }],
    [
      'a squad with no complete flag',
      { squads: [{ id: 's', date: '2026-10-24T09:00:00', entries: 1 }] },
    ],
    [
      'a sweeper with a text complete flag',
      { sweepers: [{ id: 'w', date: '2026-10-24T09:00:00', complete: 'no', entries: 1 }] },
    ],
    [
      'a squad with a text id',
      { squads: [{ id: 1, date: '2026-10-24T09:00:00', complete: true, entries: 1 }] },
    ],
    [
      'a squad with text entries',
      { squads: [{ id: 's', date: '2026-10-24T09:00:00', complete: true, entries: '1' }] },
    ],
    ['sweepers', { sweepers: null }],
    ['a sweeper with a bad date', { sweepers: [{ id: 'w', date: 5, complete: true, entries: 1 }] }],
  ])('rejects a summary with a wrong %s', async (_name, override) => {
    const list = createList()
    respondWith({ ...list, summary: { ...list.summary, ...override } })

    await expect(fetchRegistrations('t1')).rejects.toThrow('unexpected response')
  })
})
