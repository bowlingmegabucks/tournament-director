import { describe, expect, it } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import {
  createAtLargeDivision,
  createAtLargeResults,
  createAtLargeRow,
  createDivisionResult,
  createSeedingDivision,
  createSeedingResults,
  createSeedingRow,
  createSuperSweeperResults,
  createSuperSweeperRow,
  createSquadResults,
  createSquadRow,
  createSweeperResults,
  createSweeperRow,
} from '../../mocks/data'
import { SessionNotFoundError } from '../../shared/session'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import {
  fetchAtLarge,
  fetchSeeding,
  fetchSquadResults,
  fetchSuperSweeper,
  fetchSweeperResults,
  ResultsUnavailableError,
} from './api'

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

const tie = { line: 'cut', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } } as const

describe.each([
  {
    name: 'fetchAtLarge',
    path: '/v1/tournaments/:id/at-large',
    fetch: fetchAtLarge,
    valid: createAtLargeResults({
      divisions: [createAtLargeDivision({ rows: [createAtLargeRow({ ties: [tie] })] })],
    }),
    empty: createAtLargeResults(),
  },
  {
    name: 'fetchSeeding',
    path: '/v1/tournaments/:id/seeding',
    fetch: fetchSeeding,
    valid: createSeedingResults({
      divisions: [createSeedingDivision({ rows: [createSeedingRow({ ties: [tie] })] })],
    }),
    empty: createSeedingResults(),
  },
  {
    name: 'fetchSuperSweeper',
    path: '/v1/tournaments/:id/super-sweeper',
    fetch: fetchSuperSweeper,
    valid: createSuperSweeperResults({
      cutScore: 1200,
      rows: [
        createSuperSweeperRow({
          sweeperTotals: [600, null],
          ties: [{ line: 'cash', outcome: 'full', decidedBy: null }],
          flags: [{ kind: 'missed', sweeperId: 's1', gamesBowled: 0 }],
        }),
      ],
    }),
    empty: createSuperSweeperResults(),
  },
])('$name', ({ path, fetch: load, valid, empty }) => {
  it('reads the results (RES-37)', async () => {
    respondWith(path, valid)

    await expect(load('t1')).resolves.toEqual(valid)
  })

  it('accepts results with nobody in them (D-77)', async () => {
    respondWith(path, empty)

    await expect(load('t1')).resolves.toEqual(empty)
  })

  it('asks for the tournament it was given', async () => {
    let asked: unknown
    server.use(
      http.get(path, ({ params }) => {
        asked = params
        return HttpResponse.json(valid)
      }),
    )

    await load('abc-123')

    expect(asked).toEqual({ id: 'abc-123' })
  })

  it.each([404, 400])('reports a missing tournament for status %i', async (status) => {
    server.use(http.get(path, () => new HttpResponse(null, { status })))

    const failure = await load('t1').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(TournamentNotFoundError)
  })

  it('carries the API message when the ratio cannot work (D-93)', async () => {
    server.use(
      http.get(path, () => HttpResponse.json({ message: 'The ratio is 0.' }, { status: 422 })),
    )

    const failure = await load('t1').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ResultsUnavailableError)
    expect(failure).toHaveProperty('message', 'The ratio is 0.')
  })

  it('reports a 422 whose body is not JSON', async () => {
    server.use(http.get(path, () => new HttpResponse('<html></html>', { status: 422 })))

    await expect(load('t1')).rejects.toThrow('Failed to load results (response is not JSON)')
  })

  it('has a plain message when a 422 carries none', async () => {
    server.use(http.get(path, () => HttpResponse.json({}, { status: 422 })))

    await expect(load('t1')).rejects.toThrow('The results cannot be worked out')
  })

  it('reports the status for another failure', async () => {
    server.use(http.get(path, () => new HttpResponse(null, { status: 503 })))

    const failure = await load('t1').catch((error: unknown) => error)

    expect(failure).toEqual(new Error('Failed to load results (503)'))
    expect(failure).not.toBeInstanceOf(TournamentNotFoundError)
    expect(failure).not.toBeInstanceOf(ResultsUnavailableError)
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get(path, () => new HttpResponse('<html></html>')))

    await expect(load('t1')).rejects.toThrow('Failed to load results (response is not JSON)')
  })

  it('rejects a body of the wrong shape', async () => {
    respondWith(path, { complete: 'yes' })

    await expect(load('t1')).rejects.toThrow('Failed to load results (unexpected response)')
  })
})

