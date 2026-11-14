import { describe, expect, it, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setMockUser } from '../../mocks/authHandlers'
import {
  createOther,
  createPayee,
  createSheet,
  createSignedInUser,
  createSquad,
  createTournament,
} from '../../mocks/data'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/renderApp'
import type { PayoutSheet } from './types'

const tournament = createTournament({ name: 'Spring Open' })
const squad = createSquad({ complete: true, date: '2026-10-24T09:00:00' })
const dana = createPayee({
  registrationId: 'a0000000-0000-4000-8000-00000000000a',
  name: 'Dana Whitfield',
})
const marcus = createPayee({
  registrationId: 'a0000000-0000-4000-8000-00000000000b',
  name: 'Marcus Lee',
  detail: 'cashed, place 10',
})
const tom = createOther({
  registrationId: 'a0000000-0000-4000-8000-00000000000c',
  name: 'Tom Becker',
})
const ann = createOther({
  registrationId: 'a0000000-0000-4000-8000-00000000000d',
  name: 'Ann Bell',
})

const sheet = (overrides: Partial<PayoutSheet> = {}) =>
  createSheet({
    event: {
      source: 'squad',
      eventId: squad.id,
      label: 'Squad',
      date: squad.date,
      divisionName: null,
    },
    payees: [dana, marcus],
    others: [tom, ann],
    ...overrides,
  })

const url = `/v1/tournaments/${tournament.id}/payouts/squad/${squad.id}`

/** What each save sent, newest last. `answer` decides the response to a save. */
function serve(
  first: PayoutSheet,
  answer: (body: unknown, sent: number) => Response = () => HttpResponse.json({ sheet: first }),
  /** What the page reads once a save went through: the next GET gives this. */
  after?: PayoutSheet,
) {
  const sent: unknown[] = []
  let saved = false
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/squads', () =>
      HttpResponse.json({
        squads: [createSquad({ id: squad.id, date: squad.date, complete: squad.complete })],
      }),
    ),
    http.get(url, () => HttpResponse.json({ sheet: saved && after ? after : first })),
    http.put(url, async ({ request }) => {
      const body: unknown = await request.json()
      sent.push(body)
      const response = answer(body, sent.length)
      if (response.ok) saved = true
      return response
    }),
  )
  return sent
}

const openPage = () => renderApp(`/tournaments/${tournament.id}/squads/${squad.id}/payouts`)

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Enter payouts' }))
  return screen.findByRole('dialog', { name: 'Payouts: Squad' })
}

const amountOf = (dialog: HTMLElement, name: string) =>
  within(dialog).getByLabelText(`Amount for ${name}`)

beforeEach(() => {
  setMockUser(createSignedInUser({ roles: ['director'] }))
})

