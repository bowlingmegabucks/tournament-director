import { http, HttpResponse } from 'msw'
import { formatCents, parseAmount } from '../features/payouts/amount'
import type {
  PayoutRow,
  PayoutSheet,
  PayoutSource,
  SheetOther,
  SheetPayee,
} from '../features/payouts/types'

/**
 * The demo payouts for `npm run dev:mocks` and the pull request build (PAY-02 to PAY-19). Two
 * bowlers are inferred to be paid in every event, two more are entered; a save keeps its rows in
 * memory until the page reloads. The mock never closes a gate, and it checks the same amount and
 * note rules as the API.
 */

interface Stored {
  id: string
  source: PayoutSource
  eventId: string
  registrationId: string
  cents: number
  note: string | null
  paid: boolean
}

const inferred = [
  { registrationId: 'a0000000-0000-4000-8000-00000000000a', name: 'Dana Whitfield' },
  { registrationId: 'a0000000-0000-4000-8000-00000000000b', name: 'Marcus Lee' },
]
const others = [
  { registrationId: 'a0000000-0000-4000-8000-00000000000c', name: 'Tom Becker' },
  { registrationId: 'a0000000-0000-4000-8000-00000000000d', name: 'Ann Bell' },
]
const everyone = [...inferred, ...others]
const nameOf = (id: string) =>
  everyone.find((bowler) => bowler.registrationId === id)?.name ?? 'Unknown bowler'

const labels: Record<PayoutSource, string> = {
  squad: 'Squad',
  sweeper: 'Sweeper',
  superSweeper: 'Super sweeper',
  finals: 'Finals: Open',
}

const dates: Record<PayoutSource, string | null> = {
  squad: '2026-10-24T09:00:00',
  sweeper: '2026-10-24T13:00:00',
  superSweeper: null,
  finals: null,
}

