import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import {
  createEditInfo,
  createLaneBowler,
  createLanePage,
  createSignedInUser,
  createSquad,
  createSweeper,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { SessionKind } from '../../shared/session'
import type { EditInfo, EditRegistrationRequest } from './types'

const tournament = createTournament({ name: 'Spring Open' })
const maria = createLaneBowler({ name: 'Maria Gonzalez' })
const source = createSquad({ date: '2026-10-24T09:00:00', entryFee: 75 })
const later = createSquad({ date: '2026-10-24T13:00:00', entryFee: 80 })
const cheaper = createSquad({ date: '2026-10-25T09:00:00', entryFee: 70 })
const held = createSquad({ date: '2026-10-25T13:00:00', entryFee: 75 })
const finished = createSquad({ date: '2026-10-23T18:00:00', complete: true })
const sweeperSource = createSweeper({ date: '2026-10-24T12:00:00', entryFee: 20 })
const sweeperLater = createSweeper({ date: '2026-10-25T08:00:00', entryFee: 25 })

interface Options {
  kind?: SessionKind
  complete?: boolean
  info?: EditInfo
  infoStatus?: number
  /** Answers each PATCH in turn; the last one repeats. */
  patches?: (() => Response)[]
  squads?: ReturnType<typeof createSquad>[]
}

function serve(options: Options = {}) {
  const kind = options.kind ?? 'squad'
  const sessionId = kind === 'squad' ? source.id : sweeperSource.id
  const page = createLanePage({
    session: {
      ...createLanePage().session,
      id: sessionId,
      kind,
      complete: options.complete === true,
    },
    unassigned: [maria],
    divisions: [{ id: 'd1', number: 1, name: 'Open', entries: 1 }],
  })
  const info =
    options.info ??
    createEditInfo({
      registration: {
        id: maria.registrationId,
        squadIds: [source.id, held.id],
        sweeperIds: [sweeperSource.id],
      },
    })
  const patched: EditRegistrationRequest[] = []
  const answers = options.patches ?? [
    () => HttpResponse.json({ registrationId: maria.registrationId, added: 0, removed: 1 }),
  ]
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/settings', () => HttpResponse.json({ settings: {} })),
    http.get('/v1/tournaments/:id/squads', () =>
      HttpResponse.json({
        squads: options.squads ?? [source, later, cheaper, held, finished],
      }),
    ),
    http.get('/v1/tournaments/:id/sweepers', () =>
      HttpResponse.json({ sweepers: [sweeperSource, sweeperLater] }),
    ),
    http.get('/v1/tournaments/:id/squads/:sessionId/lanes', () => HttpResponse.json(page)),
    http.get('/v1/tournaments/:id/sweepers/:sessionId/lanes', () => HttpResponse.json(page)),
    http.get('/v1/tournaments/:id/registrations/:registrationId/edit-info', () =>
      options.infoStatus
        ? new HttpResponse(null, { status: options.infoStatus })
        : HttpResponse.json(info),
    ),
    http.patch('/v1/tournaments/:id/registrations/:registrationId', async ({ request }) => {
      patched.push((await request.json()) as EditRegistrationRequest)
      const answer = answers[Math.min(patched.length, answers.length) - 1]
      return answer ? answer() : new HttpResponse(null, { status: 500 })
    }),
  )
  return { patched, kind, sessionId }
}

const open = async (kind: SessionKind = 'squad') => {
  const sessionId = kind === 'squad' ? source.id : sweeperSource.id
  renderApp(`/tournaments/${tournament.id}/${kind}s/${sessionId}/lanes`)
  await screen.findByRole('button', { name: 'Registration actions: Maria Gonzalez' })
}

async function openActions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Registration actions: Maria Gonzalez' }))
  return screen.findByRole('dialog', { name: 'Registration actions for Maria Gonzalez' })
}

beforeEach(() => {
  setMockUser(createSignedInUser({ roles: ['director'] }))
})