describe('the event page (PAY-02, PAY-14, D-276)', () => {
  it('shows the disclaimer, the figures, and the saved payouts with a hand-added bowler tagged', async () => {
    serve(
      sheet({
        payees: [
          createPayee({
            registrationId: dana.registrationId,
            name: 'Dana Whitfield',
            payout: { id: 'p1', amount: '100.00', note: null, paid: true },
          }),
          createPayee({
            registrationId: tom.registrationId,
            name: 'Tom Becker',
            inferred: false,
            detail: 'added by hand',
            payout: { id: 'p2', amount: '25.00', note: 'Lane breakdown', paid: false },
          }),
        ],
      }),
    )

    openPage()

    expect(await screen.findByText('Payouts are for this event only.')).toBeVisible()
    expect(screen.getByText(/Do not include cashes from other squads/)).toBeVisible()
    expect(screen.getByText('$125.00')).toBeVisible()
    expect(screen.getByText('1 ($25.00)')).toBeVisible()
    const table = screen.getByRole('table', { name: 'Payouts' })
    expect(within(table).getByText('✓ Paid')).toBeVisible()
    expect(within(table).getByText('Not paid')).toBeVisible()
    const toms = within(screen.getByRole('row', { name: /Tom Becker/ }))
    expect(toms.getByText('added by hand')).toBeVisible()
    expect(toms.getByText('Lane breakdown')).toBeVisible()
  })

  it('says none are recorded for an empty open event', async () => {
    serve(sheet())

    openPage()

    expect(await screen.findByText('No payouts are recorded for this squad.')).toBeVisible()
  })

  it('turns Enter payouts off with the reason until the squad is complete (PAY-10, D-272)', async () => {
    const reason = 'This squad is not complete. Complete it before you enter payouts.'
    serve(sheet({ status: 'notReady', reason, payees: [], others: [] }))

    openPage()

    expect(await screen.findByText(reason)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Enter payouts' })).toBeDisabled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('turns Enter payouts off once the tournament is complete (PAY-11, D-273)', async () => {
    const reason = 'This tournament is complete. Payouts are locked.'
    serve(
      sheet({
        status: 'locked',
        reason,
        tournamentComplete: true,
        payees: [createPayee({ payout: { id: 'p1', amount: '100.00', note: null, paid: false } })],
      }),
    )

    openPage()

    expect(await screen.findByText(reason)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Enter payouts' })).toBeDisabled()
    expect(screen.getByRole('table', { name: 'Payouts' })).toBeVisible()
  })

  it('hides Enter payouts from a user who may read but not write (PAY-16, D-275)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'], permissions: ['payouts.read'] }))
    serve(sheet())

    openPage()

    await screen.findByText('No payouts are recorded for this squad.')
    expect(screen.queryByRole('button', { name: 'Enter payouts' })).not.toBeInTheDocument()
  })

  it('shows an error with Try again when the sheet cannot load', async () => {
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/squads', () =>
        HttpResponse.json({ squads: [createSquad({ id: squad.id, complete: true })] }),
      ),
      http.get(url, () => new HttpResponse(null, { status: 500 })),
    )

    openPage()

    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Failed to load the payouts (500)',
    )
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  it('announces loading', async () => {
    serve(sheet())

    openPage()

    expect(await screen.findByText('Loading payouts…')).toBeVisible()
    await screen.findByText('No payouts are recorded for this squad.')
  })
})

