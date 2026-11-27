import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import {
  createDivisionResult,
  createRegistration,
  createSettings,
  createSignedInUser,
  createSquad,
  createSquadResults,
  createSquadRow,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { Choice, Preview } from './types'

const tournament = createTournament({ name: 'Fall Open' })
const source = createSquad({ date: '2026-11-26T08:00:00', complete: true })
const next = createSquad({ date: '2026-11-27T08:00:00', complete: false })
const done = createSquad({ date: '2026-11-26T13:00:00', complete: true })
const noShowId = '11111111-1111-4111-8111-111111111111'
const cal = { squadId: source.id, registrationId: '22222222-2222-4222-8222-222222222222' }

function previewOf(choice: Choice, over: Partial<Preview> = {}): Preview {
  return {
    action: choice.action,
    bowlerName: 'Nora Noshow',
    source: { id: source.id, date: source.date },
    target: choice.action === 'move' ? { id: next.id, date: next.date } : null,
    deletesRegistration: false,
    warnings: [],
    changes: [],
    keepAdvancing: [],
    atLarge: [],
    payouts: [],
    version: JSON.stringify(choice),
    ...over,
  }
}

/** A preview with a bowler who would stop advancing, and who is kept when ticked. */
function withAdvancer(choice: Choice): Preview {
  const kept = choice.keepAdvancing.length > 0
  return previewOf(choice, {
    keepAdvancing: [
      {
        ...cal,
        squadDate: source.date,
        divisionName: 'Open',
        name: 'Cal Lane',
        kept,
      },
    ],
    changes: kept
      ? []
      : [
          {
            ...cal,
            squadDate: source.date,
            divisionName: 'Open',
            name: 'Cal Lane',
            change: 'losesAdvance',
          },
        ],
  })
}

interface Options {
  role?: 'admin' | 'director'
  squadComplete?: boolean
  tournamentComplete?: boolean
  preview?: (choice: Choice) => Preview | Response
  apply?: (body: unknown) => Response
}

function serve(options: Options = {}) {
  const sent: { previews: Choice[]; saves: unknown[] } = { previews: [], saves: [] }
  setMockUser(createSignedInUser({ roles: [options.role ?? 'admin'] }))
  const results = createSquadResults({
    session: {
      id: source.id,
      kind: 'squad',
      date: source.date,
      complete: options.squadComplete ?? true,
      games: 3,
    },
    divisions: [
      createDivisionResult({
        name: 'Open',
        entries: 2,
        rows: [createSquadRow({ name: 'Amy Lane', group: 'advancer', byRuling: true })],
        noShows: [{ registrationId: noShowId, name: 'Nora Noshow' }],
      }),
    ],
  })
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/settings', () =>
      HttpResponse.json({
        settings: createSettings({ completed: options.tournamentComplete ?? false }),
      }),
    ),
    http.get('/v1/tournaments/:id/squads', () =>
      HttpResponse.json({ squads: [source, done, next] }),
    ),
    http.get('/v1/tournaments/:id/squads/:sessionId/results', () => HttpResponse.json(results)),
    http.get('/v1/tournaments/:id/registrations', () =>
      HttpResponse.json({
        registrations: [],
        summary: { registrations: 0, superSweepers: 0, divisions: [], squads: [], sweepers: [] },
      }),
    ),
    http.post(
      '/v1/tournaments/:id/squads/:sessionId/no-shows/:registrationId/preview',
      async ({ request }) => {
        const choice = (await request.json()) as Choice
        sent.previews.push(choice)
        const answer = (options.preview ?? previewOf)(choice)
        return answer instanceof Response ? answer : HttpResponse.json({ preview: answer })
      },
    ),
    http.post(
      '/v1/tournaments/:id/squads/:sessionId/no-shows/:registrationId',
      async ({ request }) => {
        const body: unknown = await request.json()
        sent.saves.push(body)
        return options.apply?.(body) ?? HttpResponse.json({ deletedRegistration: false })
      },
    ),
  )
  renderApp(`/tournaments/${tournament.id}/squads/${source.id}/results`)
  return sent
}