describe('the Registration button on the lane page (REG-20, D-197, D-198)', () => {
  it('opens a dialog with Edit, Move, and Remove', async () => {
    serve()
    const user = userEvent.setup()
    await open()

    const dialog = await openActions(user)

    expect(await within(dialog).findByRole('link', { name: 'Edit registration' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/registrations/${maria.registrationId}/edit`,
    )
    expect(within(dialog).getByRole('button', { name: 'Move to another squad…' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'Remove from this squad…' })).toBeEnabled()
  })

  it('is not there for a score keeper, who has no registrations.write (D-198)', async () => {
    setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
    serve()

    renderApp(`/tournaments/${tournament.id}/squads/${source.id}/lanes`)

    expect(await screen.findByText('Maria Gonzalez')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Registration actions/ })).not.toBeInTheDocument()
  })

  it('is not there once the squad is complete (D-10)', async () => {
    serve({ complete: true })

    renderApp(`/tournaments/${tournament.id}/squads/${source.id}/lanes`)

    expect(await screen.findByText('Maria Gonzalez')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Registration actions/ })).not.toBeInTheDocument()
  })

  it('says why Move and Remove are off when the bowler has scores here (REG-34)', async () => {
    serve({
      info: createEditInfo({
        registration: { id: maria.registrationId, squadIds: [source.id], sweeperIds: [] },
        locks: { scoredSessionIds: [source.id], hasScores: true },
      }),
    })
    const user = userEvent.setup()
    await open()

    const dialog = await openActions(user)

    const move = await within(dialog).findByRole('button', { name: 'Move to another squad…' })
    expect(move).toBeDisabled()
    expect(move).toHaveAccessibleDescription(
      'Cannot move or remove: Maria Gonzalez has scores in this squad.',
    )
    expect(within(dialog).getByRole('button', { name: 'Remove from this squad…' })).toBeDisabled()
    expect(within(dialog).getByRole('link', { name: 'Edit registration' })).toBeVisible()
  })

  it('shows the error when the registration cannot be read, and closes', async () => {
    serve({ infoStatus: 403 })
    const user = userEvent.setup()
    await open()

    const dialog = await openActions(user)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'You do not have permission to edit a registration.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

describe('removing from this squad (REG-20, D-203, D-207)', () => {
  it('shows the refund, sends one removal, and says it is done', async () => {
    const { patched } = serve()
    const user = userEvent.setup()
    await open()
    const dialog = await openActions(user)

    await user.click(await within(dialog).findByRole('button', { name: 'Remove from this squad…' }))
    expect(within(dialog).getByText('Refund may be due: $75.00', { exact: false })).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Remove from squad' }))

    expect(await screen.findByText('Maria Gonzalez removed from this squad.')).toBeVisible()
    expect(patched).toEqual([{ removeSquadIds: [source.id] }])
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('removes a sweeper with the sweeper list', async () => {
    const { patched } = serve({ kind: 'sweeper' })
    const user = userEvent.setup()
    await open('sweeper')
    const dialog = await openActions(user)

    await user.click(
      await within(dialog).findByRole('button', { name: 'Remove from this sweeper…' }),
    )
    expect(within(dialog).getByText('Refund may be due: $20.00', { exact: false })).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Remove from sweeper' }))

    expect(await screen.findByText('Maria Gonzalez removed from this sweeper.')).toBeVisible()
    expect(patched).toEqual([{ removeSweeperIds: [sweeperSource.id] }])
  })

  it('keeps the dialog open and shows the refusal in it (REG-03, D-04)', async () => {
    serve({
      patches: [
        () =>
          HttpResponse.json(
            {
              message: 'Bowler must enter at least one squad',
              errors: { squadIds: 'Bowler must enter at least one squad' },
            },
            { status: 400 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    const dialog = await openActions(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Remove from this squad…' }))

    await user.click(within(dialog).getByRole('button', { name: 'Remove from squad' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Bowler must enter at least one squad',
    )
    expect(screen.queryByText(/removed from this squad/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(dialog).getByRole('link', { name: 'Edit registration' })).toBeVisible()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('asks to try again when the registration changed meanwhile (D-199)', async () => {
    serve({
      patches: [
        () =>
          HttpResponse.json(
            { message: 'This registration changed. Review and save again.', conflict: 'changed' },
            { status: 409 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    const dialog = await openActions(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Remove from this squad…' }))

    await user.click(within(dialog).getByRole('button', { name: 'Remove from squad' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This registration changed. Close this and try again.',
    )
  })

  it('shows a plain failure, such as a server error', async () => {
    serve({ patches: [() => new HttpResponse(null, { status: 500 })] })
    const user = userEvent.setup()
    await open()
    const dialog = await openActions(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Remove from this squad…' }))

    await user.click(within(dialog).getByRole('button', { name: 'Remove from squad' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Failed to save the registration (500)',
    )
  })
})

describe('moving to another squad (D-202)', () => {
  async function openMove(user: ReturnType<typeof userEvent.setup>) {
    const dialog = await openActions(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Move to another squad…' }))
    return dialog
  }

  it('lists only open squads the bowler is not in, and nothing is chosen at first', async () => {
    serve()
    const user = userEvent.setup()
    await open()

    const dialog = await openMove(user)

    const radios = within(dialog).getAllByRole('radio')
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual([
      later.id,
      cheaper.id,
      finished.id,
    ])
    expect(within(dialog).getByRole('radio', { name: /6:00 PM/ })).toBeDisabled()
    expect(within(dialog).getByText('Complete')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled()
  })

  it('shows both fees and the net for a dearer squad, then sends one remove and one add', async () => {
    const { patched } = serve({
      patches: [
        () => HttpResponse.json({ registrationId: maria.registrationId, added: 1, removed: 1 }),
      ],
    })
    const user = userEvent.setup()
    await open()
    const dialog = await openMove(user)

    await user.click(within(dialog).getByRole('radio', { name: /1:00 PM/ }))
    expect(within(dialog).getByText('Net: collect $5.00.')).toBeVisible()
    expect(within(dialog).getByText(/lands in the unassigned list/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Move' }))

    expect(await screen.findByText('Maria Gonzalez moved to another squad.')).toBeVisible()
    expect(patched).toEqual([{ removeSquadIds: [source.id], addSquadIds: [later.id] }])
  })

  it('shows a refund when the new squad costs less', async () => {
    serve()
    const user = userEvent.setup()
    await open()
    const dialog = await openMove(user)

    await user.click(within(dialog).getByRole('radio', { name: /\$70\.00/ }))

    expect(within(dialog).getByText('Net: refund $5.00.')).toBeVisible()
  })

  it('moves a sweeper with the sweeper lists', async () => {
    const { patched } = serve({
      kind: 'sweeper',
      patches: [
        () => HttpResponse.json({ registrationId: maria.registrationId, added: 1, removed: 1 }),
      ],
    })
    const user = userEvent.setup()
    await open('sweeper')
    const dialog = await openActions(user)
    await user.click(
      await within(dialog).findByRole('button', { name: 'Move to another sweeper…' }),
    )

    await user.click(within(dialog).getByRole('radio', { name: /8:00 AM/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Move' }))

    expect(await screen.findByText('Maria Gonzalez moved to another sweeper.')).toBeVisible()
    expect(patched).toEqual([
      { removeSweeperIds: [sweeperSource.id], addSweeperIds: [sweeperLater.id] },
    ])
  })

  it('says when there is nowhere to move', async () => {
    serve({ squads: [source, held] })
    const user = userEvent.setup()
    await open()

    const dialog = await openMove(user)

    expect(within(dialog).getByText('No other squad to move to.')).toBeVisible()
    expect(within(dialog).queryByRole('radio')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled()
  })

  it('keeps the dialog open and shows a refusal (REG-33)', async () => {
    serve({
      patches: [
        () =>
          HttpResponse.json(
            {
              message: 'Cannot add squad(s) that are already complete.',
              errors: { squadIds: 'Cannot add squad(s) that are already complete.' },
            },
            { status: 400 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    const dialog = await openMove(user)
    await user.click(within(dialog).getByRole('radio', { name: /1:00 PM/ }))

    await user.click(within(dialog).getByRole('button', { name: 'Move' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Cannot add squad(s) that are already complete.',
    )
    expect(screen.queryByText(/moved to another squad/)).not.toBeInTheDocument()
  })
})