describe('the entry sheet (PAY-07, PAY-12, D-270, D-278)', () => {
  it('lists the inferred bowlers first with their detail, and saves a typed amount with no note (PAY-02, PAY-06)', async () => {
    const user = userEvent.setup()
    const done = sheet({
      payees: [
        createPayee({
          registrationId: dana.registrationId,
          name: 'Dana Whitfield',
          payout: { id: 'p1', amount: '100.00', note: null, paid: false },
        }),
        marcus,
      ],
    })
    const sent = serve(sheet(), () => HttpResponse.json({ sheet: done }), done)
    openPage()
    const dialog = await openSheet(user)

    expect(within(dialog).getByText(/Open · cashed, place 9/)).toBeVisible()
    await user.type(amountOf(dialog, 'Dana Whitfield'), '100')
    expect(within(dialog).getByText('$100.00')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Save payouts' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(sent).toEqual([
      {
        payouts: [{ registrationId: dana.registrationId, amount: '100', note: null }],
      },
    ])
    expect(await screen.findByText('Payouts saved.')).toBeVisible()
    expect(
      within(screen.getByRole('table', { name: 'Payouts' })).getByText('$100.00'),
    ).toBeVisible()
  })

  it('fills every inferred bowler with one amount and names them first (PAY-08, D-270)', async () => {
    const user = userEvent.setup()
    serve(sheet())
    openPage()
    const dialog = await openSheet(user)

    await user.click(within(dialog).getByRole('button', { name: 'Same amount for all' }))
    const same = await screen.findByRole('dialog', { name: 'Same amount for all' })
    expect(within(same).getByText('These 2 bowlers are inferred to get the amount:')).toBeVisible()
    expect(within(same).getByText('Dana Whitfield')).toBeVisible()
    expect(within(same).getByText('Marcus Lee')).toBeVisible()
    await user.type(within(same).getByLabelText('Amount for each ($)'), '100')
    await user.click(within(same).getByRole('button', { name: 'Fill 2 boxes' }))

    expect(amountOf(dialog, 'Dana Whitfield')).toHaveValue('100')
    expect(amountOf(dialog, 'Marcus Lee')).toHaveValue('100')
  })

  it('refuses a bad amount in the same-amount dialog next to its box (PAY-08)', async () => {
    const user = userEvent.setup()
    serve(sheet())
    openPage()
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Same amount for all' }))
    const same = await screen.findByRole('dialog', { name: 'Same amount for all' })

    await user.click(within(same).getByRole('button', { name: 'Fill 2 boxes' }))
    expect(within(same).getByText('Enter the amount each bowler gets')).toBeVisible()
    await user.type(within(same).getByLabelText('Amount for each ($)'), 'abc')
    await user.click(within(same).getByRole('button', { name: 'Fill 2 boxes' }))

    expect(within(same).getByText('Enter dollars and cents, like 100.00')).toBeVisible()
    expect(amountOf(dialog, 'Dana Whitfield')).toHaveValue('')
  })

  it('adds a bowler the results did not infer, and asks for a note before it saves (PAY-06, D-269)', async () => {
    const user = userEvent.setup()
    const sent = serve(sheet())
    openPage()
    const dialog = await openSheet(user)

    await user.click(within(dialog).getByRole('button', { name: 'Add another bowler' }))
    const add = await screen.findByRole('dialog', { name: 'Add another bowler' })
    await user.type(within(add).getByLabelText('Search by name'), 'be')
    expect(within(add).getByText('Tom Becker')).toBeVisible()
    expect(within(add).getByText('Ann Bell')).toBeVisible()
    await user.type(within(add).getByLabelText('Search by name'), 'c')
    expect(within(add).queryByText('Ann Bell')).not.toBeInTheDocument()
    await user.click(within(add).getByRole('button', { name: 'Add Tom Becker' }))
    await user.click(within(add).getByRole('button', { name: 'Close' }))

    expect(within(dialog).getByText('added by hand')).toBeVisible()
    await user.type(amountOf(dialog, 'Tom Becker'), '25')
    await user.click(within(dialog).getByRole('button', { name: 'Save payouts' }))

    expect(await within(dialog).findByText('Say why this bowler is paid')).toBeVisible()
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      '1 row needs fixing. Nothing was saved.',
    )
    expect(sent).toEqual([])

    await user.type(
      within(dialog).getByLabelText('Note (required) for Tom Becker'),
      'Lane breakdown',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save payouts' }))

    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
    expect(sent[0]).toEqual({
      payouts: [{ registrationId: tom.registrationId, amount: '25', note: 'Lane breakdown' }],
    })
  })

  it('says when everyone entered is already listed or nothing matches (PAY-06)', async () => {
    const user = userEvent.setup()
    serve(sheet({ others: [] }))
    openPage()
    const dialog = await openSheet(user)

    await user.click(within(dialog).getByRole('button', { name: 'Add another bowler' }))

    expect(
      await screen.findByText('Everyone entered in this event is already listed.'),
    ).toBeVisible()
  })

  it('names a bad amount next to its box and sends nothing (PAY-07, D-270)', async () => {
    const user = userEvent.setup()
    const sent = serve(sheet())
    openPage()
    const dialog = await openSheet(user)

    await user.type(amountOf(dialog, 'Dana Whitfield'), '-5')
    await user.type(amountOf(dialog, 'Marcus Lee'), '100000')
    await user.click(within(dialog).getByRole('button', { name: 'Save payouts' }))

    expect(await within(dialog).findByText('Enter an amount above $0.00')).toBeVisible()
    expect(within(dialog).getByText('The most you can enter is $99,999.99')).toBeVisible()
    expect(amountOf(dialog, 'Dana Whitfield')).toBeInvalid()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('2 rows need fixing')
    expect(sent).toEqual([])
  })

  it('shows the rows the API marked, without losing what was typed (PAY-12)', async () => {
    const user = userEvent.setup()
    serve(sheet(), () =>
      HttpResponse.json(
        {
          message: 'Fix the rows marked and save again.',
          errors: { [`amount:${dana.registrationId}`]: 'Enter an amount above $0.00' },
        },
        { status: 400 },
      ),
    )
    openPage()
    const dialog = await openSheet(user)
    await user.type(amountOf(dialog, 'Dana Whitfield'), '5')

    await user.click(within(dialog).getByRole('button', { name: 'Save payouts' }))

    expect(await within(dialog).findByText('Enter an amount above $0.00')).toBeVisible()
    expect(amountOf(dialog, 'Dana Whitfield')).toHaveValue('5')
  })

  it('shows why the API refused a save and keeps the sheet open (PAY-10, PAY-11)', async () => {
    const user = userEvent.setup()
    const reason = 'This tournament is complete. Payouts are locked.'
    serve(sheet(), () =>
      HttpResponse.json({ message: reason, errors: { event: reason } }, { status: 409 }),
    )
    openPage()
    const dialog = await openSheet(user)
    await user.type(amountOf(dialog, 'Dana Whitfield'), '5')

    await user.click(within(dialog).getByRole('button', { name: 'Save payouts' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(reason)
    expect(screen.getByRole('dialog', { name: 'Payouts: Squad' })).toBeVisible()
  })

  it('asks before it changes a paid payout, and sends confirmPaid after the tick (PAY-12, D-273)', async () => {
    const user = userEvent.setup()
    const paid = sheet({
      payees: [
        createPayee({
          registrationId: dana.registrationId,
          name: 'Dana Whitfield',
          payout: { id: 'p1', amount: '100.00', note: null, paid: true },
        }),
      ],
    })
    const sent = serve(paid, (_body, count) =>
      count === 1
        ? HttpResponse.json(
            {
              message: 'Confirm to change payouts that are already marked paid.',
              warnings: [{ field: 'paid', message: '1 of these payouts is marked paid.' }],
              paidChanges: [
                {
                  registrationId: dana.registrationId,
                  name: 'Dana Whitfield',
                  from: '100.00',
                  to: '90.00',
                },
              ],
            },
            { status: 409 },
          )
        : HttpResponse.json({ sheet: paid }),
    )
    openPage()
    const dialog = await openSheet(user)
    const box = amountOf(dialog, 'Dana Whitfield')
    await user.clear(box)
    await user.type(box, '90')

    await user.click(within(dialog).getByRole('button', { name: 'Save payouts' }))

    const confirm = await screen.findByRole('dialog', { name: 'Change payouts already paid?' })
    expect(within(confirm).getByText(/Dana Whitfield \(\$100.00 to \$90.00\)/)).toBeVisible()
    const save = within(confirm).getByRole('button', { name: 'Save payouts' })
    expect(save).toBeDisabled()
    await user.click(within(confirm).getByLabelText('I know this was already paid out'))
    await user.click(save)

    await waitFor(() => {
      expect(sent).toHaveLength(2)
    })
    expect(sent[0]).not.toHaveProperty('confirmPaid')
    expect(sent[1]).toMatchObject({ confirmPaid: true })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('names a deleted paid payout in the confirm, and Back keeps the sheet (PAY-12, D-273)', async () => {
    const user = userEvent.setup()
    const paid = sheet({
      payees: [
        createPayee({
          registrationId: dana.registrationId,
          name: 'Dana Whitfield',
          payout: { id: 'p1', amount: '100.00', note: null, paid: true },
        }),
      ],
    })
    serve(paid, () =>
      HttpResponse.json(
        {
          message: 'Confirm',
          warnings: [{ field: 'paid', message: 'x' }],
          paidChanges: [
            {
              registrationId: dana.registrationId,
              name: 'Dana Whitfield',
              from: '100.00',
              to: null,
            },
          ],
        },
        { status: 409 },
      ),
    )
    openPage()
    const dialog = await openSheet(user)
    await user.clear(amountOf(dialog, 'Dana Whitfield'))
    await user.click(within(dialog).getByRole('button', { name: 'Save payouts' }))

    const confirm = await screen.findByRole('dialog', { name: 'Change payouts already paid?' })
    expect(within(confirm).getByText(/Dana Whitfield \(\$100.00, deleted\)/)).toBeVisible()
    await user.click(within(confirm).getByRole('button', { name: 'Back' }))

    expect(
      screen.queryByRole('dialog', { name: 'Change payouts already paid?' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Payouts: Squad' })).toBeVisible()
  })

  it('asks before it discards typed work, and closes at once when nothing was typed', async () => {
    const user = userEvent.setup()
    serve(sheet())
    openPage()
    let dialog = await openSheet(user)

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    dialog = await openSheet(user)
    await user.type(amountOf(dialog, 'Dana Whitfield'), '100')
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    const ask = await screen.findByRole('dialog', { name: 'Discard what you typed?' })
    await user.click(within(ask).getByRole('button', { name: 'Keep editing' }))
    expect(amountOf(dialog, 'Dana Whitfield')).toHaveValue('100')

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Discard what you typed?' })).getByRole(
        'button',
        { name: 'Discard' },
      ),
    )
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('opens a hand-added note box that already holds its saved note, and a blank sheet says so (PAY-06)', async () => {
    const user = userEvent.setup()
    serve(
      sheet({
        payees: [
          createPayee({
            registrationId: tom.registrationId,
            name: 'Tom Becker',
            inferred: false,
            detail: 'added by hand',
            payout: { id: 'p2', amount: '25.00', note: 'Lane breakdown', paid: false },
          }),
        ],
        others: [],
      }),
    )
    openPage()
    const dialog = await openSheet(user)

    expect(within(dialog).getByLabelText('Note (required) for Tom Becker')).toHaveValue(
      'Lane breakdown',
    )
    expect(amountOf(dialog, 'Tom Becker')).toHaveValue('25.00')
  })

  it('says no one is inferred, and still offers Add another bowler, for an event with no casher', async () => {
    const user = userEvent.setup()
    serve(sheet({ payees: [] }))
    openPage()
    const dialog = await openSheet(user)

    expect(within(dialog).getByText(/No bowler is inferred to be paid in this event/)).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Add another bowler' })).toBeVisible()
  })

  it('sends a cleared amount of a saved payout as a delete, and an empty box of a new row not at all (PAY-07, D-270)', async () => {
    const user = userEvent.setup()
    const saved = sheet({
      payees: [
        createPayee({
          registrationId: dana.registrationId,
          name: 'Dana Whitfield',
          payout: { id: 'p1', amount: '100.00', note: null, paid: false },
        }),
        marcus,
      ],
    })
    const sent = serve(saved)
    openPage()
    const dialog = await openSheet(user)
    await user.clear(amountOf(dialog, 'Dana Whitfield'))

    await user.click(within(dialog).getByRole('button', { name: 'Save payouts' }))

    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
    expect(sent[0]).toEqual({
      payouts: [{ registrationId: dana.registrationId, amount: '', note: null }],
    })
  })

  it('opens the note box of an inferred bowler from Add note on request', async () => {
    const user = userEvent.setup()
    serve(sheet())
    openPage()
    const dialog = await openSheet(user)

    await user.click(
      within(dialog).getAllByRole('button', { name: /^Add note for/ })[0] as HTMLElement,
    )

    expect(within(dialog).queryAllByRole('button', { name: /^Add note for/ })).toHaveLength(1)
  })
})

describe('the finals sheet (PAY-05, PAY-08, D-270, D-277)', () => {
  const divisionId = 'd0000000-0000-4000-8000-00000000000a'
  const finals = createSheet({
    event: {
      source: 'finals',
      eventId: divisionId,
      label: 'Finals: Open',
      date: null,
      divisionName: 'Open',
    },
    payees: [
      createPayee({
        registrationId: dana.registrationId,
        name: 'Dana Whitfield',
        detail: 'seed 1',
        seed: 1,
      }),
      createPayee({
        registrationId: marcus.registrationId,
        name: 'Marcus Lee',
        detail: 'seed 2',
        seed: 2,
      }),
      createPayee({
        registrationId: 'a0000000-0000-4000-8000-00000000000e',
        name: 'Lois Park',
        detail: 'seed 3',
        seed: 3,
      }),
    ],
  })

  it('fills only the ticked finalists (D-270)', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get(`/v1/tournaments/${tournament.id}/payouts/finals/${divisionId}`, () =>
        HttpResponse.json({ sheet: finals }),
      ),
    )
    renderApp(`/tournaments/${tournament.id}/seeding/${divisionId}/payouts`)
    await user.click(await screen.findByRole('button', { name: 'Enter payouts' }))
    const dialog = await screen.findByRole('dialog', { name: 'Payouts: Finals: Open' })

    await user.click(within(dialog).getByLabelText('Include Marcus Lee in Same amount'))
    await user.click(within(dialog).getByLabelText('Include Lois Park in Same amount'))
    await user.click(within(dialog).getByRole('button', { name: 'Same amount for ticked' }))
    const same = await screen.findByRole('dialog', { name: 'Same amount for ticked rows' })
    expect(within(same).getByText('These 2 bowlers are ticked to get the amount:')).toBeVisible()
    await user.type(within(same).getByLabelText('Amount for each ($)'), '400')
    await user.click(within(same).getByRole('button', { name: 'Fill 2 boxes' }))

    expect(amountOf(dialog, 'Dana Whitfield')).toHaveValue('')
    expect(amountOf(dialog, 'Marcus Lee')).toHaveValue('400')
    expect(amountOf(dialog, 'Lois Park')).toHaveValue('400')
  })

  it('says to tick finalists first when none is ticked', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get(`/v1/tournaments/${tournament.id}/payouts/finals/${divisionId}`, () =>
        HttpResponse.json({ sheet: finals }),
      ),
    )
    renderApp(`/tournaments/${tournament.id}/seeding/${divisionId}/payouts`)
    await user.click(await screen.findByRole('button', { name: 'Enter payouts' }))
    const dialog = await screen.findByRole('dialog', { name: 'Payouts: Finals: Open' })

    await user.click(within(dialog).getByRole('button', { name: 'Same amount for ticked' }))

    expect(
      await screen.findByText('Tick the finalists who get the same amount first.'),
    ).toBeVisible()
  })

  it('titles the page with the division and links back to Seeding', async () => {
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get(`/v1/tournaments/${tournament.id}/payouts/finals/${divisionId}`, () =>
        HttpResponse.json({ sheet: finals }),
      ),
    )

    renderApp(`/tournaments/${tournament.id}/seeding/${divisionId}/payouts`)

    expect(
      await screen.findByRole('heading', { name: 'Finals payouts: Open', level: 1 }),
    ).toBeVisible()
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Seeding' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/seeding`,
    )
  })
})

describe('the super sweeper page (PAY-04)', () => {
  it('titles the page and links back to the Sweepers', async () => {
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get(`/v1/tournaments/${tournament.id}/payouts/super-sweeper`, () =>
        HttpResponse.json({
          sheet: createSheet({
            event: {
              source: 'superSweeper',
              eventId: tournament.id,
              label: 'Super sweeper',
              date: null,
              divisionName: null,
            },
            payees: [dana],
          }),
        }),
      ),
    )

    renderApp(`/tournaments/${tournament.id}/super-sweeper/payouts`)

    expect(
      await screen.findByRole('heading', { name: 'Super sweeper payouts', level: 1 }),
    ).toBeVisible()
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Sweepers' }),
    ).toHaveAttribute('href', `/tournaments/${tournament.id}/sweepers`)
  })
})