describe('the at-large, seeding, and super sweeper shape checks (RES-37)', () => {
  const atLarge = createAtLargeResults({
    divisions: [createAtLargeDivision({ rows: [createAtLargeRow()] })],
  })
  const atLargeDivision = atLarge.divisions[0]
  const atLargeRow = atLargeDivision?.rows[0]
  const seeding = createSeedingResults({
    divisions: [createSeedingDivision({ rows: [createSeedingRow()] })],
  })
  const seedingDivision = seeding.divisions[0]
  const seedingRow = seedingDivision?.rows[0]
  const superSweeper = createSuperSweeperResults({
    rows: [createSuperSweeperRow({ flags: [{ kind: 'missed', sweeperId: 's', gamesBowled: 0 }] })],
  })
  const superRow = superSweeper.rows[0]
  const flag = superRow?.flags[0]

  it.each([
    ['no complete flag', { ...atLarge, complete: undefined }],
    ['no finals ratio', { ...atLarge, finalsRatio: 'eight' }],
    ['divisions that is not an array', { ...atLarge, divisions: {} }],
    ['a division with no name', { ...atLarge, divisions: [{ ...atLargeDivision, name: 1 }] }],
    ['a division with no id', { ...atLarge, divisions: [{ ...atLargeDivision, id: 7 }] }],
    [
      'a row with no registration id',
      {
        ...atLarge,
        divisions: [{ ...atLargeDivision, rows: [{ ...atLargeRow, registrationId: 7 }] }],
      },
    ],
    [
      'a division with no spots',
      { ...atLarge, divisions: [{ ...atLargeDivision, totalSpots: null }] },
    ],
    [
      'a division with no squad advancers',
      { ...atLarge, divisions: [{ ...atLargeDivision, squadAdvancers: null }] },
    ],
    [
      'a division with no entries',
      { ...atLarge, divisions: [{ ...atLargeDivision, entries: '1' }] },
    ],
    [
      'a division with open spots that is text',
      { ...atLarge, divisions: [{ ...atLargeDivision, atLargeSpots: 'two' }] },
    ],
    [
      'a row with a bad squad date',
      {
        ...atLarge,
        divisions: [{ ...atLargeDivision, rows: [{ ...atLargeRow, squadDate: 'soon' }] }],
      },
    ],
    [
      'a row with no casher flag',
      {
        ...atLarge,
        divisions: [{ ...atLargeDivision, rows: [{ ...atLargeRow, previousCasher: 1 }] }],
      },
    ],
  ])('at-large rejects %s', async (_label, body) => {
    respondWith('/v1/tournaments/:id/at-large', body)

    await expect(fetchAtLarge('t1')).rejects.toThrow('Failed to load results (unexpected response)')
  })

  it.each([
    ['no complete flag', { ...seeding, complete: undefined }],
    ['a division with no id', { ...seeding, divisions: [{ ...seedingDivision, id: 7 }] }],
    [
      'a row with no registration id',
      {
        ...seeding,
        divisions: [{ ...seedingDivision, rows: [{ ...seedingRow, registrationId: 7 }] }],
      },
    ],
    [
      'a division with no finalists',
      { ...seeding, divisions: [{ ...seedingDivision, finalists: null }] },
    ],
    [
      'a division with no at-large count',
      { ...seeding, divisions: [{ ...seedingDivision, atLarge: 'x' }] },
    ],
    [
      'a division with no handicap flag',
      { ...seeding, divisions: [{ ...seedingDivision, showHandicap: 0 }] },
    ],
    [
      'a row with an unknown group',
      {
        ...seeding,
        divisions: [{ ...seedingDivision, rows: [{ ...seedingRow, group: 'champ' }] }],
      },
    ],
    [
      'a row with no seed',
      { ...seeding, divisions: [{ ...seedingDivision, rows: [{ ...seedingRow, seed: null }] }] },
    ],
    [
      'a row with no handicap',
      { ...seeding, divisions: [{ ...seedingDivision, rows: [{ ...seedingRow, handicap: '0' }] }] },
    ],
    [
      'a row with a bad squad date',
      { ...seeding, divisions: [{ ...seedingDivision, rows: [{ ...seedingRow, squadDate: '' }] }] },
    ],
  ])('seeding rejects %s', async (_label, body) => {
    respondWith('/v1/tournaments/:id/seeding', body)

    await expect(fetchSeeding('t1')).rejects.toThrow('Failed to load results (unexpected response)')
  })

  it.each([
    ['no cash ratio', { ...superSweeper, cashRatio: undefined }],
    ['a cut score that is text', { ...superSweeper, cutScore: '1' }],
    ['no cut score field', { ...superSweeper, cutScore: undefined }],
    ['no sweeper columns', { ...superSweeper, sweepers: {} }],
    [
      'a column with a bad date',
      { ...superSweeper, sweepers: [{ ...superSweeper.sweepers[0], date: 'x' }] },
    ],
    [
      'a column with no complete flag',
      { ...superSweeper, sweepers: [{ ...superSweeper.sweepers[0], complete: 1 }] },
    ],
    [
      'a row with an unknown group',
      { ...superSweeper, rows: [{ ...superRow, group: 'advancer' }] },
    ],
    [
      'a row with no division',
      { ...superSweeper, rows: [{ ...superRow, divisionName: undefined }] },
    ],
    ['a row with text totals', { ...superSweeper, rows: [{ ...superRow, sweeperTotals: ['6'] }] }],
    [
      'a row with an unknown flag',
      { ...superSweeper, rows: [{ ...superRow, flags: [{ ...flag, kind: 'late' }] }] },
    ],
    [
      'a flag with no games',
      { ...superSweeper, rows: [{ ...superRow, flags: [{ ...flag, gamesBowled: '0' }] }] },
    ],
  ])('super sweeper rejects %s', async (_label, body) => {
    respondWith('/v1/tournaments/:id/super-sweeper', body)

    await expect(fetchSuperSweeper('t1')).rejects.toThrow(
      'Failed to load results (unexpected response)',
    )
  })
})