const button = () => screen.findByRole('button', { name: 'Move or refund Nora Noshow' })

async function openDialog() {
  const user = userEvent.setup()
  await user.click(await button())
  const dialog = await screen.findByRole('dialog', { name: 'Move or refund Nora Noshow' })
  return { user, dialog: within(dialog) }
}

async function chooseMove() {
  const opened = await openDialog()
  await opened.user.click(
    await opened.dialog.findByRole('radio', { name: 'Move to another squad' }),
  )
  await opened.user.selectOptions(opened.dialog.getByLabelText('New squad'), next.id)
  return opened
}

/** The results as they read once the no-show is gone, after a save. */
function dropNoShowOnSave() {
  let saved = false
  server.use(
    http.post('/v1/tournaments/:id/squads/:sessionId/no-shows/:registrationId', () => {
      saved = true
      return HttpResponse.json({ deletedRegistration: false })
    }),
    http.get('/v1/tournaments/:id/squads/:sessionId/results', () =>
      HttpResponse.json(
        createSquadResults({
          session: {
            id: source.id,
            kind: 'squad',
            date: source.date,
            complete: true,
            games: 3,
          },
          divisions: [
            createDivisionResult({
              name: 'Open',
              entries: 2,
              rows: [createSquadRow({ name: 'Amy Lane' })],
              noShows: saved ? [] : [{ registrationId: noShowId, name: 'Nora Noshow' }],
            }),
          ],
        }),
      ),
    ),
  )
}

describe('who sees the no-show button (NSH-01, NSH-02)', () => {
  it('shows an admin the button on a completed squad', async () => {
    serve()

    expect(await button()).toBeVisible()
  })

  it.each<[string, Options]>([
    ['a director', { role: 'director' }],
    ['an open squad', { squadComplete: false }],
    ['a complete tournament', { tournamentComplete: true }],
  ])('shows no button to %s', async (_name, options) => {
    serve(options)

    expect(await screen.findByText('Nora Noshow')).toBeVisible()
    // The permission and the settings arrive after the results: wait for the page to settle.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('button', { name: /Move or refund/ })).not.toBeInTheDocument()
  })

  it('marks a forced advancer "Advanced by ruling" (NSH-24)', async () => {
    serve()

    expect(await screen.findByText('Advanced by ruling')).toBeVisible()
  })
})