export function createPayoutHandlers() {
  const stored: Stored[] = []
  let counter = 0

  const sheetOf = (source: PayoutSource, eventId: string): PayoutSheet => {
    const mine = stored.filter((row) => row.source === source && row.eventId === eventId)
    const view = (row: Stored) => ({
      id: row.id,
      amount: formatCents(row.cents),
      note: row.note,
      paid: row.paid,
    })
    const payees: SheetPayee[] = inferred.map((bowler, index) => {
      const row = mine.find((item) => item.registrationId === bowler.registrationId)
      return {
        ...bowler,
        divisionName: 'Open',
        detail: source === 'finals' ? `seed ${index + 1}` : `cashed, place ${index + 2}`,
        seed: source === 'finals' ? index + 1 : null,
        previousCasher: false,
        inferred: true,
        payout: row ? view(row) : null,
      }
    })
    for (const row of mine) {
      if (inferred.some((bowler) => bowler.registrationId === row.registrationId)) continue
      payees.push({
        registrationId: row.registrationId,
        name: nameOf(row.registrationId),
        divisionName: 'Open',
        detail: 'added by hand',
        seed: null,
        previousCasher: false,
        inferred: false,
        payout: view(row),
      })
    }
    const listed = new Set(payees.map((payee) => payee.registrationId))
    const rest: SheetOther[] = others
      .filter((bowler) => !listed.has(bowler.registrationId))
      .map((bowler) => ({ ...bowler, divisionName: 'Open' }))
    return {
      event: {
        source,
        eventId,
        label: labels[source],
        date: dates[source],
        divisionName: source === 'finals' ? 'Open' : null,
      },
      status: 'open',
      reason: null,
      payees,
      others: rest,
      tournamentComplete: false,
    }
  }

  const rowsOut = (): PayoutRow[] =>
    stored.map((row) => ({
      id: row.id,
      source: row.source,
      eventId: row.eventId,
      eventLabel: labels[row.source],
      eventDate: dates[row.source],
      registrationId: row.registrationId,
      name: nameOf(row.registrationId),
      divisionName: 'Open',
      amount: formatCents(row.cents),
      note: row.note,
      paid: row.paid,
    }))

  /** The errors one request row earns (the same rules as the API). */
  const errorsOf = (row: unknown): Record<string, string> => {
    const id = String(Reflect.get(Object(row), 'registrationId'))
    const amount = parseAmount(String(Reflect.get(Object(row), 'amount') ?? ''))
    const note = String(Reflect.get(Object(row), 'note') ?? '').trim()
    if (amount.kind === 'invalid') return { [`amount:${id}`]: amount.message }
    const needsNote =
      amount.kind === 'amount' &&
      note === '' &&
      !inferred.some((bowler) => bowler.registrationId === id)
    return needsNote ? { [`note:${id}`]: 'Say why this bowler is paid' } : {}
  }

  /** Store, change, or remove the payout one request row names. */
  const applyRow = (source: PayoutSource, eventId: string, row: unknown) => {
    const id = String(Reflect.get(Object(row), 'registrationId'))
    const amount = parseAmount(String(Reflect.get(Object(row), 'amount') ?? ''))
    const note = String(Reflect.get(Object(row), 'note') ?? '').trim()
    const paid = Reflect.get(Object(row), 'paid') === true
    const at = stored.findIndex(
      (item) => item.source === source && item.eventId === eventId && item.registrationId === id,
    )
    if (amount.kind !== 'amount') {
      if (at >= 0) stored.splice(at, 1)
      return
    }
    const next = { cents: amount.cents, note: note === '' ? null : note, paid }
    const found = stored[at]
    if (found) {
      Object.assign(found, next)
      return
    }
    counter += 1
    stored.push({
      id: `b0000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
      source,
      eventId,
      registrationId: id,
      ...next,
    })
  }

  const save = async (source: PayoutSource, eventId: string, request: Request) => {
    const body: unknown = await request.json()
    const payouts: unknown =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'payouts') : []
    const rows = Array.isArray(payouts) ? payouts : []
    const errors: Record<string, string> = {}
    for (const row of rows) Object.assign(errors, errorsOf(row))
    if (Object.keys(errors).length > 0) {
      return HttpResponse.json(
        { message: 'Fix the rows marked and save again.', errors },
        { status: 400 },
      )
    }
    for (const row of rows) applyRow(source, eventId, row)
    return HttpResponse.json({ sheet: sheetOf(source, eventId) })
  }

  return [
    http.get('/v1/tournaments/:id/payouts', () => {
      const rows = rowsOut()
      const unpaid = rows.filter((row) => !row.paid)
      const sum = (list: Stored[]) => list.reduce((total, row) => total + row.cents, 0)
      return HttpResponse.json({
        payouts: rows,
        summary: {
          count: rows.length,
          total: formatCents(sum(stored)),
          paidCount: rows.length - unpaid.length,
          unpaidCount: unpaid.length,
          unpaidTotal: formatCents(sum(stored.filter((row) => !row.paid))),
        },
        tournamentComplete: false,
      })
    }),
    http.get('/v1/tournaments/:id/payouts/totals', () => {
      const byBowler = new Map<string, { count: number; total: number; unpaid: number }>()
      for (const row of stored) {
        const found = byBowler.get(row.registrationId) ?? { count: 0, total: 0, unpaid: 0 }
        found.count += 1
        found.total += row.cents
        if (!row.paid) found.unpaid += row.cents
        byBowler.set(row.registrationId, found)
      }
      return HttpResponse.json({
        bowlers: [...byBowler]
          .toSorted(([, a], [, b]) => b.total - a.total)
          .map(([registrationId, bowler]) => ({
            registrationId,
            name: nameOf(registrationId),
            divisionName: 'Open',
            count: bowler.count,
            total: formatCents(bowler.total),
            unpaidTotal: formatCents(bowler.unpaid),
          })),
      })
    }),
    http.get('/v1/tournaments/:id/payouts/squad/:eventId', ({ params }) =>
      HttpResponse.json({ sheet: sheetOf('squad', String(params['eventId'])) }),
    ),
    http.get('/v1/tournaments/:id/payouts/sweeper/:eventId', ({ params }) =>
      HttpResponse.json({ sheet: sheetOf('sweeper', String(params['eventId'])) }),
    ),
    http.get('/v1/tournaments/:id/payouts/super-sweeper', ({ params }) =>
      HttpResponse.json({ sheet: sheetOf('superSweeper', String(params['id'])) }),
    ),
    http.get('/v1/tournaments/:id/payouts/finals/:eventId', ({ params }) =>
      HttpResponse.json({ sheet: sheetOf('finals', String(params['eventId'])) }),
    ),
    http.put('/v1/tournaments/:id/payouts/squad/:eventId', ({ params, request }) =>
      save('squad', String(params['eventId']), request),
    ),
    http.put('/v1/tournaments/:id/payouts/sweeper/:eventId', ({ params, request }) =>
      save('sweeper', String(params['eventId']), request),
    ),
    http.put('/v1/tournaments/:id/payouts/super-sweeper', ({ params, request }) =>
      save('superSweeper', String(params['id']), request),
    ),
    http.put('/v1/tournaments/:id/payouts/finals/:eventId', ({ params, request }) =>
      save('finals', String(params['eventId']), request),
    ),
    http.patch('/v1/tournaments/:id/payouts/:payoutId', async ({ params, request }) => {
      const found = stored.find((row) => row.id === params['payoutId'])
      if (!found) return HttpResponse.json({ message: 'Payout not found' }, { status: 404 })
      const body: unknown = await request.json()
      found.paid = typeof body === 'object' && body !== null && Reflect.get(body, 'paid') === true
      return HttpResponse.json({
        payout: {
          id: found.id,
          amount: formatCents(found.cents),
          note: found.note,
          paid: found.paid,
        },
      })
    }),
  ]
}
