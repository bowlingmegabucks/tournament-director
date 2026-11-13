import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import {
  createPayee,
  createPayoutRow,
  createSheet,
  createSummary,
  createTotal,
} from '../../mocks/data'
import { server } from '../../mocks/server'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import {
  fetchPayouts,
  fetchSheet,
  fetchTotals,
  PaidConfirmError,
  PayoutFieldErrorsError,
  PayoutNotFoundError,
  PayoutRefusedError,
  savePayouts,
  setPaid,
  sheetUrl,
} from './api'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const eventId = '22222222-2222-4222-8222-222222222222'
const base = `/v1/tournaments/${tournamentId}/payouts`

describe('sheetUrl (PAY-02 to PAY-05)', () => {
  it.each([
    ['squad', `${base}/squad/${eventId}`],
    ['sweeper', `${base}/sweeper/${eventId}`],
    ['superSweeper', `${base}/super-sweeper`],
    ['finals', `${base}/finals/${eventId}`],
  ] as const)('puts a %s sheet at %s', (source, path) => {
    expect(sheetUrl(source, tournamentId, eventId)).toContain(path)
  })
})

describe('fetchSheet', () => {
  it('reads the sheet', async () => {
    const sheet = createSheet({ payees: [createPayee()] })
    server.use(http.get(`${base}/squad/${eventId}`, () => HttpResponse.json({ sheet })))

    await expect(fetchSheet('squad', tournamentId, eventId)).resolves.toEqual(sheet)
  })

  it.each([
    [401, 'Sign in to see payouts.'],
    [403, 'You do not have permission to use payouts.'],
    [500, 'Failed to load the payouts (500)'],
  ])('says what a %i means', async (status, message) => {
    server.use(http.get(`${base}/squad/${eventId}`, () => new HttpResponse(null, { status })))

    await expect(fetchSheet('squad', tournamentId, eventId)).rejects.toThrow(message)
  })

  it('tells a missing tournament from a missing event', async () => {
    server.use(
      http.get(`${base}/squad/${eventId}`, () =>
        HttpResponse.json({ message: 'Tournament not found' }, { status: 404 }),
      ),
      http.get(`${base}/finals/${eventId}`, () =>
        HttpResponse.json({ message: 'Division not found' }, { status: 404 }),
      ),
    )

    await expect(fetchSheet('squad', tournamentId, eventId)).rejects.toBeInstanceOf(
      TournamentNotFoundError,
    )
    const missing = await fetchSheet('finals', tournamentId, eventId).catch(
      (error: unknown) => error,
    )
    expect(missing).toBeInstanceOf(PayoutNotFoundError)
    expect(missing).toHaveProperty('message', 'Division not found')
  })

  it.each([
    ['not a sheet', { sheet: { status: 'open' } }],
    ['a bad status', { sheet: { ...createSheet(), status: 'maybe' } }],
    ['a payee that is not one', { sheet: { ...createSheet(), payees: [{ name: 1 }] } }],
    ['no sheet', {}],
  ])('rejects %s', async (_name, body) => {
    server.use(http.get(`${base}/squad/${eventId}`, () => HttpResponse.json(body)))

    await expect(fetchSheet('squad', tournamentId, eventId)).rejects.toThrow('unexpected response')
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get(`${base}/squad/${eventId}`, () => new HttpResponse('nope')))

    await expect(fetchSheet('squad', tournamentId, eventId)).rejects.toThrow('not JSON')
  })
})