describe('the same-amount dialog with few bowlers (PAY-08)', () => {
  it('says "This bowler" and "Fill 1 box" for one inferred bowler', async () => {
    const user = userEvent.setup()
    serve(sheet({ payees: [dana] }))
    openPage()
    const dialog = await openSheet(user)

    await user.click(within(dialog).getByRole('button', { name: 'Same amount for all' }))
    const same = await screen.findByRole('dialog', { name: 'Same amount for all' })

    expect(within(same).getByText('This bowler is inferred to get the amount:')).toBeVisible()
    await user.type(within(same).getByLabelText('Amount for each ($)'), '75')
    await user.click(within(same).getByRole('button', { name: 'Fill 1 box' }))
    expect(amountOf(dialog, 'Dana Whitfield')).toHaveValue('75')
  })

  it('says no bowler is inferred, and offers no Fill button, when the results name none', async () => {
    const user = userEvent.setup()
    serve(sheet({ payees: [] }))
    openPage()
    const dialog = await openSheet(user)

    await user.click(within(dialog).getByRole('button', { name: 'Same amount for all' }))
    const same = await screen.findByRole('dialog', { name: 'Same amount for all' })

    expect(within(same).getByText('No bowler is inferred to be paid in this event.')).toBeVisible()
    expect(within(same).queryByRole('button', { name: /^Fill/ })).not.toBeInTheDocument()
  })
})

