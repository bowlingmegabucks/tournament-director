import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setMockUser } from '../../mocks/authHandlers'
import { createAverageRow, createSignedInUser, createTournament } from '../../mocks/data'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/renderApp'
import type { AverageRow } from './types'

const tournament = createTournament({ name: 'Spring Open' })
const base = `/v1/tournaments/${tournament.id}`

const carla = createAverageRow({ registrationId: 'r-carla', bowlerName: 'Carla Mendes' })
const bill = createAverageRow({
  registrationId: 'r-bill',
  bowlerName: 'Bill Tran',
  providedAverage: 175,
  averageInUse: 182,
  status: 'adjusted',
  note: 'USBC book average',
  verifiedBy: 'Dana Reyes',
  verifiedAt: '2026-11-17T21:12:00.000Z',
})
const anita = createAverageRow({
  registrationId: 'r-anita',
  bowlerName: 'Anita Brooks',
  providedAverage: 178,
  averageInUse: 178,
  status: 'verified',
})
const priya = createAverageRow({
  registrationId: 'r-priya',
  bowlerName: 'Priya Natarajan',
  providedAverage: null,
  averageInUse: null,
})

interface Call {
  method: string
  registrationId: string
  body?: unknown
  search?: string
}

function serve(
  options: {
    rows?: AverageRow[]
    complete?: boolean
    putStatus?: (call: Call) => { status: number; body: Record<string, unknown> } | undefined
  } = {},
) {
  const calls: Call[] = []
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get(`${base}/averages`, () =>
      HttpResponse.json({
        rows: options.rows ?? [carla, bill, anita, priya],
        tournamentComplete: options.complete === true,
      }),
    ),
    http.put(`${base}/registrations/:registrationId/average-check`, async ({ params, request }) => {
      const call: Call = {
        method: 'PUT',
        registrationId: String(params['registrationId']),
        body: await request.json(),
      }
      calls.push(call)
      const answer = options.putStatus?.(call)
      if (answer) return HttpResponse.json(answer.body, { status: answer.status })
      return HttpResponse.json({ registrationId: call.registrationId, status: 'verified' })
    }),
    http.delete(`${base}/registrations/:registrationId/average-check`, ({ params, request }) => {
      const call: Call = {
        method: 'DELETE',
        registrationId: String(params['registrationId']),
        search: new URL(request.url).search,
      }
      calls.push(call)
      const answer = options.putStatus?.(call)
      if (answer) return HttpResponse.json(answer.body, { status: answer.status })
      return HttpResponse.json({ registrationId: call.registrationId, status: 'unverified' })
    }),
  )
  return calls
}

const open = (search = '') => renderApp(`/tournaments/${tournament.id}/averages${search}`)

beforeEach(() => {
  setMockUser(createSignedInUser({ roles: ['director'] }))
})

