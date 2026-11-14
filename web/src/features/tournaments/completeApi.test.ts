import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import {
  completedMessage,
  completeLines,
  payoutNotes,
  completeTournament,
  fetchCompleteInfo,
  TournamentCompleteRefusedError,
  type TournamentCompleteInfo,
} from './completeApi'

const id = '11111111-1111-4111-8111-111111111111'
const path = `/v1/tournaments/${id}/complete`
const infoPath = `/v1/tournaments/${id}/complete-info`

const info = (overrides: Partial<TournamentCompleteInfo> = {}): TournamentCompleteInfo => ({
  squadCount: 3,
  openSquadCount: 2,
  openSweeperCount: 1,
  noScoreCount: 4,
  partialCount: 2,
  payoutCount: 5,
  unpaidPayoutCount: 2,
  unpaidPayoutTotal: '1450.00',
  ...overrides,
})

describe('completeTournament (TRN-38, D-256)', () => {
  it('posts and returns the counts it closed', async () => {
    let method = ''
    server.use(
      http.post(path, ({ request }) => {
        method = request.method
        return HttpResponse.json({
          completed: true,
          squadsCompleted: 3,
          sweepersCompleted: 1,
          noShowCount: 7,
        })
      }),
    )

    expect(await completeTournament(id)).toEqual({
      squadsCompleted: 3,
      sweepersCompleted: 1,
      noShowCount: 7,
    })
    expect(method).toBe('POST')
  })

  it('throws a refusal with every reason, one per line (TRN-39, D-257)', async () => {
    server.use(
      http.post(path, () =>
        HttpResponse.json(
          {
            message: 'This tournament is already complete',
            errors: { tournament: 'This tournament is already complete\nAdd a squad first' },
          },
          { status: 409 },
        ),
      ),
    )

    const error = await completeTournament(id).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TournamentCompleteRefusedError)
    expect(error).toMatchObject({
      message: 'This tournament is already complete',
      reasons: ['This tournament is already complete', 'Add a squad first'],
    })
  })

  it('names the unreadable session when that is the reason', async () => {
    server.use(
      http.post(path, () =>
        HttpResponse.json(
          {
            message: 'A sweeper holds bad values',
            errors: { session: 'A sweeper holds bad values' },
          },
          { status: 409 },
        ),
      ),
    )

    await expect(completeTournament(id)).rejects.toMatchObject({
      reasons: ['A sweeper holds bad values'],
    })
  })

  it('reads the reasons of errors.session alone, and drops blank lines (D-257)', async () => {
    server.use(
      http.post(path, () =>
        HttpResponse.json(
          { message: 'Message', errors: { session: 'A squad is bad\n\nStill bad\n' } },
          { status: 409 },
        ),
      ),
    )

    await expect(completeTournament(id)).rejects.toMatchObject({
      reasons: ['A squad is bad', 'Still bad'],
    })
  })

  it('says a default message when a 409 holds none', async () => {
    server.use(http.post(path, () => HttpResponse.json({}, { status: 409 })))

    await expect(completeTournament(id)).rejects.toMatchObject({
      message: 'The tournament cannot be completed.',
      reasons: ['The tournament cannot be completed.'],
    })
  })

  it.each([
    ['a refusal', 409, 'Failed to complete the tournament (response is not JSON)'],
    ['a success', 200, 'Failed to complete the tournament (response is not JSON)'],
  ])('names the failure when %s is not JSON', async (_name, status, message) => {
    server.use(http.post(path, () => new HttpResponse('nope', { status })))

    await expect(completeTournament(id)).rejects.toThrow(message)
  })

  it('falls back to the message when a 409 has no errors', async () => {
    server.use(http.post(path, () => HttpResponse.json({ message: 'Nope' }, { status: 409 })))

    await expect(completeTournament(id)).rejects.toMatchObject({ reasons: ['Nope'] })
  })

  it.each([
    [404, TournamentNotFoundError, 'Tournament not found'],
    [401, Error, 'Sign in to complete a tournament.'],
    [403, Error, 'You do not have permission to complete a tournament.'],
    [500, Error, 'Failed to complete the tournament (500)'],
  ])('throws for a %i', async (status, type, message) => {
    server.use(http.post(path, () => new HttpResponse(null, { status })))

    const error = await completeTournament(id).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(type)
    expect(error).toHaveProperty('message', message)
  })

  it('throws for a body without the counts', async () => {
    server.use(http.post(path, () => HttpResponse.json({ completed: true })))

    await expect(completeTournament(id)).rejects.toThrow(
      'Failed to complete the tournament (unexpected response)',
    )
  })
})