describe('the paid-change confirm while it saves (PAY-12, D-273)', () => {
  it('ignores Escape while the confirmed save is in flight', async () => {
    const user = userEvent.setup()
    const paid = sheet({
      payees: [
        createPayee({
          registrationId: dana.registrationId,
          name: 'Dana Whitfield',
          payout: { id: 'p1', amount: '100.00', note: null, paid: true },
        }),
      ],
    })
    serve(paid)
    server.use(
      http.put(url, async ({ request }) => {
        const body: unknown = await request.json()
        if (typeof body === 'object' && body !== null && 'confirmPaid' in body) {
          await new Promise(() => undefined)
        }
        return HttpResponse.json(
          {
            message: 'Confirm',
            warnings: [{ field: 'paid', message: 'x' }],
            paidChanges: [
              {
                registrationId: dana.registrationId,
                name: 'Dana Whitfield',
                from: '100.00',
                to: '90.00',
              },
            ],
          },
          { status: 409 },
        )
      }),
    )
    openPage()
    const dialog = await openSheet(user)
    const box = amountOf(dialog, 'Dana Whitfield')
    await user.clear(box)
    await user.type(box, '90')
    await user.click(within(dialog).getByRole('button', { name: 'Save payouts' }))
    const confirm = await screen.findByRole('dialog', { name: 'Change payouts already paid?' })
    await user.click(within(confirm).getByLabelText('I know this was already paid out'))
    await user.click(within(confirm).getByRole('button', { name: 'Save payouts' }))
    await waitFor(() => {
      expect(within(confirm).getByRole('button', { name: /Saving/ })).toBeDisabled()
    })

    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(confirm, cancel)

    expect(cancel.defaultPrevented).toBe(true)
    expect(confirm).toBeVisible()
  })
})