describe('the Averages page (AVG-02, D-295)', () => {
  it('lists the unverified registrations first, with a chip for each (AVG-02, AVG-12)', async () => {
    serve()

    open()

    expect(await screen.findByRole('heading', { name: 'Averages', level: 1 })).toBeVisible()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Carla Mendes')).toBeVisible()
    expect(within(table).getByText('Not verified')).toBeVisible()
    expect(within(table).getByText('No average')).toBeVisible()
    expect(within(table).queryByText('Bill Tran')).not.toBeInTheDocument()
    expect(screen.getByText(/Showing 2 of 4 registrations in handicap divisions/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Unverified (2)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('shows every row under All, with its status (AVG-02)', async () => {
    const user = userEvent.setup()
    serve()
    open()

    await user.click(await screen.findByRole('button', { name: 'All (4)' }))

    const table = screen.getByRole('table')
    expect(within(table).getByText('Verified')).toBeVisible()
    expect(within(table).getByText('Adjusted')).toBeVisible()
    expect(within(table).getByText('182')).toBeVisible()
  })

  it('opens on All when the address says so (AVG-02)', async () => {
    serve()

    open('?show=all')

    expect(await screen.findByText('Anita Brooks')).toBeVisible()
  })

  it('finds a bowler by the start of a name (AVG-02)', async () => {
    const user = userEvent.setup()
    serve()
    open('?show=all')

    await user.type(await screen.findByLabelText('Find a bowler'), 'bi')

    const table = screen.getByRole('table')
    expect(within(table).getByText('Bill Tran')).toBeVisible()
    expect(within(table).queryByText('Carla Mendes')).not.toBeInTheDocument()
  })

  it('says so when nothing is left to check (AVG-02)', async () => {
    serve({ rows: [anita, bill] })

    open()

    expect(
      await screen.findByText(
        'Every handicap bowler has a checked average. Choose All to review them.',
      ),
    ).toBeVisible()
  })

  it('says so when no division has a handicap (AVG-02)', async () => {
    serve({ rows: [] })

    open()

    expect(
      await screen.findByText(
        'This tournament has no handicap divisions, so there are no averages to check.',
      ),
    ).toBeVisible()
  })

  it('shows an error with Try again when the list fails to load', async () => {
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get(`${base}/averages`, () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    )

    open()

    // The page asks twice before it gives up (D-51), so the alert takes a moment.
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'Failed to load the averages (500)',
    )
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  it('links to the page from the tournament menu (AVG-02)', async () => {
    serve()

    open()

    const menu = await screen.findByRole('navigation', { name: 'Spring Open' })
    expect(within(menu).getByRole('link', { name: 'Averages' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/averages`,
    )
  })
})

describe('verify (AVG-03)', () => {
  it('sends a verify and says so', async () => {
    const user = userEvent.setup()
    const calls = serve()
    open()

    await user.click(await screen.findByRole('button', { name: 'Verify Carla Mendes' }))

    await waitFor(() => {
      expect(calls).toEqual([
        { method: 'PUT', registrationId: 'r-carla', body: { action: 'verify' } },
      ])
    })
    expect(await screen.findByText('Average verified for Carla Mendes.')).toBeVisible()
  })

  it('offers no Verify to a bowler with no average, only Adjust (AVG-03)', async () => {
    serve()

    open()

    await screen.findByText('Priya Natarajan')
    expect(screen.queryByRole('button', { name: 'Verify Priya Natarajan' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adjust Priya Natarajan' })).toBeVisible()
  })

  it('asks to confirm when the API warns that results change, then sends it again (AVG-06)', async () => {
    const user = userEvent.setup()
    const calls = serve({
      rows: [bill],
      putStatus: (call) =>
        (call.body as { confirmWarnings?: boolean } | undefined)?.confirmWarnings
          ? undefined
          : {
              status: 409,
              body: {
                message: 'Bill Tran already has scores.',
                warnings: [{ field: 'average', message: 'Bill Tran already has scores.' }],
              },
            },
    })
    open('?show=all')

    await user.click(await screen.findByRole('button', { name: 'Adjust Bill Tran' }))
    const adjust = await screen.findByRole('dialog', { name: /Adjust average/ })
    await user.click(within(adjust).getByRole('button', { name: 'Save adjusted average' }))
    expect(await within(adjust).findByText('Bill Tran already has scores.')).toBeVisible()
    await user.click(within(adjust).getByRole('button', { name: 'Adjust anyway' }))

    await waitFor(() => {
      expect(calls).toHaveLength(2)
    })
    expect(calls[1]?.body).toMatchObject({ action: 'adjust', confirmWarnings: true })
  })
})

describe('adjust (AVG-04, AVG-05)', () => {
  it('sends the new average and the note (AVG-04)', async () => {
    const user = userEvent.setup()
    const calls = serve()
    open()

    await user.click(await screen.findByRole('button', { name: 'Adjust Carla Mendes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Adjust average: Carla Mendes' })
    const average = within(dialog).getByLabelText('Verified average')
    await user.clear(average)
    await user.type(average, '182')
    await user.type(within(dialog).getByLabelText(/Why was it adjusted/), 'League sheet, 11/17')
    await user.click(within(dialog).getByRole('button', { name: 'Save adjusted average' }))

    await waitFor(() => {
      expect(calls).toEqual([
        {
          method: 'PUT',
          registrationId: 'r-carla',
          body: { action: 'adjust', average: 182, note: 'League sheet, 11/17' },
        },
      ])
    })
    expect(await screen.findByText('Average adjusted for Carla Mendes.')).toBeVisible()
  })

  it('shows what the API says is wrong next to each field (AVG-04, AVG-05)', async () => {
    const user = userEvent.setup()
    serve({
      putStatus: () => ({
        status: 400,
        body: {
          message:
            'The verified average is above the division limit. Move the bowler to another division.',
          errors: {
            average:
              'The verified average is above the division limit. Move the bowler to another division.',
            note: 'Say why the average changed, or where it came from.',
          },
        },
      }),
    })
    open()

    await user.click(await screen.findByRole('button', { name: 'Adjust Carla Mendes' }))
    const dialog = await screen.findByRole('dialog', { name: /Adjust average/ })
    await user.click(within(dialog).getByRole('button', { name: 'Save adjusted average' }))

    const average = within(dialog).getByLabelText('Verified average')
    expect(average).toBeInvalid()
    expect(average).toHaveAccessibleDescription(
      'The verified average is above the division limit. Move the bowler to another division.',
    )
    expect(within(dialog).getByLabelText(/Why was it adjusted/)).toHaveAccessibleDescription(
      'Say why the average changed, or where it came from.',
    )
  })

  it('starts from the average in use and the note of an adjusted row (AVG-07)', async () => {
    const user = userEvent.setup()
    serve({ rows: [bill] })
    open('?show=all')

    await user.click(await screen.findByRole('button', { name: 'Adjust Bill Tran' }))

    const dialog = await screen.findByRole('dialog', { name: /Adjust average/ })
    expect(within(dialog).getByLabelText('Verified average')).toHaveValue('182')
    expect(within(dialog).getByLabelText(/Why was it adjusted/)).toHaveValue('USBC book average')
  })
})

describe('remove the check and details (AVG-07, AVG-11)', () => {
  it('removes a check (AVG-07)', async () => {
    const user = userEvent.setup()
    const calls = serve()
    open('?show=all')

    await user.click(await screen.findByRole('button', { name: 'Remove check for Anita Brooks' }))

    await waitFor(() => {
      expect(calls).toEqual([{ method: 'DELETE', registrationId: 'r-anita', search: '' }])
    })
    expect(await screen.findByText('Check removed for Anita Brooks.')).toBeVisible()
  })

  it('confirms a removal the API warns about, then sends it with the confirm (AVG-06, AVG-07)', async () => {
    const user = userEvent.setup()
    const calls = serve({
      putStatus: (call) =>
        call.search?.includes('confirmWarnings')
          ? undefined
          : {
              status: 409,
              body: {
                message: 'Bill Tran already has scores.',
                warnings: [{ field: 'average', message: 'Bill Tran already has scores.' }],
              },
            },
    })
    open('?show=all')

    await user.click(await screen.findByRole('button', { name: 'Remove check for Bill Tran' }))
    const confirm = await screen.findByRole('dialog', { name: 'Change results?' })
    expect(within(confirm).getByText('Bill Tran already has scores.')).toBeVisible()
    await user.click(within(confirm).getByRole('button', { name: 'Change anyway' }))

    await waitFor(() => {
      expect(calls.map((call) => call.search)).toEqual(['', '?confirmWarnings=true'])
    })
  })

  it('shows the provided average, the verified one, the note, and who and when (AVG-11)', async () => {
    const user = userEvent.setup()
    serve()
    open('?show=all')

    await user.click(await screen.findByRole('button', { name: 'Details' }))

    const dialog = await screen.findByRole('dialog', { name: 'Average: Bill Tran' })
    expect(within(dialog).getByText('175')).toBeVisible()
    expect(within(dialog).getByText('182')).toBeVisible()
    expect(within(dialog).getByText('USBC book average')).toBeVisible()
    expect(within(dialog).getByText(/Dana Reyes/)).toBeVisible()
  })
})

describe('who can change an average (AVG-10, AVG-15, D-294)', () => {
  it('shows no buttons to a score keeper, who can read (AVG-10)', async () => {
    setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
    serve()

    open()

    await screen.findByText('Carla Mendes')
    expect(screen.queryByRole('button', { name: /^Verify / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Adjust / })).not.toBeInTheDocument()
  })

  it('says a complete tournament cannot change, and shows no buttons (AVG-15)', async () => {
    serve({ complete: true })

    open()

    expect(
      await screen.findByText('This tournament is complete. Averages cannot change.'),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Verify / })).not.toBeInTheDocument()
  })

  it('refuses a signed-out visitor (AVG-10)', async () => {
    setMockUser(null)
    serve()

    open()

    await waitFor(() => {
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Carla Mendes')).not.toBeInTheDocument()
  })
})
