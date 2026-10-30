import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { createRecapSheet, createRecapSheets } from '../../mocks/data'
import { LaneSetupError, SessionNotFoundError } from '../lanes/api'
import { fetchRecapSheets } from './api'

const squadPath = '/v1/tournaments/:id/squads/:sessionId/recap-sheets'
const sweeperPath = '/v1/tournaments/:id/sweepers/:sessionId/recap-sheets'

function respondWith(body: JsonBodyType, path = squadPath) {
  server.use(http.get(path, () => HttpResponse.json(body)))
}

const recap = createRecapSheets({ sheets: [createRecapSheet()], withoutLane: 2 })

describe('fetchRecapSheets (RPT-08)', () => {
  it('reads the sheets of a squad', async () => {
    respondWith(recap)

    await expect(fetchRecapSheets('squad', 't1', 's1')).resolves.toEqual(recap)
  })

  it('reads the sheets of a sweeper from the sweeper path', async () => {
    const sweeper = createRecapSheets({ session: { ...recap.session, kind: 'sweeper' } })
    respondWith(sweeper, sweeperPath)

    await expect(fetchRecapSheets('sweeper', 't1', 's1')).resolves.toEqual(sweeper)
  })

  it('asks for the tournament and session it was given', async () => {
    let asked: unknown
    server.use(
      http.get(squadPath, ({ params }) => {
        asked = params
        return HttpResponse.json(recap)
      }),
    )

    await fetchRecapSheets('squad', 'abc-123', 'def-456')

    expect(asked).toEqual({ id: 'abc-123', sessionId: 'def-456' })
  })

  it('accepts a session with no sheets', async () => {
    respondWith(createRecapSheets())

    await expect(fetchRecapSheets('squad', 't1', 's1')).resolves.toMatchObject({ sheets: [] })
  })

  it.each([404, 400])('names a missing squad for a %i', async (status) => {
    server.use(http.get(squadPath, () => new HttpResponse(null, { status })))

    const failure = await fetchRecapSheets('squad', 't1', 's1').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(SessionNotFoundError)
    expect(failure).toHaveProperty('message', 'Squad not found')
  })

  it('names a missing sweeper as one', async () => {
    server.use(http.get(sweeperPath, () => new HttpResponse(null, { status: 404 })))

    await expect(fetchRecapSheets('sweeper', 't1', 's1')).rejects.toThrow('Sweeper not found')
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

    const failure = await fetchRecapSheets('squad', 't1', 's1').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(LaneSetupError)
    expect(failure).toHaveProperty('message', 'Bowlers per pair must be 2 to 5 to assign lanes')
  })

  it('gives a plain message when a 422 has none', async () => {
    server.use(http.get(squadPath, () => HttpResponse.json({}, { status: 422 })))

    await expect(fetchRecapSheets('squad', 't1', 's1')).rejects.toThrow(
      'This session cannot take lane assignments',
    )
  })

  it('reports the status for another failure', async () => {
    server.use(http.get(squadPath, () => new HttpResponse(null, { status: 503 })))

    const failure = await fetchRecapSheets('squad', 't1', 's1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error('Failed to load recap sheets (503)'))
    expect(failure).not.toBeInstanceOf(SessionNotFoundError)
    expect(failure).not.toBeInstanceOf(LaneSetupError)
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get(squadPath, () => new HttpResponse('<html></html>')))

    await expect(fetchRecapSheets('squad', 't1', 's1')).rejects.toThrow(
      'Failed to load recap sheets (response is not JSON)',
    )
  })

  const wrongSheet = [
    ['registrationId', { registrationId: 1 }],
    ['name', { name: null }],
    ['divisionName', { divisionName: 2 }],
    ['position', { position: null }],
    ['handicap', { handicap: '47' }],
    ['cross', { cross: undefined }],
    ['the staggered cross', { cross: { staggered: 'x', same: [] } }],
    ['a staggered lane that is not text', { cross: { staggered: [1], same: [] } }],
    ['the same cross', { cross: { staggered: [], same: undefined } }],
    ['a same lane that is not text', { cross: { staggered: [], same: [4] } }],
  ] as const

  it.each(wrongSheet)('rejects a sheet with a wrong %s', async (_label, change) => {
    respondWith({ ...recap, sheets: [{ ...createRecapSheet(), ...change }] })

    await expect(fetchRecapSheets('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })

  const wrongSession = [
    ['id', { id: 1 }],
    ['kind', { kind: 'finals' }],
    ['date', { date: '2026-10-24' }],
    ['games', { games: '3' }],
    ['complete', { complete: 'no' }],
  ] as const

  it.each(wrongSession)('rejects a session with a wrong %s', async (_label, change) => {
    respondWith({ ...recap, session: { ...recap.session, ...change } })

    await expect(fetchRecapSheets('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })

  it.each([
    ['null', null],
    ['an empty object', {}],
    ['no session', { ...recap, session: undefined }],
    ['no sheets', { ...recap, sheets: undefined }],
    ['sheets that is not an array', { ...recap, sheets: 'none' }],
    ['no withoutLane', { ...recap, withoutLane: undefined }],
  ])('rejects %s', async (_label, body) => {
    respondWith(body)

    await expect(fetchRecapSheets('squad', 't1', 's1')).rejects.toThrow('unexpected response')
  })
})