describe('the event page when the tournament is gone or the save notice is dismissed', () => {
  it('says the tournament does not exist when the sheet answers 404 "Tournament not found"', async () => {
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/squads', () =>
        HttpResponse.json({
          squads: [createSquad({ id: squad.id, date: squad.date, complete: true })],
        }),
      ),
      http.get(url, () => HttpResponse.json({ message: 'Tournament not found' }, { status: 404 })),
    )

    openPage()

    expect(await screen.findByText('This tournament does not exist.')).toBeVisible()
  })

  it('closes the "Payouts saved." notice with its Dismiss button', async () => {
    const user = userEvent.setup()
    serve(sheet())
    openPage()
    const dialog = await openSheet(user)
    await user.type(amountOf(dialog, 'Dana Whitfield'), '100')
    await user.click(within(dialog).getByRole('button', { name: 'Save payouts' }))
    expect(await screen.findByText('Payouts saved.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText('Payouts saved.')).not.toBeInTheDocument()
  })
})

describe('the paid-change confirm before the tick (PAY-12, D-273)', () => {
  it('sends nothing when the form is submitted without the tick', async () => {
    const user = userEvent.setup()
    const paid = sheet({
      payees: [
        createPayee({
          registrationId: dana.registrationId,
          name: 'Dana Whitfield',
          payout: { id: 'p1', amount: '100.00', note: null, paid: true },
        }),
      ],
    })
    const sent = serve(paid, () =>
      HttpResponse.json(
        {
          message: 'Confirm',
          warnings: [{ field: 'paid', message: 'x' }],
          paidChanges: [
            {
              registrationId: dana.registrationId,
              name: 'Dana Whitfield',
              from: '100.00',
              to: '90.00',
            },
          ],
        },
        { status: 409 },
      ),
    )
    openPage()
    const dialog = await openSheet(user)
    const box = amountOf(dialog, 'Dana Whitfield')
    await user.clear(box)
    await user.type(box, '90')
    await user.click(within(dialog).getByRole('button', { name: 'Save payouts' }))
    const confirm = await screen.findByRole('dialog', { name: 'Change payouts already paid?' })

    const form = confirm.querySelector('form')
    expect(form).not.toBeNull()
    if (form) fireEvent.submit(form)

    expect(sent).toHaveLength(1)
    expect(confirm).toBeVisible()
  })
})

