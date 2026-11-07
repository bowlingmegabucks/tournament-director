import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createDivision,
  createSettings,
  createSignedInUser,
  createSweeper,
  createTournament,
} from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import type { SessionEditInfo } from '../../shared/sessionEdit'
import { renderApp } from '../../test/renderApp'
import type { Sweeper, SweeperChanges } from './types'

const tournament = createTournament({
  name: 'Spring Open',
  startDate: '2026-10-23',
  endDate: '2026-10-25',
})
const open = createDivision({ number: 1, name: 'Open' })
const women = createDivision({ number: 2, name: 'Women' })
const senior = createDivision({ number: 3, name: 'Senior' })
const sweeper = createSweeper({
  date: '2026-10-23T19:00:00',
  startingLane: 11,
  numberOfLanes: 10,
  maxPerPair: 3,
  entryFee: 20,
  games: 3,
  cashRatio: 5,
  bonusPins: [{ divisionId: open.id, divisionName: 'Open', bonusPinsPerGame: 10 }],
})
const url = `/tournaments/${tournament.id}/sweepers/${sweeper.id}/edit`
const listUrl = `/tournaments/${tournament.id}/sweepers`

const noFacts: SessionEditInfo = {
  entryCount: 0,
  assignmentCount: 0,
  hasScores: false,
  lowestAssignedLane: null,
  highestAssignedLane: null,
  fullestPair: null,
}

type Sent = SweeperChanges & { confirmWarnings?: boolean }

/** The reads the page needs, and a PATCH that records what it is given. */
function serve(
  options: {
    sweepers?: Sweeper[]
    divisions?: ReturnType<typeof createDivision>[]
    completed?: boolean
    info?: Partial<SessionEditInfo>
    patch?: (sent: Sent) => Response | Promise<Response>
  } = {},
) {
  const sent: Sent[] = []
  const sweepers = options.sweepers ?? [sweeper]
  const divisions = options.divisions ?? [open, women, senior]
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/settings', () =>
      HttpResponse.json({ settings: createSettings({ completed: options.completed === true }) }),
    ),
    http.get('/v1/tournaments/:id/sweepers', () => HttpResponse.json({ sweepers })),
    http.get('/v1/tournaments/:id/divisions', () => HttpResponse.json({ divisions })),
    http.get('/v1/tournaments/:id/sweepers/:sessionId/edit-info', () =>
      HttpResponse.json({ editInfo: { ...noFacts, ...options.info } }),
    ),
    http.patch('/v1/tournaments/:id/sweepers/:sessionId', async ({ request }) => {
      const body = (await request.json()) as Sent
      sent.push(body)
      if (options.patch) return options.patch(body)
      return HttpResponse.json({ sweeper })
    }),
  )
  return sent
}

const signIn = (role: 'director' | 'scoreKeeper' = 'director') => {
  setMockUser(createSignedInUser({ roles: [role] }))
}
const save = () => screen.getByRole('button', { name: /Save changes|Saving/ })
const box = (name: string) => screen.getByLabelText(name)
const openForm = async (at = url) => {
  renderApp(at)
  await screen.findByRole('heading', { name: 'Edit sweeper', level: 1 })
  await screen.findByLabelText('Date and time (required)', {}, { timeout: 3000 })
}
const retype = async (user: ReturnType<typeof userEvent.setup>, label: string, text: string) => {
  await user.clear(box(label))
  if (text !== '') await user.type(box(label), text)
}

