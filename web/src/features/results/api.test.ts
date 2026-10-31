import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import {
  createDivisionResult,
  createSquadResults,
  createSquadRow,
  createSweeperResults,
  createSweeperRow,
} from '../../mocks/data'
import { SessionNotFoundError } from '../../shared/session'
import { fetchSquadResults, fetchSweeperResults, ResultsUnavailableError } from './api'

const squadPath = '/v1/tournaments/:id/squads/:sessionId/results'
const sweeperPath = '/v1/tournaments/:id/sweepers/:sessionId/results'

function respondWith(path: string, body: JsonBodyType) {
  server.use(http.get(path, () => HttpResponse.json(body)))
}

const row = createSquadRow({
  group: 'advancer',
  ties: [
    { line: 'cut', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } },
    { line: 'cash', outcome: 'lost', decidedBy: { kind: 'games' } },
  ],
})
const squad = createSquadResults({
  divisions: [
    createDivisionResult({
      entries: 3,
      rows: [row],
      didNotFinish: [
        { registrationId: 'r2', name: 'Bob', total: 445, highGame: 230, games: 2, handicap: 0 },
      ],
      noShows: [{ registrationId: 'r3', name: 'Mike' }],
    }),
  ],
})
const sweeper = createSweeperResults({
  entries: 1,
  cashers: 1,
  cutScore: 600,
  rows: [
    createSweeperRow({
      group: 'casher',
      ties: [{ line: 'cash', outcome: 'full', decidedBy: null }],
    }),
  ],
})