describe('fetchCompleteInfo (TRN-41, D-259)', () => {
  it('returns the counts', async () => {
    server.use(http.get(infoPath, () => HttpResponse.json({ completeInfo: info() })))

    expect(await fetchCompleteInfo(id)).toEqual(info())
  })

  it.each([
    [404, TournamentNotFoundError, 'Tournament not found'],
    [400, TournamentNotFoundError, 'Tournament not found'],
    [401, Error, 'Sign in to complete a tournament.'],
    [403, Error, 'You do not have permission to complete a tournament.'],
    [500, Error, 'Failed to load what completing does (500)'],
  ])('throws for a %i', async (status, type, message) => {
    server.use(http.get(infoPath, () => new HttpResponse(null, { status })))

    const error = await fetchCompleteInfo(id).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(type)
    expect(error).toHaveProperty('message', message)
  })

  it.each([
    'squadCount',
    'openSquadCount',
    'openSweeperCount',
    'noScoreCount',
    'partialCount',
    'payoutCount',
    'unpaidPayoutCount',
    'unpaidPayoutTotal',
  ])('throws when %s is missing', async (missing) => {
    const body: Record<string, number | string> = { ...info() }
    delete body[missing]
    server.use(http.get(infoPath, () => HttpResponse.json({ completeInfo: body })))

    await expect(fetchCompleteInfo(id)).rejects.toThrow(
      'Failed to load what completing does (unexpected response)',
    )
  })

  it('names the failure when the body is not JSON', async () => {
    server.use(http.get(infoPath, () => new HttpResponse('nope')))

    await expect(fetchCompleteInfo(id)).rejects.toThrow(
      'Failed to load what completing does (response is not JSON)',
    )
  })

  it('throws for a body of the wrong shape', async () => {
    server.use(http.get(infoPath, () => HttpResponse.json({ completeInfo: { squadCount: 1 } })))

    await expect(fetchCompleteInfo(id)).rejects.toThrow(
      'Failed to load what completing does (unexpected response)',
    )
  })
})

describe('completedMessage (TRN-43, D-260)', () => {
  it.each([
    [
      { squadsCompleted: 3, sweepersCompleted: 1, noShowCount: 7 },
      'Tournament completed. 3 squads and 1 sweeper closed, 7 bowlers got zeros.',
    ],
    [
      { squadsCompleted: 1, sweepersCompleted: 2, noShowCount: 1 },
      'Tournament completed. 1 squad and 2 sweepers closed, 1 bowler got zeros.',
    ],
    [
      { squadsCompleted: 3, sweepersCompleted: 0, noShowCount: 0 },
      'Tournament completed. 3 squads closed.',
    ],
    [
      { squadsCompleted: 0, sweepersCompleted: 1, noShowCount: 0 },
      'Tournament completed. 1 sweeper closed.',
    ],
    [{ squadsCompleted: 0, sweepersCompleted: 0, noShowCount: 0 }, 'Tournament completed.'],
  ])('says %j as "%s"', (result, text) => {
    expect(completedMessage(result)).toBe(text)
  })
})

describe('completeLines (TRN-43, D-259)', () => {
  it('lists open sessions, zeros, and part scores', () => {
    expect(completeLines(info())).toEqual([
      'Complete 2 open squads and 1 open sweeper.',
      'Save a zero for every game of 4 bowlers with no scores.',
      'Leave 2 bowlers with some games but not all as entered.',
    ])
  })

  it('uses the singular for one of each', () => {
    expect(
      completeLines(
        info({ openSquadCount: 1, openSweeperCount: 0, noScoreCount: 1, partialCount: 1 }),
      ),
    ).toEqual([
      'Complete 1 open squad.',
      'Save a zero for every game of 1 bowler with no scores.',
      'Leave 1 bowler with some games but not all as entered.',
    ])
  })

  it('names a lone open sweeper and drops zero lines', () => {
    expect(
      completeLines(
        info({ openSquadCount: 0, openSweeperCount: 2, noScoreCount: 0, partialCount: 0 }),
      ),
    ).toEqual(['Complete 2 open sweepers.'])
  })

  it('is empty when nothing is open', () => {
    expect(
      completeLines(
        info({ openSquadCount: 0, openSweeperCount: 0, noScoreCount: 0, partialCount: 0 }),
      ),
    ).toEqual([])
  })
})

describe('payoutNotes (PAY-15, D-279)', () => {
  it('says none are recorded when the count is zero', () => {
    expect(payoutNotes(info({ payoutCount: 0, unpaidPayoutCount: 0 }))).toEqual([
      'No payouts are recorded.',
    ])
  })

  it('counts the unpaid ones with their total, in the singular for one', () => {
    expect(
      payoutNotes(info({ payoutCount: 4, unpaidPayoutCount: 2, unpaidPayoutTotal: '1450.00' })),
    ).toEqual(['2 payouts are not marked paid ($1,450.00).'])
    expect(
      payoutNotes(info({ payoutCount: 4, unpaidPayoutCount: 1, unpaidPayoutTotal: '5.50' })),
    ).toEqual(['1 payout is not marked paid ($5.50).'])
  })

  it('says nothing when every payout is paid', () => {
    expect(payoutNotes(info({ payoutCount: 4, unpaidPayoutCount: 0 }))).toEqual([])
  })
})