describe('EditSweeperPage (SQD-27, SQD-29)', () => {
  it('shows the form filled with the stored values, a pin box for each division (SQD-27, SQD-29)', async () => {
    signIn()
    serve()

    await openForm()

    expect(box('Date and time (required)')).toHaveValue('2026-10-23T19:00')
    expect(box('Starting lane (required)')).toHaveValue('11')
    expect(box('Number of lanes (required)')).toHaveValue('10')
    expect(box('Bowlers per pair (required)')).toHaveValue('3')
    expect(box('Entry fee (required)')).toHaveValue('20')
    expect(box('Games (required)')).toHaveValue('3')
    expect(box('Cash ratio (required)')).toHaveValue('5')
    expect(box('Open')).toHaveValue('10')
    expect(box('Women')).toHaveValue('')
    expect(box('Senior')).toHaveValue('')
    expect(document.title).toBe('Edit sweeper · Spring Open · Tournament Director')
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', listUrl)
  })

  describe('the notes before the director types (D-180, D-182, D-185)', () => {
    it('shows none when nothing depends on the sweeper', async () => {
      signIn()
      serve()

      await openForm()

      expect(screen.queryByText(/Asks you to confirm/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Locked:/)).not.toBeInTheDocument()
    })

    it('says entries make the date and the fee ask to confirm', async () => {
      signIn()
      serve({ info: { entryCount: 9 } })

      await openForm()

      expect(box('Date and time (required)')).toHaveAccessibleDescription(
        expect.stringContaining('9 bowlers are entered. They planned around this time.'),
      )
      expect(box('Entry fee (required)')).toHaveAccessibleDescription(
        expect.stringContaining('They keep what they paid.'),
      )
      expect(box('Cash ratio (required)')).not.toHaveAccessibleDescription(
        expect.stringContaining('Asks you to confirm'),
      )
    })

    it('locks the games box once a score exists and asks to confirm the cash ratio and each pin box (D-180)', async () => {
      signIn()
      serve({ info: { hasScores: true } })

      await openForm()

      expect(box('Games (required)')).toHaveAttribute('readonly')
      expect(box('Games (required)')).toHaveAccessibleDescription(
        expect.stringContaining('Locked: Scores are saved, so the number of games cannot change.'),
      )
      for (const label of ['Cash ratio (required)', 'Open', 'Women', 'Senior']) {
        expect(box(label)).toHaveAccessibleDescription(
          expect.stringContaining('Scores are saved. Posted results change at once.'),
        )
      }
      expect(box('Cash ratio (required)')).not.toHaveAttribute('readonly')
    })

    it('leaves games open without scores', async () => {
      signIn()
      serve()

      await openForm()

      expect(box('Games (required)')).not.toHaveAttribute('readonly')
    })

    it('limits the lanes with assignments', async () => {
      signIn()
      serve({
        info: {
          assignmentCount: 9,
          lowestAssignedLane: 11,
          highestAssignedLane: 17,
          fullestPair: 3,
        },
      })

      await openForm()

      expect(box('Starting lane (required)')).toHaveAccessibleDescription(
        expect.stringContaining('Lanes 11 to 17 have bowlers assigned'),
      )
      expect(box('Bowlers per pair (required)')).toHaveAccessibleDescription(
        expect.stringContaining('cannot go below 3'),
      )
    })
  })

  describe('saving (SQD-23, SQD-29, D-184)', () => {
    it('sends only the fields that changed and returns to the list with a toast (SQD-27)', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Games (required)', '4')
      await retype(user, 'Entry fee (required)', '25')
      await user.click(save())

      expect(await screen.findByText('Sweeper saved')).toBeVisible()
      expect(sent).toEqual([{ entryFee: 25, games: 4 }])
      expect(screen.getByRole('heading', { name: 'Sweepers', level: 1 })).toBeVisible()
    })

    it('sends only the pins that changed, a blank box as null (SQD-29, D-184)', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Open', '')
      await retype(user, 'Women', '6')
      await user.click(save())

      await waitFor(() => {
        expect(sent).toEqual([{ bonusPins: { [open.id]: null, [women.id]: 6 } }])
      })
    })

    it('does not send a pin typed back to what it was, or a 0 in an empty box (SQD-29)', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Open', '10')
      await retype(user, 'Women', '0')
      await user.click(save())

      await waitFor(() => {
        expect(sent).toEqual([{}])
      })
    })

    it('sends the date as typed, to the minute', async () => {
      signIn()
      const sent = serve()
      await openForm()

      fireEvent.change(box('Date and time (required)'), { target: { value: '2026-10-23T20:30' } })
      await userEvent.setup().click(save())

      await waitFor(() => {
        expect(sent).toEqual([{ date: '2026-10-23T20:30' }])
      })
    })

    it('says Saving and turns Save off while it runs', async () => {
      signIn()
      serve({
        patch: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return HttpResponse.json({ sweeper })
        },
      })
      const user = userEvent.setup()
      await openForm()
      await retype(user, 'Games (required)', '4')

      await user.click(save())

      expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    })
  })

  describe('checks (SQD-10 to SQD-13, SQD-27)', () => {
    it('checks only what the director changed: a stored bad value never blocks another change (D-17)', async () => {
      signIn()
      const odd = createSweeper({ ...sweeper, numberOfLanes: 7 })
      const sent = serve({ sweepers: [odd] })
      const user = userEvent.setup()
      await openForm(`/tournaments/${tournament.id}/sweepers/${odd.id}/edit`)

      await retype(user, 'Games (required)', '5')
      await user.click(save())

      await waitFor(() => {
        expect(sent).toEqual([{ games: 5 }])
      })
    })

    it('shows a summary and sends nothing when a changed box breaks a rule', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Entry fee (required)', '0')
      await retype(user, 'Cash ratio (required)', '')
      await retype(user, 'Open', '120')
      await user.click(save())

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Fix 3 fields to save.')
      expect(within(alert).getByText('Entry fee must be greater than $0')).toBeVisible()
      expect(within(alert).getByText('Cash ratio is required')).toBeVisible()
      expect(within(alert).getByText('Bonus pins must be between 0 and 99')).toBeVisible()
      expect(box('Entry fee (required)')).toHaveFocus()
      expect(sent).toEqual([])
    })
  })

  describe("the API's refusals (SQD-24, SQD-29)", () => {
    it('shows games locked by a score saved since the page opened under the box (D-180)', async () => {
      signIn()
      const message = 'Scores are saved, so the number of games cannot change.'
      serve({
        patch: () => HttpResponse.json({ message, errors: { games: message } }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Games (required)', '4')
      await user.click(save())

      expect(await screen.findByText(message, { selector: 'p' })).toBeVisible()
      expect(box('Games (required)')).toHaveAccessibleDescription(expect.stringContaining(message))
    })

    it('shows a gone division above the pins and keeps the typing (D-177)', async () => {
      signIn()
      const message = 'A division no longer exists. Reload the page'
      serve({
        patch: () =>
          HttpResponse.json({ message, errors: { bonusPins: message } }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Women', '6')
      await user.click(save())

      expect(await screen.findByText(message, { selector: 'p' })).toBeVisible()
      expect(box('Women')).toHaveValue('6')
    })

    it('shows a pin message under its own box', async () => {
      signIn()
      const message = 'Bonus pins must be between 0 and 99'
      serve({
        patch: () =>
          HttpResponse.json(
            { message, errors: { [`bonusPins.${women.id}`]: message } },
            { status: 409 },
          ),
      })
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Women', '6')
      await user.click(save())

      await waitFor(() => {
        expect(box('Women')).toHaveAccessibleDescription(expect.stringContaining(message))
      })
    })

    it('shows a complete sweeper or tournament that turned complete as a toast (D-181)', async () => {
      signIn()
      const message = 'This sweeper is complete and cannot be changed'
      serve({
        patch: () => HttpResponse.json({ message, errors: { session: message } }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Games (required)', '4')
      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
    })

    it('shows an outage as an error toast that stays', async () => {
      signIn()
      serve({ patch: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Games (required)', '4')
      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save the sweeper (503)')
      expect(box('Games (required)')).toHaveValue('4')
    })
  })

  describe('the confirm dialog (SQD-25, SQD-28, D-129)', () => {
    const warnings = [
      { field: 'cashRatio', message: 'Scores are saved. Posted results change at once.' },
      {
        field: `bonusPins.${open.id}`,
        message: 'Open: scores are saved. Posted results change at once.',
      },
    ]
    const warn = (sent: Sent) =>
      sent.confirmWarnings === true
        ? HttpResponse.json({ sweeper })
        : HttpResponse.json(
            { message: 'Confirm these changes to save them.', warnings },
            { status: 409 },
          )

    async function openDialog() {
      signIn()
      const sent = serve({ info: { hasScores: true }, patch: warn })
      const user = userEvent.setup()
      await openForm()
      await retype(user, 'Cash ratio (required)', '4')
      await retype(user, 'Open', '8')
      await user.click(save())
      return { sent, user }
    }

    it('lists each warning with the change behind it, pins by division name (SQD-28)', async () => {
      await openDialog()

      const dialog = await screen.findByRole('dialog', { name: 'Save these changes?' })
      for (const item of warnings) expect(within(dialog).getByText(item.message)).toBeVisible()
      expect(within(dialog).getByText('Cash ratio: 1 in 5.0 → 1 in 4.0')).toBeVisible()
      expect(within(dialog).getByText('Open bonus pins: 10 → 8')).toBeVisible()
    })

    it('Go back closes it, keeps the typing, and sends nothing more', async () => {
      const { sent, user } = await openDialog()
      await screen.findByRole('dialog')

      await user.click(screen.getByRole('button', { name: 'Go back' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(box('Open')).toHaveValue('8')
      expect(sent).toHaveLength(1)
    })

    it('Save anyway sends the same changes with confirmWarnings and returns to the list', async () => {
      const { sent, user } = await openDialog()
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))

      expect(await screen.findByText('Sweeper saved')).toBeVisible()
      const changes = { cashRatio: 4, bonusPins: { [open.id]: 8 } }
      expect(sent).toEqual([changes, { ...changes, confirmWarnings: true }])
    })

    it('closes and shows the refusal when the confirmed save is refused (SQD-24)', async () => {
      signIn()
      const message = 'Scores are saved, so the number of games cannot change.'
      serve({
        info: { hasScores: true },
        patch: (body) =>
          body.confirmWarnings === true
            ? HttpResponse.json({ message, errors: { games: message } }, { status: 409 })
            : HttpResponse.json(
                { message: 'Confirm these changes to save them.', warnings: [warnings[0]] },
                { status: 409 },
              ),
      })
      const user = userEvent.setup()
      await openForm()
      await retype(user, 'Cash ratio (required)', '4')
      await user.click(save())
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      await waitFor(() => {
        expect(box('Games (required)')).toHaveAccessibleDescription(
          expect.stringContaining(message),
        )
      })
    })

    it('says why inside the dialog when the confirmed save fails another way', async () => {
      signIn()
      serve({
        info: { hasScores: true },
        patch: (body) =>
          body.confirmWarnings === true
            ? new HttpResponse(null, { status: 503 })
            : HttpResponse.json(
                { message: 'Confirm these changes to save them.', warnings: [warnings[0]] },
                { status: 409 },
              ),
      })
      const user = userEvent.setup()
      await openForm()
      await retype(user, 'Cash ratio (required)', '4')
      await user.click(save())
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Failed to save the sweeper (503)',
      )
    })
  })

  describe('states (SQD-27)', () => {
    it('shows a notice in place of the form for a complete tournament (D-181)', async () => {
      signIn()
      serve({ completed: true })

      renderApp(url)

      expect(await screen.findByText('This tournament is complete')).toBeVisible()
      expect(screen.queryByLabelText('Games (required)')).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to sweepers' })).toHaveAttribute(
        'href',
        listUrl,
      )
    })

    it('shows a notice in place of the form for a complete sweeper (D-181)', async () => {
      signIn()
      serve({ sweepers: [{ ...sweeper, complete: true }] })

      renderApp(url)

      expect(await screen.findByText('This sweeper is complete')).toBeVisible()
      expect(screen.queryByLabelText('Games (required)')).not.toBeInTheDocument()
    })

    it('says so when the sweeper is not in the list', async () => {
      signIn()
      serve({ sweepers: [] })

      renderApp(url)

      expect(await screen.findByText('Sweeper not found')).toBeVisible()
    })

    it('shows the loading state first', async () => {
      signIn()
      serve()

      renderApp(url)

      expect(await screen.findByText('Loading the form…')).toBeVisible()
      await screen.findByLabelText('Games (required)')
    })

    it(
      'shows an error with Try again when the edit-info read fails, and recovers',
      { timeout: 10000 },
      async () => {
        signIn()
        let fail = true
        serve()
        server.use(
          http.get('/v1/tournaments/:id/sweepers/:sessionId/edit-info', () =>
            fail
              ? new HttpResponse(null, { status: 500 })
              : HttpResponse.json({ editInfo: noFacts }),
          ),
        )
        const user = userEvent.setup()
        renderApp(url)

        const retry = await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 })
        fail = false
        await user.click(retry)

        expect(await screen.findByLabelText('Games (required)')).toBeVisible()
      },
    )

    it('shows an error with Try again when the divisions read fails', async () => {
      signIn()
      serve()
      server.use(
        http.get('/v1/tournaments/:id/divisions', () => new HttpResponse(null, { status: 500 })),
      )

      renderApp(url)

      expect(
        await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 }),
      ).toBeVisible()
    })

    it('shows the pins group with a note and no boxes for a tournament with no divisions', async () => {
      signIn()
      serve({ divisions: [], sweepers: [{ ...sweeper, bonusPins: [] }] })

      await openForm()

      expect(screen.getByText(/This tournament has no divisions yet/)).toBeVisible()
    })
  })

  describe('who may open it (D-102)', () => {
    it('sends a signed-out visitor to sign in', async () => {
      serve()

      renderApp(url)

      expect(await screen.findByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
    })

    it('tells a score keeper they have no permission', async () => {
      signIn('scoreKeeper')
      serve()

      renderApp(url)

      expect(await screen.findByText('You do not have permission to view this page.')).toBeVisible()
    })
  })
})

describe('the Edit link on the Sweepers page (SQD-30, D-181, D-185)', () => {
  const second = createSweeper({ date: '2026-10-24T18:00:00', complete: true })
  const cards = [sweeper, second]

  it('shows a link for each open sweeper to a director, named with the date', async () => {
    signIn()
    serve({ sweepers: cards })

    renderApp(listUrl)

    const link = await screen.findByRole('link', { name: 'Edit sweeper Fri 10/23/2026 7:00 PM' })
    expect(link).toHaveAttribute('href', `${listUrl}/${sweeper.id}/edit`)
  })

  it('shows no link for a complete sweeper (D-181)', async () => {
    signIn()
    serve({ sweepers: cards })

    renderApp(listUrl)

    await screen.findByRole('link', { name: 'Edit sweeper Fri 10/23/2026 7:00 PM' })
    expect(screen.queryByRole('link', { name: /Edit sweeper Sat 10\/24\/2026 6:00 PM/ })).toBeNull()
  })

  it('shows no link to a score keeper (D-96)', async () => {
    signIn('scoreKeeper')
    serve({ sweepers: cards })

    renderApp(listUrl)

    await screen.findByRole('link', { name: 'Fri 10/23/2026 7:00 PM' })
    expect(screen.queryByRole('link', { name: /^Edit sweeper/ })).toBeNull()
  })

  it('shows no link on a complete tournament (D-181)', async () => {
    signIn()
    serve({ sweepers: cards, completed: true })

    renderApp(listUrl)

    await screen.findByRole('link', { name: 'Fri 10/23/2026 7:00 PM' })
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /^Edit sweeper/ })).toBeNull()
    })
  })
})
