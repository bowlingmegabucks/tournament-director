import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createLaneBowler, createLanePage, createLanePair } from '../../mocks/data'
import { fetchLanes, LaneSetupError, SessionNotFoundError } from './api'

const squadPath = '/v1/tournaments/:id/squads/:sessionId/lanes'
const sweeperPath = '/v1/tournaments/:id/sweepers/:sessionId/lanes'

function respondWith(body: JsonBodyType, path = squadPath) {
  server.use(http.get(path, () => HttpResponse.json(body)))
}

const bowler = createLaneBowler({ position: '1A' })
const page = createLanePage({
  pairs: [createLanePair(1, [bowler]), createLanePair(3)],
  unassigned: [createLaneBowler()],
  other: [createLaneBowler({ position: '31A' })],
  divisions: [{ id: 'd1', number: 1, name: 'Open', entries: 3 }],
})

describe('fetchLanes', () => {
  it('reads the lane page of a squad (LAN-10)', async () => {
    respondWith(page)

    await expect(fetchLanes('squad', 't1', 's1')).resolves.toEqual(page)
  })

  it('reads the lane page of a sweeper from the sweeper path (LAN-10, D-60)', async () => {
    const sweeperPage = createLanePage({ session: { ...page.session, kind: 'sweeper' } })
    respondWith(sweeperPage, sweeperPath)

    await expect(fetchLanes('sweeper', 't1', 's1')).resolves.toEqual(sweeperPage)
  })

  it('asks for the tournament and session it was given', async () => {
    let asked: unknown
    server.use(
      http.get(squadPath, ({ params }) => {
        asked = params
        return HttpResponse.json(page)
      }),
    )

    await fetchLanes('squad', 'abc-123', 'def-456')

    expect(asked).toEqual({ id: 'abc-123', sessionId: 'def-456' })
  })

  it('accepts a bowler with no average (LAN-11)', async () => {
    respondWith({ ...page, unassigned: [createLaneBowler({ average: null })] })

    await expect(fetchLanes('squad', 't1', 's1')).resolves.toMatchObject({
      unassigned: [{ average: null }],
    })
  })

  it.each([404, 400])('reports a missing squad for status %i', async (status) => {
    server.use(http.get(squadPath, () => new HttpResponse(null, { status })))

    const failure = await fetchLanes('squad', 't1', 's1').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(SessionNotFoundError)
    expect(failure).toHaveProperty('message', 'Squad not found')
  })

  it('names a missing sweeper as one', async () => {
    server.use(http.get(sweeperPath, () => new HttpResponse(null, { status: 404 })))

    await expect(fetchLanes('sweeper', 't1', 's1')).rejects.toThrow('Sweeper not found')
  })

  it('reports the API message for a session that cannot take lanes (LAN-02)', async () => {
    server.use(
      http.get(squadPath, () =>
        HttpResponse.json(
          { message: 'Bowlers per pair must be 2 to 5 to assign lanes' },
          { status: 422 },
        ),
      ),
    )

    const failure = await fetchLanes('squad', 't1', 's1').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(LaneSetupError)
    expect(failure).toHaveProperty('message', 'Bowlers per pair must be 2 to 5 to assign lanes')
  })

  it('gives a plain message when a 422 has none', async () => {
    server.use(http.get(squadPath, () => HttpResponse.json({}, { status: 422 })))

    await expect(fetchLanes('squad', 't1', 's1')).rejects.toThrow(
      'This session cannot take lane assignments',
    )
  })

  it('reports the status for another failure', async () => {
    server.use(http.get(squadPath, () => new HttpResponse(null, { status: 503 })))

    const failure = await fetchLanes('squad', 't1', 's1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error('Failed to load lane assignments (503)'))
    expect(failure).not.toBeInstanceOf(SessionNotFoundError)
    expect(failure).not.toBeInstanceOf(LaneSetupError)
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get(squadPath, () => new HttpResponse('<html></html>')))

    await expect(fetchLanes('squad', 't1', 's1')).rejects.toThrow(
      'Failed to load lane assignments (response is not JSON)',
    )
  })

  it.each([
    ['null', null],
    ['an empty object', {}],
    ['a bare array', [page]],
    ['no pairs', { ...page, pairs: undefined }],
    ['pairs that is not an array', { ...page, pairs: 'none' }],
    ['no unassigned', { ...page, unassigned: undefined }],
    ['no other', { ...page, other: undefined }],
    ['no divisions', { ...page, divisions: undefined }],
    ['no session', { ...page, session: undefined }],
  ])('rejects %s', async (_label, body) => {
    respondWith(body)

    await expect(fetchLanes('squad', 't1', 's1')).rejects.toThrow(
      'Failed to load lane assignments (unexpected response)',
    )
  })

  const wrongSession = [
    ['id', { id: 1 }],
    ['kind', { kind: 'finals' }],
    ['date', { date: '2026-10-24' }],
    ['complete', { complete: 'no' }],
    ['startingLane', { startingLane: '1' }],
    ['numberOfLanes', { numberOfLanes: '10' }],
    ['maxPerPair', { maxPerPair: '5' }],
  ] as const

  it.each(wrongSession)('rejects a session with a wrong %s', async (_field, override) => {
    respondWith({ ...page, session: { ...page.session, ...override } })

    await expect(fetchLanes('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })

  it.each(wrongSession.map(([name]) => name))('rejects a session with %s missing', async (name) => {
    const session: Record<string, unknown> = { ...page.session }
    delete session[name]
    respondWith({ ...page, session })

    await expect(fetchLanes('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })

  const wrongBowler = [
    ['registrationId', { registrationId: 1 }],
    ['name', { name: null }],
    ['divisionId', { divisionId: 1 }],
    ['divisionName', { divisionName: 1 }],
    ['average', { average: '200' }],
    ['position', { position: 1 }],
    ['pins', { pins: '10' }],
    ['superSweeper', { superSweeper: 'yes' }],
  ] as const

  it.each(wrongBowler)('rejects a bowler with a wrong %s', async (_field, override) => {
    respondWith({ ...page, unassigned: [{ ...createLaneBowler(), ...override }] })

    await expect(fetchLanes('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })

  it.each(wrongBowler.map(([name]) => name))('rejects a bowler with %s missing', async (name) => {
    const item: Record<string, unknown> = { ...createLaneBowler() }
    delete item[name]
    respondWith({ ...page, unassigned: [item] })

    await expect(fetchLanes('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })

  it.each(['pairs', 'other'] as const)('rejects a bad bowler inside %s', async (where) => {
    const bad = { ...createLaneBowler(), pins: 'x' }
    respondWith({
      ...page,
      [where]: where === 'pairs' ? [{ ...createLanePair(1), bowlers: [bad] }] : [bad],
    })

    await expect(fetchLanes('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })

  const wrongPair = [
    ['firstLane', { firstLane: '1' }],
    ['lanes', { lanes: ['1', '2'] }],
    ['capacity', { capacity: '5' }],
    ['bowlers', { bowlers: 'none' }],
  ] as const

  it.each(wrongPair)('rejects a pair with a wrong %s', async (_field, override) => {
    respondWith({ ...page, pairs: [{ ...createLanePair(1), ...override }] })

    await expect(fetchLanes('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })

  it.each(wrongPair.map(([name]) => name))('rejects a pair with %s missing', async (name) => {
    const pair: Record<string, unknown> = { ...createLanePair(1) }
    delete pair[name]
    respondWith({ ...page, pairs: [pair] })

    await expect(fetchLanes('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })

  const wrongDivision = [
    ['id', { id: 1 }],
    ['number', { number: '1' }],
    ['name', { name: 1 }],
    ['entries', { entries: '3' }],
  ] as const

  it.each(wrongDivision)('rejects a division count with a wrong %s', async (_field, override) => {
    respondWith({
      ...page,
      divisions: [{ id: 'd1', number: 1, name: 'Open', entries: 3, ...override }],
    })

    await expect(fetchLanes('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })

  it.each(wrongDivision.map(([name]) => name))(
    'rejects a division count with %s missing',
    async (name) => {
      const item: Record<string, unknown> = { id: 'd1', number: 1, name: 'Open', entries: 3 }
      delete item[name]
      respondWith({ ...page, divisions: [item] })

      await expect(fetchLanes('squad', 't1', 's1')).rejects.toThrow('unexpected response')
    },
  )
})
