import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setMockUser } from '../../mocks/authHandlers'
import {
  createPayoutRow,
  createSignedInUser,
  createSummary,
  createTotal,
  createTournament,
} from '../../mocks/data'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/renderApp'
import type { PayoutRow } from './types'

const tournament = createTournament({ name: 'Spring Open' })
const base = `/v1/tournaments/${tournament.id}/payouts`

const squadRow = createPayoutRow({ id: 'p1', name: 'Dana Whitfield', amount: '100.00', paid: true })
const sweeperRow = createPayoutRow({
  id: 'p2',
  source: 'sweeper',
  eventId: 'e2',
  eventLabel: 'Sweeper',
  eventDate: '2026-10-24T13:00:00',
  name: 'Marcus Lee',
  amount: '250.00',
})
const finalsRow = createPayoutRow({
  id: 'p3',
  source: 'finals',
  eventId: 'e3',
  eventLabel: 'Finals: Open',
  eventDate: null,
  name: 'Dana Whitfield',
  amount: '1500.00',
  note: '1st overall',
})
const rows = [squadRow, sweeperRow, finalsRow]

function serve(list: PayoutRow[] = rows, options: { complete?: boolean } = {}) {
  const patches: unknown[] = []
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get(base, () =>
      HttpResponse.json({
        payouts: list,
        summary: createSummary({
          count: list.length,
          total: '1850.00',
          paidCount: 1,
          unpaidCount: 2,
          unpaidTotal: '1750.00',
        }),
        tournamentComplete: options.complete === true,
      }),
    ),
    http.get(`${base}/totals`, () =>
      HttpResponse.json({
        bowlers: [
          createTotal({
            name: 'Dana Whitfield',
            count: 2,
            total: '1600.00',
            unpaidTotal: '1500.00',
          }),
          createTotal({ name: 'Marcus Lee', count: 1, total: '250.00', unpaidTotal: '250.00' }),
        ],
      }),
    ),
    http.patch(`${base}/:payoutId`, async ({ params, request }) => {
      const body: unknown = await request.json()
      patches.push({ id: params['payoutId'], body })
      return HttpResponse.json({ payout: { id: 'p2', amount: '250.00', note: null, paid: true } })
    }),
  )
  return patches
}

const open = (search = '') => renderApp(`/tournaments/${tournament.id}/payouts${search}`)

beforeEach(() => {
  setMockUser(createSignedInUser({ roles: ['director'] }))
})