describe('a failed load of the event page', () => {
  it('shows the error and loads again on Try again', async () => {
    const user = userEvent.setup()
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/squads', () =>
        HttpResponse.json({
          squads: [createSquad({ id: squad.id, date: squad.date, complete: true })],
        }),
      ),
      http.get(url, () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
          : HttpResponse.json({ sheet: sheet() })
      }),
    )
    openPage()

    await user.click(await screen.findByRole('button', { name: /try again/i }))

    expect(await screen.findByRole('button', { name: 'Enter payouts' })).toBeVisible()
  })
})

describe('leaving the page with typed amounts (PAY-12)', () => {
  const tabLink = (name: string) =>
    within(screen.getByRole('navigation', { name: 'Squad pages' })).getByRole('link', { name })

  it('asks before another page opens, and Stay keeps the sheet', async () => {
    const user = userEvent.setup()
    serve(sheet())
    openPage()
    const dialog = await openSheet(user)
    await user.type(amountOf(dialog, 'Dana Whitfield'), '100')

    await user.click(tabLink('Scores'))

    const leave = await screen.findByRole('dialog', { name: 'Leave without saving?' })
    await user.click(within(leave).getByRole('button', { name: 'Stay on this page' }))
    expect(screen.getByRole('dialog', { name: 'Payouts: Squad' })).toBeVisible()
    expect(amountOf(dialog, 'Dana Whitfield')).toHaveValue('100')
  })

  it('lets another page open when nothing was typed', async () => {
    const user = userEvent.setup()
    serve(sheet())
    openPage()
    await openSheet(user)

    await user.click(tabLink('Scores'))

    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).not.toBeInTheDocument()
  })
})