describe('fetchSquadResults', () => {
  it('reads the results of a squad (RES-31)', async () => {
    respondWith(squadPath, squad)

    await expect(fetchSquadResults('t1', 's1')).resolves.toEqual(squad)
  })

  it('asks for the tournament and squad it was given', async () => {
    let asked: unknown
    server.use(
      http.get(squadPath, ({ params }) => {
        asked = params
        return HttpResponse.json(squad)
      }),
    )

    await fetchSquadResults('abc-123', 'def-456')

    expect(asked).toEqual({ id: 'abc-123', sessionId: 'def-456' })
  })

  it.each([404, 400])('reports a missing squad for status %i', async (status) => {
    server.use(http.get(squadPath, () => new HttpResponse(null, { status })))

    const failure = await fetchSquadResults('t1', 's1').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(SessionNotFoundError)
    expect(failure).toHaveProperty('message', 'Squad not found')
  })

  it('carries the API message when the ratio cannot work (D-83)', async () => {
    server.use(
      http.get(squadPath, () =>
        HttpResponse.json({ message: "This squad's finals ratio is 0." }, { status: 422 }),
      ),
    )

    const failure = await fetchSquadResults('t1', 's1').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ResultsUnavailableError)
    expect(failure).toHaveProperty('message', "This squad's finals ratio is 0.")
  })

  it('reports a 422 whose body is not JSON', async () => {
    server.use(http.get(squadPath, () => new HttpResponse('<html></html>', { status: 422 })))

    await expect(fetchSquadResults('t1', 's1')).rejects.toThrow(
      'Failed to load results (response is not JSON)',
    )
  })

  it('has a plain message when a 422 carries none', async () => {
    server.use(http.get(squadPath, () => HttpResponse.json({}, { status: 422 })))

    await expect(fetchSquadResults('t1', 's1')).rejects.toThrow('The results cannot be worked out')
  })

  it('reports the status for another failure', async () => {
    server.use(http.get(squadPath, () => new HttpResponse(null, { status: 503 })))

    const failure = await fetchSquadResults('t1', 's1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error('Failed to load results (503)'))
    expect(failure).not.toBeInstanceOf(SessionNotFoundError)
    expect(failure).not.toBeInstanceOf(ResultsUnavailableError)
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get(squadPath, () => new HttpResponse('<html></html>')))

    await expect(fetchSquadResults('t1', 's1')).rejects.toThrow(
      'Failed to load results (response is not JSON)',
    )
  })

  const division = squad.divisions[0]
  it.each([
    ['null', null],
    ['an empty object', {}],
    ['a bare array', [squad]],
    ['no session', { ...squad, session: undefined }],
    ['a sweeper session', { ...squad, session: { ...squad.session, kind: 'sweeper' } }],
    ['a date that is not a date', { ...squad, session: { ...squad.session, date: 'soon' } }],
    ['no complete flag', { ...squad, session: { ...squad.session, complete: 'no' } }],
    ['no games', { ...squad, session: { ...squad.session, games: undefined } }],
    ['no finals ratio', { ...squad, finalsRatio: undefined }],
    ['no cash ratio', { ...squad, cashRatio: 'five' }],
    ['divisions that is not an array', { ...squad, divisions: 'none' }],
    ['a division with no name', { ...squad, divisions: [{ ...division, name: undefined }] }],
    ['a division with no id', { ...squad, divisions: [{ ...division, id: 7 }] }],
    ['a division with no number', { ...squad, divisions: [{ ...division, number: 'one' }] }],
    ['a division with no entry count', { ...squad, divisions: [{ ...division, entries: null }] }],
    [
      'a division with no showHandicap',
      { ...squad, divisions: [{ ...division, showHandicap: 1 }] },
    ],
    ['a division with no showGames', { ...squad, divisions: [{ ...division, showGames: 'yes' }] }],
    ['a division with no rows', { ...squad, divisions: [{ ...division, rows: undefined }] }],
    ['a row with no name', { ...squad, divisions: [{ ...division, rows: [{ ...row, name: 5 }] }] }],
    [
      'a row with no place',
      { ...squad, divisions: [{ ...division, rows: [{ ...row, place: '1' }] }] },
    ],
    [
      'a row with no total',
      { ...squad, divisions: [{ ...division, rows: [{ ...row, total: null }] }] },
    ],
    [
      'a row with no high game',
      { ...squad, divisions: [{ ...division, rows: [{ ...row, highGame: null }] }] },
    ],
    [
      'a row with no games',
      { ...squad, divisions: [{ ...division, rows: [{ ...row, games: null }] }] },
    ],
    [
      'a row with no registration id',
      { ...squad, divisions: [{ ...division, rows: [{ ...row, registrationId: 1 }] }] },
    ],
    [
      'a row with an unknown group',
      { ...squad, divisions: [{ ...division, rows: [{ ...row, group: 'winner' }] }] },
    ],
    [
      'a row with no handicap',
      { ...squad, divisions: [{ ...division, rows: [{ ...row, handicap: null }] }] },
    ],
    [
      'a row with no earlier flag',
      { ...squad, divisions: [{ ...division, rows: [{ ...row, advancedEarlier: 1 }] }] },
    ],
    [
      'a row with ties that is not a list',
      { ...squad, divisions: [{ ...division, rows: [{ ...row, ties: 'none' }] }] },
    ],
    [
      'a tie on an unknown line',
      {
        ...squad,
        divisions: [
          {
            ...division,
            rows: [{ ...row, ties: [{ line: 'top', outcome: 'won', decidedBy: null }] }],
          },
        ],
      },
    ],
    [
      'a tie with an unknown outcome',
      {
        ...squad,
        divisions: [
          {
            ...division,
            rows: [{ ...row, ties: [{ line: 'cut', outcome: 'drew', decidedBy: null }] }],
          },
        ],
      },
    ],
    [
      'a tie with no decider',
      {
        ...squad,
        divisions: [{ ...division, rows: [{ ...row, ties: [{ line: 'cut', outcome: 'won' }] }] }],
      },
    ],
    [
      'a tie with an unknown decider',
      {
        ...squad,
        divisions: [
          {
            ...division,
            rows: [
              { ...row, ties: [{ line: 'cut', outcome: 'won', decidedBy: { kind: 'luck' } }] },
            ],
          },
        ],
      },
    ],
    [
      'a game decider with no rank',
      {
        ...squad,
        divisions: [
          {
            ...division,
            rows: [
              { ...row, ties: [{ line: 'cut', outcome: 'won', decidedBy: { kind: 'game' } }] },
            ],
          },
        ],
      },
    ],
    [
      'a decider of an unknown kind that has a rank',
      {
        ...squad,
        divisions: [
          {
            ...division,
            rows: [
              {
                ...row,
                ties: [{ line: 'cut', outcome: 'won', decidedBy: { kind: 'luck', rank: 3 } }],
              },
            ],
          },
        ],
      },
    ],
    [
      'a did-not-finish row with no registration id',
      {
        ...squad,
        divisions: [
          {
            ...division,
            didNotFinish: [{ name: 'x', total: 1, highGame: 1, games: 1, handicap: 0 }],
          },
        ],
      },
    ],
    [
      'a did-not-finish row with no name',
      {
        ...squad,
        divisions: [
          {
            ...division,
            didNotFinish: [{ registrationId: 'r', total: 1, highGame: 1, games: 1, handicap: 0 }],
          },
        ],
      },
    ],
    ['no did-not-finish list', { ...squad, divisions: [{ ...division, didNotFinish: undefined }] }],
    [
      'a did-not-finish row with no total',
      {
        ...squad,
        divisions: [
          {
            ...division,
            didNotFinish: [{ registrationId: 'r', name: 'x', highGame: 1, games: 1, handicap: 0 }],
          },
        ],
      },
    ],
    [
      'a did-not-finish row with no handicap',
      {
        ...squad,
        divisions: [
          {
            ...division,
            didNotFinish: [{ registrationId: 'r', name: 'x', total: 1, highGame: 1, games: 1 }],
          },
        ],
      },
    ],
    ['no no-show list', { ...squad, divisions: [{ ...division, noShows: 'none' }] }],
    [
      'a no-show with no name',
      { ...squad, divisions: [{ ...division, noShows: [{ registrationId: 'r' }] }] },
    ],
  ])('rejects %s', async (_label, body) => {
    respondWith(squadPath, body)

    await expect(fetchSquadResults('t1', 's1')).rejects.toThrow(
      'Failed to load results (unexpected response)',
    )
  })
})