describe('the full payouts page, by payout (PAY-19, D-276)', () => {
  it('shows the disclaimer, the figures, and every payout with its event', async () => {
    serve()

    open()

    expect(await screen.findByText('Payouts are for this event only.')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Payouts', level: 1 })).toBeVisible()
    expect(screen.getByText('$1,850.00')).toBeVisible()
    expect(screen.getByText('2 ($1,750.00)')).toBeVisible()
    const table = screen.getByRole('table', { name: 'Payouts by payout' })
    const body = within(table).getAllByRole('row').slice(1)
    expect(body.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      'Squad Sat 10/24/2026 9:00 AM',
      'Sweeper Sat 10/24/2026 1:00 PM',
      'Finals: Open',
    ])
    expect(within(table).getByText('1st overall')).toBeVisible()
  })

  it('filters by event and by paid', async () => {
    const user = userEvent.setup()
    serve()
    open()
    const table = await screen.findByRole('table', { name: 'Payouts by payout' })

    await user.selectOptions(screen.getByLabelText('Paid'), 'unpaid')
    expect(within(table).queryByText('Dana Whitfield', { selector: 'th' })).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(3)

    await user.selectOptions(screen.getByLabelText('Event'), 'sweeper:e2')
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).getByText('Marcus Lee')).toBeVisible()

    await user.selectOptions(screen.getByLabelText('Paid'), 'paid')
    expect(screen.getByText('No payout matches.')).toBeVisible()
  })

  it('saves at once when a director ticks Paid, and says why when the save is refused (PAY-13, D-274)', async () => {
    const user = userEvent.setup()
    const patches = serve()
    open()
    await screen.findByRole('table', { name: 'Payouts by payout' })

    await user.click(await screen.findByLabelText('Paid for Marcus Lee'))

    await waitFor(() => {
      expect(patches).toEqual([{ id: 'p2', body: { paid: true } }])
    })
    expect((await screen.findAllByLabelText('Paid for Dana Whitfield'))[0]).toBeChecked()
  })

  it('shows an error toast and leaves the box as it was when the save is refused (PAY-11)', async () => {
    const user = userEvent.setup()
    serve()
    server.use(
      http.patch(`${base}/:payoutId`, () =>
        HttpResponse.json(
          {
            message: 'm',
            errors: { event: 'This tournament is complete. Payouts are locked.' },
          },
          { status: 409 },
        ),
      ),
    )
    open()
    await screen.findByRole('table', { name: 'Payouts by payout' })

    await user.click(await screen.findByLabelText('Paid for Marcus Lee'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This tournament is complete. Payouts are locked.',
    )
    expect(screen.getByLabelText('Paid for Marcus Lee')).not.toBeChecked()
  })

  it('shows text with a check mark, never a checkbox, for a user who may not write (D-274)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'], permissions: ['payouts.read'] }))
    serve()

    open()

    const table = await screen.findByRole('table', { name: 'Payouts by payout' })
    expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(table).getByText('✓ Paid')).toBeVisible()
    expect(within(table).getAllByText('Not paid')).toHaveLength(2)
  })

  it('locks the toggles once the tournament is complete (PAY-11, D-273)', async () => {
    serve(rows, { complete: true })

    open()

    const table = await screen.findByRole('table', { name: 'Payouts by payout' })
    expect(screen.getByText('This tournament is complete. Payouts are locked.')).toBeVisible()
    expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('says what to do next when no payout is recorded', async () => {
    serve([])

    open()

    expect(
      await screen.findByText(/No payouts are recorded yet\. Open a completed squad or sweeper/),
    ).toBeVisible()
  })

  it('shows an error with Try again when the list cannot load, and recovers', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get(base, () => new HttpResponse(null, { status: 500 })),
    )
    open()
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Failed to load the payouts (500)',
    )

    serve()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('table', { name: 'Payouts by payout' })).toBeVisible()
  })

  it('announces loading', async () => {
    serve()

    open()

    expect(await screen.findByText('Loading payouts…')).toBeVisible()
    await screen.findByRole('table', { name: 'Payouts by payout' })
  })

  it('turns away a user without payouts.read (PAY-16, D-275)', async () => {
    setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
    serve()

    open()

    await screen.findByRole('navigation', { name: 'Spring Open' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Payouts', level: 1 })).not.toBeInTheDocument()
  })
})

describe('the full payouts page, by bowler (PAY-19, D-276, D-282)', () => {
  it('opens from the tab and totals each bowler', async () => {
    const user = userEvent.setup()
    serve()
    open()
    await screen.findByRole('table', { name: 'Payouts by payout' })

    await user.click(screen.getByRole('link', { name: 'By bowler' }))

    const table = await screen.findByRole('table', { name: 'Payouts by bowler' })
    const first = within(within(table).getAllByRole('row')[1] as HTMLElement)
    expect(first.getByText('Dana Whitfield')).toBeVisible()
    expect(first.getByText('$1,600.00')).toBeVisible()
    expect(first.getByText('$1,500.00')).toBeVisible()
    expect(screen.getByRole('link', { name: 'By bowler' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the view in the address, so a reload stays on it', async () => {
    serve()

    open('?view=bowler')

    expect(await screen.findByRole('table', { name: 'Payouts by bowler' })).toBeVisible()
  })

  it('keeps only the bowlers at or above "Earned at least", and says when no one is', async () => {
    const user = userEvent.setup()
    serve()
    open('?view=bowler')
    const table = await screen.findByRole('table', { name: 'Payouts by bowler' })

    await user.type(screen.getByLabelText('Earned at least ($)'), '1000')
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).queryByText('Marcus Lee')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Earned at least ($)'))
    await user.type(screen.getByLabelText('Earned at least ($)'), '5000')
    expect(screen.getByText('No bowler has earned $5,000.00 or more.')).toBeVisible()
  })

  it('names a bad minimum next to its box', async () => {
    const user = userEvent.setup()
    serve()
    open('?view=bowler')
    await screen.findByRole('table', { name: 'Payouts by bowler' })

    await user.type(screen.getByLabelText('Earned at least ($)'), 'lots')

    expect(await screen.findByText('Enter dollars and cents, like 100.00')).toBeVisible()
    expect(screen.getByLabelText('Earned at least ($)')).toBeInvalid()
  })

  it('shows an error with Try again when the totals cannot load', async () => {
    serve()
    server.use(http.get(`${base}/totals`, () => new HttpResponse(null, { status: 500 })))

    open('?view=bowler')

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load the totals (500)')
  })
})