describe('savePayouts (PAY-12, D-278)', () => {
  const rows = [{ registrationId: eventId, amount: '100', note: null, paid: false }]

  it('sends the rows, leaves confirmPaid out until asked, and answers the sheet', async () => {
    const bodies: unknown[] = []
    const sheet = createSheet()
    server.use(
      http.put(`${base}/squad/${eventId}`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ sheet })
      }),
    )

    await expect(savePayouts('squad', tournamentId, eventId, rows, false)).resolves.toEqual(sheet)
    await savePayouts('squad', tournamentId, eventId, rows, true)

    expect(bodies).toEqual([{ payouts: rows }, { payouts: rows, confirmPaid: true }])
  })

  it('throws the rows the API marked on a 400', async () => {
    server.use(
      http.put(`${base}/squad/${eventId}`, () =>
        HttpResponse.json(
          {
            message: 'Fix',
            errors: { [`amount:${eventId}`]: 'Enter an amount above $0.00', odd: 5 },
          },
          { status: 400 },
        ),
      ),
    )

    const error = await savePayouts('squad', tournamentId, eventId, rows, false).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(PayoutFieldErrorsError)
    expect(error).toHaveProperty('errors', { [`amount:${eventId}`]: 'Enter an amount above $0.00' })
    expect(error).toHaveProperty('message', 'Fix')
  })

  it('throws the reason of a refusal on a 409', async () => {
    server.use(
      http.put(`${base}/squad/${eventId}`, () =>
        HttpResponse.json(
          { message: 'm', errors: { event: 'This squad is not complete.' } },
          { status: 409 },
        ),
      ),
    )

    const error = await savePayouts('squad', tournamentId, eventId, rows, false).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(PayoutRefusedError)
    expect(error).toHaveProperty('message', 'This squad is not complete.')
  })

  it('throws the paid rows a save would change on a 409 with warnings (D-273)', async () => {
    const changes = [{ registrationId: eventId, name: 'Dana', from: '100.00', to: null }]
    server.use(
      http.put(`${base}/squad/${eventId}`, () =>
        HttpResponse.json(
          { message: 'Confirm', warnings: [{ field: 'paid', message: 'x' }], paidChanges: changes },
          { status: 409 },
        ),
      ),
    )

    const error = await savePayouts('squad', tournamentId, eventId, rows, false).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(PaidConfirmError)
    expect(error).toHaveProperty('changes', changes)
  })

  it.each([
    [401, 'Sign in to see payouts.'],
    [403, 'You do not have permission to use payouts.'],
    [500, 'Failed to save the payouts (500)'],
  ])('says what a %i means', async (status, message) => {
    server.use(http.put(`${base}/squad/${eventId}`, () => new HttpResponse(null, { status })))

    await expect(savePayouts('squad', tournamentId, eventId, rows, false)).rejects.toThrow(message)
  })

  it('rejects a save answered with something that is not a sheet', async () => {
    server.use(http.put(`${base}/squad/${eventId}`, () => HttpResponse.json({ sheet: 1 })))

    await expect(savePayouts('squad', tournamentId, eventId, rows, false)).rejects.toThrow(
      'unexpected response',
    )
  })
})

describe('fetchPayouts and fetchTotals (PAY-19)', () => {
  it('reads the list with its summary', async () => {
    const payouts = [createPayoutRow()]
    server.use(
      http.get(base, () =>
        HttpResponse.json({
          payouts,
          summary: createSummary({ count: 1 }),
          tournamentComplete: false,
        }),
      ),
    )

    await expect(fetchPayouts(tournamentId)).resolves.toMatchObject({
      payouts,
      tournamentComplete: false,
    })
  })

  it('rejects a list that is not one', async () => {
    server.use(http.get(base, () => HttpResponse.json({ payouts: [{}], summary: {} })))

    await expect(fetchPayouts(tournamentId)).rejects.toThrow('unexpected response')
  })

  it('sends the minimum only when one is typed, and reads the bowlers', async () => {
    const queries: string[] = []
    server.use(
      http.get(`${base}/totals`, ({ request }) => {
        queries.push(new URL(request.url).search)
        return HttpResponse.json({ bowlers: [createTotal()] })
      }),
    )

    await fetchTotals(tournamentId, '')
    await fetchTotals(tournamentId, ' 2,000 ')

    expect(queries).toEqual(['', '?min=2%2C000'])
  })

  it('throws the message of a bad minimum', async () => {
    server.use(
      http.get(`${base}/totals`, () =>
        HttpResponse.json({ message: 'Enter dollars and cents, like 100.00' }, { status: 400 }),
      ),
    )

    const error = await fetchTotals(tournamentId, 'lots').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(PayoutFieldErrorsError)
    expect(error).toHaveProperty('errors', { min: 'Enter dollars and cents, like 100.00' })
  })

  it('rejects totals that are not a list of bowlers', async () => {
    server.use(http.get(`${base}/totals`, () => HttpResponse.json({ bowlers: [1] })))

    await expect(fetchTotals(tournamentId, '')).rejects.toThrow('unexpected response')
  })
})

describe('setPaid (PAY-13, D-274)', () => {
  it('patches the flag and answers the payout', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch(`${base}/${eventId}`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({
          payout: { id: eventId, amount: '100.00', note: null, paid: true },
        })
      }),
    )

    await expect(setPaid(tournamentId, eventId, true)).resolves.toEqual({
      id: eventId,
      amount: '100.00',
      note: null,
      paid: true,
    })
    expect(bodies).toEqual([{ paid: true }])
  })

  it('throws the reason of a refusal, and rejects a body that is not a payout', async () => {
    server.use(
      http.patch(`${base}/${eventId}`, () =>
        HttpResponse.json(
          { message: 'm', errors: { event: 'This tournament is complete. Payouts are locked.' } },
          { status: 409 },
        ),
      ),
    )
    await expect(setPaid(tournamentId, eventId, true)).rejects.toThrow(
      'This tournament is complete. Payouts are locked.',
    )

    server.use(http.patch(`${base}/${eventId}`, () => HttpResponse.json({ payout: 1 })))
    await expect(setPaid(tournamentId, eventId, true)).rejects.toThrow('unexpected response')
  })
})