describe('fetchSweeperResults', () => {
  it('reads the results of a sweeper from the sweeper path (RES-31)', async () => {
    respondWith(sweeperPath, sweeper)

    await expect(fetchSweeperResults('t1', 's1')).resolves.toEqual(sweeper)
  })

  it('accepts a sweeper with no entries and no cut score (D-77)', async () => {
    const empty = createSweeperResults()
    respondWith(sweeperPath, empty)

    await expect(fetchSweeperResults('t1', 's1')).resolves.toEqual(empty)
  })

  it('names a missing sweeper as one', async () => {
    server.use(http.get(sweeperPath, () => new HttpResponse(null, { status: 404 })))

    await expect(fetchSweeperResults('t1', 's1')).rejects.toThrow('Sweeper not found')
  })

  it('carries the API message when the ratio cannot work (D-83)', async () => {
    server.use(
      http.get(sweeperPath, () =>
        HttpResponse.json({ message: "This sweeper's cash ratio is 0." }, { status: 422 }),
      ),
    )

    await expect(fetchSweeperResults('t1', 's1')).rejects.toBeInstanceOf(ResultsUnavailableError)
  })

  const first = sweeper.rows[0]
  it.each([
    ['a squad session', { ...sweeper, session: { ...sweeper.session, kind: 'squad' } }],
    ['no cash ratio', { ...sweeper, cashRatio: undefined }],
    ['no entry count', { ...sweeper, entries: 'one' }],
    ['no casher count', { ...sweeper, cashers: undefined }],
    ['a cut score that is text', { ...sweeper, cutScore: '600' }],
    ['no cut score field', { ...sweeper, cutScore: undefined }],
    ['rows that is not an array', { ...sweeper, rows: {} }],
    ['a row with an unknown group', { ...sweeper, rows: [{ ...first, group: 'advancer' }] }],
    ['a row with no division', { ...sweeper, rows: [{ ...first, divisionName: undefined }] }],
    ['a row with no bonus pins', { ...sweeper, rows: [{ ...first, bonusPins: null }] }],
    ['a row with no name', { ...sweeper, rows: [{ ...first, name: undefined }] }],
  ])('rejects %s', async (_label, body) => {
    respondWith(sweeperPath, body)

    await expect(fetchSweeperResults('t1', 's1')).rejects.toThrow(
      'Failed to load results (unexpected response)',
    )
  })
})