describe('the no-show dialog (NSH-04, NSH-09, NSH-20)', () => {
  it('offers only open squads, and saves nothing until confirmed', async () => {
    const sent = serve()
    const { user, dialog } = await openDialog()
    expect(await dialog.findByRole('button', { name: 'Move entry' })).toBeDisabled()

    await user.click(dialog.getByRole('radio', { name: 'Move to another squad' }))

    const options = within(dialog.getByLabelText('New squad')).getAllByRole('option')
    expect(options.map((option) => option.getAttribute('value'))).toEqual(['', next.id])
    expect(sent.previews).toEqual([])
    await user.selectOptions(dialog.getByLabelText('New squad'), next.id)
    expect(await dialog.findByText('No one’s results or payouts change.')).toBeVisible()
    expect(sent.previews).toEqual([{ action: 'move', targetSquadId: next.id, keepAdvancing: [] }])
    expect(sent.saves).toEqual([])
  })

  it('saves the reviewed move with its version, then says so', async () => {
    const sent = serve()
    const { user, dialog } = await chooseMove()
    await dialog.findByText('No one’s results or payouts change.')

    await user.click(dialog.getByRole('button', { name: 'Move entry' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Nora Noshow moved to')
    const choice = { action: 'move', targetSquadId: next.id, keepAdvancing: [] }
    expect(sent.saves).toEqual([{ ...choice, version: JSON.stringify(choice) }])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends a ticked "keep advancing" box, unticked to begin with', async () => {
    const sent = serve({ preview: withAdvancer })
    const { user, dialog } = await chooseMove()
    const box = await dialog.findByRole('checkbox', { name: /Cal Lane/ })
    expect(box).not.toBeChecked()
    expect(dialog.getByText(/Cal Lane no longer advances/)).toBeVisible()

    await user.click(box)

    await waitFor(() => {
      expect(dialog.queryByText(/Cal Lane no longer advances/)).not.toBeInTheDocument()
    })
    expect(await dialog.findByRole('checkbox', { name: /Cal Lane/ })).toBeChecked()
    await user.click(await dialog.findByRole('button', { name: 'Move entry' }))
    expect(sent.previews.at(-1)?.keepAdvancing).toEqual([cal])
    expect(sent.saves.at(-1)).toMatchObject({ keepAdvancing: [cal] })
  })

  it('shows the warnings and payout notes of a refund', async () => {
    serve({
      preview: (choice) =>
        previewOf(choice, {
          deletesRegistration: true,
          warnings: ['This makes them ineligible for sweepers.'],
          payouts: [
            {
              payoutId: 'p1',
              label: 'Squad 11/26 8:00 AM',
              name: 'Dee Lane',
              amount: '100.00',
              note: 'Nora Noshow refunded.',
            },
          ],
        }),
    })
    const { user, dialog } = await openDialog()

    await user.click(await dialog.findByRole('radio', { name: 'Refund' }))

    expect(await dialog.findByText('This makes them ineligible for sweepers.')).toBeVisible()
    expect(dialog.getByText(/Dee Lane, Squad 11\/26 8:00 AM, \$100.00/)).toHaveTextContent(
      'gets the note “Nora Noshow refunded.”',
    )
    await user.click(dialog.getByRole('button', { name: 'Refund entry' }))
    expect(await screen.findByRole('status')).toHaveTextContent('The registration is deleted.')
  })

  it('shows why a change is refused, and keeps the button off', async () => {
    serve({
      preview: () =>
        HttpResponse.json(
          { message: 'This bowler has a payout for this squad. Remove it first.', errors: {} },
          { status: 409 },
        ),
    })
    const { dialog } = await chooseMove()

    expect(await dialog.findByRole('alert')).toHaveTextContent('Remove it first.')
    expect(dialog.getByRole('button', { name: 'Move entry' })).toBeDisabled()
  })

  it('shows the new preview when the facts changed before the save', async () => {
    serve({
      apply: () =>
        HttpResponse.json(
          {
            message: 'Changed',
            preview: previewOf(
              { action: 'move', targetSquadId: next.id, keepAdvancing: [] },
              { warnings: ['A payout was saved since.'], version: 'newer' },
            ),
          },
          { status: 409 },
        ),
    })
    const { user, dialog } = await chooseMove()
    await dialog.findByText('No one’s results or payouts change.')

    await user.click(dialog.getByRole('button', { name: 'Move entry' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent('Check it again')
    expect(dialog.getByText('A payout was saved since.')).toBeVisible()
  })

  it('says when there is no open squad to move to', async () => {
    serve()
    server.use(
      http.get('/v1/tournaments/:id/squads', () => HttpResponse.json({ squads: [source] })),
    )
    const { user, dialog } = await openDialog()

    await user.click(await dialog.findByRole('radio', { name: 'Move to another squad' }))

    expect(dialog.getByText('There is no open squad to move to.')).toBeVisible()
    expect(dialog.getByRole('button', { name: 'Move entry' })).toBeDisabled()
  })

  it('says so when the registrations cannot be read', async () => {
    serve()
    server.use(
      http.get('/v1/tournaments/:id/registrations', () => new HttpResponse(null, { status: 500 })),
    )
    const { dialog } = await openDialog()

    // The query retries once, a second later, before it reports the failure.
    expect(await dialog.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent('500')
  })

  it('does not offer a squad the bowler has already entered (NSH-04)', async () => {
    serve()
    const later = createSquad({ date: '2026-11-28T08:00:00', complete: false })
    server.use(
      http.get('/v1/tournaments/:id/squads', () =>
        HttpResponse.json({ squads: [source, next, later] }),
      ),
      http.get('/v1/tournaments/:id/registrations', () =>
        HttpResponse.json({
          registrations: [createRegistration({ id: noShowId, squadIds: [source.id, next.id] })],
          summary: { registrations: 1, superSweepers: 0, divisions: [], squads: [], sweepers: [] },
        }),
      ),
    )
    const { user, dialog } = await openDialog()

    await user.click(await dialog.findByRole('radio', { name: 'Move to another squad' }))

    const options = within(dialog.getByLabelText('New squad')).getAllByRole('option')
    expect(options.map((option) => option.getAttribute('value'))).toEqual(['', later.id])
  })

  it('reads the results again after a save, and puts focus on the division', async () => {
    serve()
    dropNoShowOnSave()
    const { user, dialog } = await chooseMove()
    await dialog.findByText('No one’s results or payouts change.')

    await user.click(dialog.getByRole('button', { name: 'Move entry' }))

    await waitFor(() => {
      expect(screen.queryByText('Nora Noshow')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Open' })).toHaveFocus()
    })
  })

  it('confirms again with the new version after the facts changed', async () => {
    let saves = 0
    const sent = serve({
      apply: () => {
        saves += 1
        if (saves > 1) return HttpResponse.json({ deletedRegistration: false })
        return HttpResponse.json(
          {
            message: 'Changed',
            preview: previewOf(
              { action: 'move', targetSquadId: next.id, keepAdvancing: [] },
              { warnings: ['A payout was saved since.'], version: 'newer' },
            ),
          },
          { status: 409 },
        )
      },
    })
    const { user, dialog } = await chooseMove()
    await dialog.findByText('No one’s results or payouts change.')
    await user.click(dialog.getByRole('button', { name: 'Move entry' }))
    await dialog.findByText('A payout was saved since.')

    await user.click(dialog.getByRole('button', { name: 'Move entry' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Nora Noshow moved to')
    expect(sent.saves.at(-1)).toMatchObject({ version: 'newer' })
  })

  it('drops the old preview while another action is checked', async () => {
    serve()
    const { user, dialog } = await chooseMove()
    await dialog.findByText(/at-large figures can change again/)
    server.use(
      http.post('/v1/tournaments/:id/squads/:sessionId/no-shows/:registrationId/preview', () =>
        delay('infinite'),
      ),
    )

    await user.click(dialog.getByRole('radio', { name: 'Refund' }))

    expect(dialog.queryByText(/at-large figures can change again/)).not.toBeInTheDocument()
    expect(dialog.queryByText('No one’s results or payouts change.')).not.toBeInTheDocument()
  })

  it('cannot be closed while it saves', async () => {
    serve()
    server.use(
      http.post('/v1/tournaments/:id/squads/:sessionId/no-shows/:registrationId', () =>
        delay('infinite'),
      ),
    )
    const { user, dialog } = await chooseMove()
    await dialog.findByText('No one’s results or payouts change.')

    await user.click(dialog.getByRole('button', { name: 'Move entry' }))

    expect(await dialog.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    const escape = new Event('cancel', { cancelable: true })
    fireEvent(screen.getByRole('dialog'), escape)
    expect(escape.defaultPrevented).toBe(true)
  })

  it('asks before the page is left with a choice made', async () => {
    serve()
    const { user, dialog } = await chooseMove()
    await dialog.findByText('No one’s results or payouts change.')
    const unload = new Event('beforeunload', { cancelable: true })

    window.dispatchEvent(unload)

    expect(unload.defaultPrevented).toBe(true)
    await user.click(dialog.getByRole('button', { name: 'Cancel' }))
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })

  it('closes on Cancel and saves nothing', async () => {
    const sent = serve()
    const { user, dialog } = await openDialog()

    await user.click(dialog.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sent.saves).toEqual([])
  })
})
