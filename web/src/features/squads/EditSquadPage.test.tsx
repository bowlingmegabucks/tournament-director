import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSettings, createSignedInUser, createSquad, createTournament } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import type { SessionEditInfo } from '../../shared/sessionEdit'
import { renderApp } from '../../test/renderApp'
import type { Squad, SquadChanges } from './types'

const tournament = createTournament({
  name: 'Spring Open',
  startDate: '2026-10-23',
  endDate: '2026-10-25',
  entryFee: 50,
})
const squad = createSquad({
  date: '2026-10-24T09:00:00',
  startingLane: 1,
  numberOfLanes: 20,
  maxPerPair: 4,
  entryFee: 60,
  entryFeeOverridden: true,
})
const url = `/tournaments/${tournament.id}/squads/${squad.id}/edit`
const listUrl = `/tournaments/${tournament.id}/squads`

const noFacts: SessionEditInfo = {
  entryCount: 0,
  assignmentCount: 0,
  hasScores: false,
  lowestAssignedLane: null,
  highestAssignedLane: null,
  fullestPair: null,
}

type Sent = SquadChanges & { confirmWarnings?: boolean }

/** The reads the page needs, and a PATCH that records what it is given. */
function serve(
  options: {
    squads?: Squad[]
    completed?: boolean
    info?: Partial<SessionEditInfo>
    patch?: (sent: Sent) => Response | Promise<Response>
  } = {},
) {
  const sent: Sent[] = []
  const squads = options.squads ?? [squad]
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/settings', () =>
      HttpResponse.json({
        settings: createSettings({
          finalsRatio: 6,
          cashRatio: 4,
          completed: options.completed === true,
        }),
      }),
    ),
    http.get('/v1/tournaments/:id/squads', () => HttpResponse.json({ squads })),
    http.get('/v1/tournaments/:id/squads/:sessionId/edit-info', () =>
      HttpResponse.json({ editInfo: { ...noFacts, ...options.info } }),
    ),
    http.patch('/v1/tournaments/:id/squads/:sessionId', async ({ request }) => {
      const body = (await request.json()) as Sent
      sent.push(body)
      if (options.patch) return options.patch(body)
      const { date, ...rest } = body
      return HttpResponse.json({
        squad: { ...squad, ...rest, ...(date !== undefined && { date: `${date}:00` }) },
      })
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
  await screen.findByRole('heading', { name: 'Edit squad', level: 1 })
  await screen.findByLabelText('Date and time (required)', {}, { timeout: 3000 })
}
const pickDate = (value: string) => {
  fireEvent.change(box('Date and time (required)'), { target: { value } })
}
const retype = async (user: ReturnType<typeof userEvent.setup>, label: string, text: string) => {
  await user.clear(box(label))
  if (text !== '') await user.type(box(label), text)
}

describe('EditSquadPage (SQD-27)', () => {
  it('shows the form filled with the stored values; a squad that uses the tournament value shows it blank with the value as a hint (SQD-27, D-183)', async () => {
    signIn()
    serve()

    await openForm()

    expect(box('Date and time (required)')).toHaveValue('2026-10-24T09:00')
    expect(box('Starting lane (required)')).toHaveValue('1')
    expect(box('Number of lanes (required)')).toHaveValue('20')
    expect(box('Bowlers per pair (required)')).toHaveValue('4')
    expect(box('Entry fee')).toHaveValue('60')
    expect(box('Finals ratio')).toHaveValue('')
    expect(box('Finals ratio')).toHaveAccessibleDescription(
      expect.stringContaining('Tournament: 1 in 6'),
    )
    expect(box('Cash ratio')).toHaveValue('')
    expect(document.title).toBe('Edit squad · Spring Open · Tournament Director')
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', listUrl)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeVisible()
  })

  describe('the notes before the director types (SQD-27, D-180, D-182, D-185)', () => {
    it('shows none when nothing depends on the squad', async () => {
      signIn()
      serve()

      await openForm()

      expect(screen.queryByText(/Asks you to confirm/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Limit:/)).not.toBeInTheDocument()
    })

    it('says entries make the date and the fee ask to confirm', async () => {
      signIn()
      serve({ info: { entryCount: 12 } })

      await openForm()

      expect(box('Date and time (required)')).toHaveAccessibleDescription(
        expect.stringContaining(
          '12 bowlers are entered. They planned around this time. Tell them.',
        ),
      )
      expect(box('Entry fee')).toHaveAccessibleDescription(
        expect.stringContaining(
          '12 bowlers are entered. They keep what they paid. New entries pay the new fee.',
        ),
      )
      expect(box('Finals ratio')).not.toHaveAccessibleDescription(
        expect.stringContaining('Asks you to confirm'),
      )
    })

    it('says assignments limit the lanes and make a lane change ask to confirm', async () => {
      signIn()
      serve({
        info: {
          assignmentCount: 12,
          lowestAssignedLane: 1,
          highestAssignedLane: 18,
          fullestPair: 4,
        },
      })

      await openForm()

      for (const label of ['Starting lane (required)', 'Number of lanes (required)']) {
        expect(box(label)).toHaveAccessibleDescription(
          expect.stringContaining(
            'Lanes 1 to 18 have bowlers assigned, so the range must keep them.',
          ),
        )
        expect(box(label)).toHaveAccessibleDescription(
          expect.stringContaining('12 bowlers have lane assignments.'),
        )
      }
      expect(box('Bowlers per pair (required)')).toHaveAccessibleDescription(
        expect.stringContaining('The fullest pair holds 4 bowlers, so this cannot go below 4.'),
      )
    })

    it('says a score in this squad makes the ratios ask to confirm, and the fee does not', async () => {
      signIn()
      serve({ info: { hasScores: true } })

      await openForm()

      for (const label of ['Finals ratio', 'Cash ratio']) {
        expect(box(label)).toHaveAccessibleDescription(
          expect.stringContaining('Scores are saved. Posted results change at once.'),
        )
      }
      expect(box('Entry fee')).not.toHaveAccessibleDescription(
        expect.stringContaining('Asks you to confirm'),
      )
    })
  })

  describe('saving (SQD-23, SQD-27, D-184)', () => {
    it('sends only the fields that changed and returns to the list with a toast (SQD-27)', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Bowlers per pair (required)', '3')
      pickDate('2026-10-24T13:00')
      await user.click(save())

      expect(await screen.findByText('Squad saved')).toBeVisible()
      expect(sent).toEqual([{ date: '2026-10-24T13:00', maxPerPair: 3 }])
      expect(screen.getByRole('heading', { name: 'Squads', level: 1 })).toBeVisible()
    })

    it('sends null when a fee is cleared so the tournament value applies (D-183)', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Entry fee', '')
      await user.click(save())

      await waitFor(() => {
        expect(sent).toEqual([{ entryFee: null }])
      })
    })

    it('sets a ratio on a squad that used the tournament value (SQD-02)', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Finals ratio', '5.5')
      await user.click(save())

      await waitFor(() => {
        expect(sent).toEqual([{ finalsRatio: 5.5 }])
      })
    })

    it('sends an empty change when nothing changed, and the API answers 200 (SQD-23)', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await user.click(save())

      expect(await screen.findByText('Squad saved')).toBeVisible()
      expect(sent).toEqual([{}])
    })

    it('says Saving and turns Save off while it runs (SQD-27)', async () => {
      signIn()
      serve({
        patch: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return HttpResponse.json({ squad })
        },
      })
      const user = userEvent.setup()
      await openForm()
      await retype(user, 'Entry fee', '70')

      await user.click(save())

      expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    })
  })

  describe('checks (SQD-02, SQD-04 to SQD-06, SQD-08, SQD-27)', () => {
    it('checks only what the director changed: a stored odd lane count never blocks a fee change (D-17)', async () => {
      signIn()
      const odd = createSquad({ ...squad, numberOfLanes: 7, entryFee: 60 })
      const sent = serve({ squads: [odd] })
      const user = userEvent.setup()
      await openForm(`/tournaments/${tournament.id}/squads/${odd.id}/edit`)

      await retype(user, 'Entry fee', '65')
      await user.click(save())

      await waitFor(() => {
        expect(sent).toEqual([{ entryFee: 65 }])
      })
    })

    it('shows a summary, moves focus to the first problem, and sends nothing (SQD-27)', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Starting lane (required)', '2')
      await retype(user, 'Entry fee', '1000')
      await user.click(save())

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Fix 2 fields to save.')
      expect(within(alert).getByText('Starting lane must be odd')).toBeVisible()
      expect(within(alert).getByText('Entry fee must be between $0 and $999.99')).toBeVisible()
      expect(box('Starting lane (required)')).toHaveFocus()
      expect(sent).toEqual([])
    })

    it('checks the lane block when the starting lane changes (D-179)', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Starting lane (required)', '199')
      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Lanes must end at lane 200 or lower',
      )
      expect(box('Number of lanes (required)')).toHaveAccessibleDescription(
        expect.stringContaining('Lanes must end at lane 200 or lower'),
      )
      expect(sent).toEqual([])
    })

    it('refuses a date outside the tournament dates (SQD-03)', async () => {
      signIn()
      const sent = serve()
      await openForm()

      pickDate('2026-10-26T09:00')
      await userEvent.setup().click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Squad date must be before tournament end',
      )
      expect(sent).toEqual([])
    })
  })

  describe("the API's refusals (SQD-24)", () => {
    it('shows a stranded lane under the field and keeps the typing (D-182)', async () => {
      signIn()
      const message = 'Lane 19 has a bowler assigned. Move them first.'
      serve({
        patch: () =>
          HttpResponse.json({ message, errors: { numberOfLanes: message } }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Number of lanes (required)', '10')
      await user.click(save())

      expect(await screen.findByText(message, { selector: 'p' })).toBeVisible()
      expect(box('Number of lanes (required)')).toHaveAccessibleDescription(
        expect.stringContaining(message),
      )
      expect(box('Number of lanes (required)')).toHaveValue('10')
    })

    it('shows a complete squad that turned complete since the form opened as a toast (SQD-24, D-181)', async () => {
      signIn()
      const message = 'This squad is complete and cannot be changed'
      serve({
        patch: () => HttpResponse.json({ message, errors: { session: message } }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Entry fee', '70')
      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
    })

    it('shows a complete tournament that turned complete since the form opened as a toast (D-181)', async () => {
      signIn()
      const message = 'This tournament is complete and cannot be changed'
      serve({
        patch: () =>
          HttpResponse.json({ message, errors: { tournament: message } }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Entry fee', '70')
      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
    })

    it('shows an outage as an error toast that stays (SQD-27)', async () => {
      signIn()
      serve({ patch: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()

      await retype(user, 'Entry fee', '70')
      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save the squad (503)')
      expect(box('Entry fee')).toHaveValue('70')
    })
  })

  describe('the confirm dialog (SQD-25, SQD-28, D-129)', () => {
    const warnings = [
      {
        field: 'date',
        message: '12 bowlers are entered. They planned around this time. Tell them.',
      },
      {
        field: 'entryFee',
        message: '12 bowlers are entered. They keep what they paid. New entries pay the new fee.',
      },
    ]
    const warn = (sent: Sent) =>
      sent.confirmWarnings === true
        ? HttpResponse.json({ squad })
        : HttpResponse.json(
            { message: 'Confirm these changes to save them.', warnings },
            { status: 409 },
          )

    async function openDialog() {
      signIn()
      const sent = serve({ info: { entryCount: 12 }, patch: warn })
      const user = userEvent.setup()
      await openForm()
      pickDate('2026-10-24T13:00')
      await retype(user, 'Entry fee', '75')
      await user.click(save())
      return { sent, user }
    }

    it('lists each warning with the change behind it (SQD-28)', async () => {
      await openDialog()

      const dialog = await screen.findByRole('dialog', { name: 'Save these changes?' })
      for (const item of warnings) expect(within(dialog).getByText(item.message)).toBeVisible()
      expect(
        within(dialog).getByText('Date: Sat 10/24/2026 9:00 AM → Sat 10/24/2026 1:00 PM'),
      ).toBeVisible()
      expect(within(dialog).getByText('Entry fee: $60.00 → $75.00')).toBeVisible()
    })

    it('Go back closes it, keeps the typing, and sends nothing more', async () => {
      const { sent, user } = await openDialog()
      await screen.findByRole('dialog')

      await user.click(screen.getByRole('button', { name: 'Go back' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(box('Entry fee')).toHaveValue('75')
      expect(sent).toHaveLength(1)
    })

    it('Save anyway sends the same changes with confirmWarnings and returns to the list (D-129)', async () => {
      const { sent, user } = await openDialog()
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))

      expect(await screen.findByText('Squad saved')).toBeVisible()
      expect(sent).toEqual([
        { date: '2026-10-24T13:00', entryFee: 75 },
        { date: '2026-10-24T13:00', entryFee: 75, confirmWarnings: true },
      ])
    })

    it('closes and shows the refusal when the confirmed save is refused (SQD-24)', async () => {
      signIn()
      const message = 'Lane 19 has a bowler assigned. Move them first.'
      const sent = serve({
        info: { entryCount: 12 },
        patch: (body) =>
          body.confirmWarnings === true
            ? HttpResponse.json({ message, errors: { numberOfLanes: message } }, { status: 409 })
            : HttpResponse.json(
                { message: 'Confirm these changes to save them.', warnings: [warnings[1]] },
                { status: 409 },
              ),
      })
      const user = userEvent.setup()
      await openForm()
      await retype(user, 'Entry fee', '75')
      await user.click(save())
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      expect(await screen.findByText(message, { selector: 'p' })).toBeVisible()
      expect(sent).toHaveLength(2)
    })

    it('says why inside the dialog when the confirmed save fails another way', async () => {
      signIn()
      serve({
        info: { entryCount: 12 },
        patch: (body) =>
          body.confirmWarnings === true
            ? new HttpResponse(null, { status: 503 })
            : HttpResponse.json(
                { message: 'Confirm these changes to save them.', warnings: [warnings[1]] },
                { status: 409 },
              ),
      })
      const user = userEvent.setup()
      await openForm()
      await retype(user, 'Entry fee', '75')
      await user.click(save())
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Failed to save the squad (503)',
      )
    })
  })

  describe('states (SQD-27)', () => {
    it('shows a notice in place of the form for a complete tournament (D-181)', async () => {
      signIn()
      serve({ completed: true })

      renderApp(url)

      expect(await screen.findByText('This tournament is complete')).toBeVisible()
      expect(screen.queryByLabelText('Entry fee')).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to squads' })).toHaveAttribute('href', listUrl)
    })

    it('shows a notice in place of the form for a complete squad (D-181)', async () => {
      signIn()
      serve({ squads: [{ ...squad, complete: true }] })

      renderApp(url)

      expect(await screen.findByText('This squad is complete')).toBeVisible()
      expect(screen.queryByLabelText('Entry fee')).not.toBeInTheDocument()
    })

    it('says so when the squad is not in the list', async () => {
      signIn()
      serve({ squads: [] })

      renderApp(url)

      expect(await screen.findByText('Squad not found')).toBeVisible()
      expect(screen.getByRole('link', { name: 'Back to squads' })).toHaveAttribute('href', listUrl)
    })

    it('shows the loading state first', async () => {
      signIn()
      serve()

      renderApp(url)

      expect(await screen.findByText('Loading the form…')).toBeVisible()
      await screen.findByLabelText('Entry fee')
    })

    it(
      'shows an error with Try again when the edit-info read fails, and recovers',
      { timeout: 20000 },
      async () => {
        signIn()
        let fail = true
        serve()
        server.use(
          http.get('/v1/tournaments/:id/squads/:sessionId/edit-info', () =>
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

        expect(await screen.findByLabelText('Entry fee')).toBeVisible()
      },
    )

    it('shows an error with Try again when the settings read fails', async () => {
      signIn()
      serve()
      server.use(
        http.get('/v1/tournaments/:id/settings', () => new HttpResponse(null, { status: 500 })),
      )

      renderApp(url)

      expect(
        await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 }),
      ).toBeVisible()
    })
  })

  describe('who may open it (SQD-27, D-102)', () => {
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

describe('the Edit link on the Squads page (SQD-30, D-181, D-185)', () => {
  const second = createSquad({ date: '2026-10-24T13:00:00', complete: true })
  const cards = [squad, second]

  it('shows a link for each open squad to a director, named with the date', async () => {
    signIn()
    serve({ squads: cards })

    renderApp(listUrl)

    const link = await screen.findByRole('link', { name: 'Edit squad Sat 10/24/2026 9:00 AM' })
    expect(link).toHaveAttribute('href', `${listUrl}/${squad.id}/edit`)
  })

  it('shows no link for a complete squad (D-181)', async () => {
    signIn()
    serve({ squads: cards })

    renderApp(listUrl)

    await screen.findByRole('link', { name: 'Edit squad Sat 10/24/2026 9:00 AM' })
    expect(screen.queryByRole('link', { name: /Edit squad Sat 10\/24\/2026 1:00 PM/ })).toBeNull()
  })

  it('shows no link to a visitor or a score keeper (D-96)', async () => {
    signIn('scoreKeeper')
    serve({ squads: cards })

    renderApp(listUrl)

    await screen.findByRole('link', { name: 'Sat 10/24/2026 9:00 AM' })
    expect(screen.queryByRole('link', { name: /^Edit squad/ })).toBeNull()
  })

  it('shows no link on a complete tournament (D-181)', async () => {
    signIn()
    serve({ squads: cards, completed: true })

    renderApp(listUrl)

    await screen.findByRole('link', { name: 'Sat 10/24/2026 9:00 AM' })
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /^Edit squad/ })).toBeNull()
    })
  })
})
