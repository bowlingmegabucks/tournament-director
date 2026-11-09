import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import {
  createDeleteInfo,
  createDivision,
  createEditInfo,
  createRegistration,
  createSettings,
  createSignedInUser,
  createSquad,
  createSweeper,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { DeleteInfo, Registration, Summary } from './types'

const tournament = createTournament({ name: 'Spring Open' })
const scratch = createDivision({ number: 1, name: 'Scratch' })
const squad = createSquad({ date: '2026-10-24T09:00:00', entryFee: 60 })
const sweeper = createSweeper({ date: '2026-10-24T18:00:00', entryFee: 25 })

const emptySummary: Summary = {
  registrations: 0,
  superSweepers: 0,
  divisions: [],
  squads: [],
  sweepers: [],
}

function named(firstName: string, lastName: string): Registration {
  return createRegistration({
    bowler: {
      id: crypto.randomUUID(),
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      usbcId: '1234-56789',
    },
  })
}

const maria = named('Maria', 'Chen')
const dana = named('Dana', 'Abbott')

const paidInfo = (total = 85): DeleteInfo =>
  createDeleteInfo({ payments: [{ system: 'BowlingSite', amount: total }], paidTotal: total })

interface Options {
  completed?: boolean
  /** Answers each read of the delete facts in turn; the last one repeats. */
  reads?: DeleteInfo[]
  /** Answers each DELETE in turn; the last one repeats. Default: 204. */
  answers?: (() => Response)[]
}

interface Served {
  deletes: string[]
  reads: number
  rows: Registration[]
}

/** A list the delete can change: a 204 removes the row, so the refetch shows it gone. */
function serve(options: Options = {}): Served {
  const served: Served = { deletes: [], reads: 0, rows: [dana, maria] }
  const reads = options.reads ?? [createDeleteInfo()]
  const answers = options.answers ?? [() => new HttpResponse(null, { status: 204 })]
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/settings', () =>
      HttpResponse.json({ settings: createSettings({ completed: options.completed === true }) }),
    ),
    http.get('/v1/tournaments/:id/registrations', () =>
      HttpResponse.json({
        registrations: served.rows,
        summary: { ...emptySummary, registrations: served.rows.length },
      }),
    ),
    http.get('/v1/tournaments/:id/registrations/:registrationId/delete-info', () => {
      served.reads += 1
      return HttpResponse.json({ deleteInfo: reads[Math.min(served.reads, reads.length) - 1] })
    }),
    http.delete('/v1/tournaments/:id/registrations/:registrationId', ({ params, request }) => {
      served.deletes.push(new URL(request.url).search)
      const answer = answers[Math.min(served.deletes.length, answers.length) - 1]
      const response = answer ? answer() : new HttpResponse(null, { status: 500 })
      if (response.status === 204) {
        served.rows = served.rows.filter((row) => row.id !== params['registrationId'])
      }
      return response
    }),
  )
  return served
}

const signIn = (role: 'director' | 'admin' | 'scoreKeeper' = 'director') => {
  setMockUser(createSignedInUser({ roles: [role] }))
}

const list = `/tournaments/${tournament.id}/registrations`

async function openDialog(user: ReturnType<typeof userEvent.setup>, name = 'Maria Chen') {
  await user.click(await screen.findByRole('button', { name: `Delete ${name}'s registration` }))
  return screen.findByRole('dialog', { name: `Delete ${name}'s registration?` })
}

describe('who sees Delete on the list (REG-25, D-198, D-214, D-215)', () => {
  it.each(['director', 'admin'] as const)(
    'gives a %s a Delete button on each row, named for the bowler',
    async (role) => {
      signIn(role)
      serve()

      renderApp(list)

      expect(
        await screen.findByRole('button', { name: "Delete Maria Chen's registration" }),
      ).toBeVisible()
      expect(screen.getAllByRole('button', { name: /^Delete .*'s registration$/ })).toHaveLength(2)
    },
  )

  it('puts Delete in a cell of its own, apart from the Edit link (D-215)', async () => {
    signIn()
    serve()

    renderApp(list)

    const remove = await screen.findByRole('button', { name: "Delete Maria Chen's registration" })
    const edit = screen.getByRole('link', { name: 'Edit Maria Chen' })
    expect(remove.closest('td')).not.toBe(edit.closest('td'))
    expect(remove.closest('tr')).toBe(edit.closest('tr'))
  })

  it('hides it from a score keeper (D-198)', async () => {
    signIn('scoreKeeper')
    serve()

    renderApp(list)

    expect(await screen.findByRole('rowheader', { name: 'Maria Chen' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
  })

  it('hides it on a complete tournament (D-130)', async () => {
    signIn()
    serve({ completed: true })

    renderApp(list)

    expect(await screen.findByRole('rowheader', { name: 'Maria Chen' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
  })

  it('reads the fees and payments only when the dialog opens (D-212)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()

    renderApp(list)
    await screen.findByRole('rowheader', { name: 'Maria Chen' })
    expect(served.reads).toBe(0)

    await openDialog(user)
    await screen.findByText('Refund may be due, handled outside the app')

    expect(served.reads).toBe(1)
  })
})

describe('deleting with no real payment (REG-19, D-209, D-213)', () => {
  it('deletes, closes, drops the row, and says so in a toast', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete registration' }))

    expect(await screen.findByText('Maria Chen: Registration deleted.')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByRole('rowheader', { name: 'Maria Chen' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('rowheader', { name: 'Dana Abbott' })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(served.deletes).toEqual([''])
  })

  it('sends nothing on Cancel', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)
    await within(dialog).findByText('Refund may be due, handled outside the app')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(served.deletes).toEqual([])
    expect(screen.getByRole('rowheader', { name: 'Maria Chen' })).toBeVisible()
  })

  it('keeps the dialog open with the reason when the request fails, and can try again', async () => {
    signIn()
    const served = serve({
      answers: [
        () => new HttpResponse(null, { status: 503 }),
        () => new HttpResponse(null, { status: 204 }),
      ],
    })
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete registration' }))

    expect(await within(dialog).findByText('Failed to delete the registration (503)')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Delete registration' }))
    expect(await screen.findByText('Maria Chen: Registration deleted.')).toBeVisible()
    expect(served.deletes).toHaveLength(2)
  })

  it('says it is already gone when another desk deleted it first', async () => {
    signIn()
    serve({
      answers: [() => HttpResponse.json({ message: 'Registration not found' }, { status: 404 })],
    })
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete registration' }))

    expect(await screen.findByText('Maria Chen: Registration was already deleted.')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('the dialog and its messages (D-213)', () => {
  const remove = () =>
    http.delete('/v1/tournaments/:id/registrations/:registrationId', async () => {
      calls += 1
      if (calls === 1) return new HttpResponse(null, { status: 503 })
      await delay(300)
      return new HttpResponse(null, { status: 204 })
    })
  let calls = 0

  it('clears an earlier failure as soon as the next try starts', async () => {
    signIn()
    calls = 0
    serve()
    server.use(remove())
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete registration' }))
    expect(await within(dialog).findByText('Failed to delete the registration (503)')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Delete registration' }))

    expect(await within(dialog).findByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(within(dialog).queryByText('Failed to delete the registration (503)')).toBeNull()
    expect(await screen.findByText('Maria Chen: Registration deleted.')).toBeVisible()
  })

  it('shows no old failure when the dialog is opened again', async () => {
    signIn()
    calls = 0
    serve()
    server.use(remove())
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete registration' }))
    expect(await within(dialog).findByText('Failed to delete the registration (503)')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    const again = await openDialog(user)

    expect(
      await within(again).findByText('Refund may be due, handled outside the app'),
    ).toBeVisible()
    expect(within(again).queryByText('Failed to delete the registration (503)')).toBeNull()
  })

  it('ignores a reply that lands after the dialog was closed', async () => {
    signIn()
    serve()
    server.use(
      http.delete('/v1/tournaments/:id/registrations/:registrationId', async () => {
        await delay(300)
        return HttpResponse.json(
          { message: 'Cannot delete registration with scores.', errors: { scores: 'late' } },
          { status: 409 },
        )
      }),
    )
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete registration' }))
    // jsdom does not close a dialog on Escape, so close it as the browser would.
    act(() => {
      ;(dialog as HTMLDialogElement).close()
    })
    await delay(600)

    expect(screen.queryByText('late')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reads the facts again on Try again', async () => {
    signIn()
    let reads = 0
    serve()
    server.use(
      http.get('/v1/tournaments/:id/registrations/:registrationId/delete-info', () => {
        reads += 1
        // The first read and its one retry fail; the read after Try again works.
        return reads <= 2
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ deleteInfo: createDeleteInfo() })
      }),
    )
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)
    await user.click(
      await within(dialog).findByRole('button', { name: 'Try again' }, { timeout: 5000 }),
    )

    expect(
      await within(dialog).findByText('Refund may be due, handled outside the app'),
    ).toBeVisible()
    expect(reads).toBe(3)
  })
})

describe('deleting with a real payment (D-210, D-212, D-213)', () => {
  it('needs the tick, then sends the confirm with the total shown', async () => {
    signIn()
    const served = serve({ reads: [paidInfo(85)] })
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)
    const remove = await within(dialog).findByRole('button', { name: 'Delete registration' })
    expect(within(dialog).getByText(/Paid outside this system: \$85\.00/)).toBeVisible()
    expect(remove).toBeDisabled()

    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(remove)

    expect(await screen.findByText('Maria Chen: Registration deleted.')).toBeVisible()
    expect(served.deletes).toEqual(['?confirmWarnings=true&paid=85.00'])
  })

  it('reads the new total and asks again when a payment arrived since (D-210)', async () => {
    signIn()
    const served = serve({
      reads: [paidInfo(85), paidInfo(145)],
      answers: [
        () =>
          HttpResponse.json(
            {
              message: 'Confirm to delete this registration.',
              warnings: [{ field: 'registration', message: 'Paid.' }],
              paid: 145,
            },
            { status: 409 },
          ),
        () => new HttpResponse(null, { status: 204 }),
      ],
    })
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('checkbox'))
    await user.click(within(dialog).getByRole('button', { name: 'Delete registration' }))

    expect(
      await within(dialog).findByText(
        'This registration changed. Review the new total and confirm again.',
      ),
    ).toBeVisible()
    expect(await within(dialog).findByText(/Paid outside this system: \$145\.00/)).toBeVisible()
    expect(within(dialog).getByRole('checkbox')).not.toBeChecked()
    expect(within(dialog).getByRole('button', { name: 'Delete registration' })).toBeDisabled()

    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(within(dialog).getByRole('button', { name: 'Delete registration' }))

    expect(await screen.findByText('Maria Chen: Registration deleted.')).toBeVisible()
    expect(served.deletes).toEqual([
      '?confirmWarnings=true&paid=85.00',
      '?confirmWarnings=true&paid=145.00',
    ])
  })
})

describe('refusals (REG-19, D-211)', () => {
  it('shows scores in the dialog with only Close, and offers no delete', async () => {
    signIn()
    const served = serve({ reads: [createDeleteInfo({ hasScores: true })] })
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)

    expect(await within(dialog).findByText('Cannot delete registration with scores.')).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: 'Delete registration' })).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(served.deletes).toEqual([])
  })

  it('closes the dialog and keeps an error toast when the server refuses (a score arrived)', async () => {
    signIn()
    serve({
      answers: [
        () =>
          HttpResponse.json(
            {
              message: 'Cannot delete registration with scores.',
              errors: { scores: 'Cannot delete registration with scores.' },
            },
            { status: 409 },
          ),
      ],
    })
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete registration' }))

    expect(await screen.findByText('Cannot delete registration with scores.')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Maria Chen' })).toBeVisible()
  })

  it('dismisses the refusal toast, and clears it when the dialog opens again', async () => {
    signIn()
    serve({
      answers: [
        () =>
          HttpResponse.json(
            { message: 'Cannot delete registration with scores.', errors: { scores: 'Gone.' } },
            { status: 409 },
          ),
      ],
    })
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete registration' }))
    expect(await screen.findByText('Gone.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Gone.')).not.toBeInTheDocument()

    const again = await openDialog(user)
    await user.click(await within(again).findByRole('button', { name: 'Delete registration' }))
    expect(await screen.findByText('Gone.')).toBeVisible()
    // The same row's button clears its own old toast as it opens the dialog.
    await user.click(screen.getByRole('button', { name: "Delete Maria Chen's registration" }))
    expect(screen.queryByText('Gone.')).not.toBeInTheDocument()
  })

  it('shows Try again when the facts cannot be read, and keeps Delete off', async () => {
    signIn()
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/settings', () =>
        HttpResponse.json({ settings: createSettings() }),
      ),
      http.get('/v1/tournaments/:id/registrations', () =>
        HttpResponse.json({ registrations: [maria], summary: emptySummary }),
      ),
      http.get(
        '/v1/tournaments/:id/registrations/:registrationId/delete-info',
        () => new HttpResponse(null, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    renderApp(list)

    const dialog = await openDialog(user)

    // The read retries once after a second before it gives up.
    expect(
      await within(dialog).findByText(
        /Failed to load the registration \(500\)/,
        {},
        { timeout: 5000 },
      ),
    ).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Delete registration' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeVisible()
  })
})

describe('the edit page (D-214, D-215)', () => {
  const registrationId = '00000000-0000-4000-8000-0000000000bb'
  const editUrl = `/tournaments/${tournament.id}/registrations/${registrationId}/edit`

  function serveEdit() {
    const served = serve()
    server.use(
      http.get('/v1/tournaments/:id/divisions', () => HttpResponse.json({ divisions: [scratch] })),
      http.get('/v1/tournaments/:id/squads', () => HttpResponse.json({ squads: [squad] })),
      http.get('/v1/tournaments/:id/sweepers', () => HttpResponse.json({ sweepers: [sweeper] })),
      http.get('/v1/tournaments/:id/registrations/:registrationId/edit-info', () =>
        HttpResponse.json(
          createEditInfo({
            registration: {
              id: registrationId,
              divisionId: scratch.id,
              squadIds: [squad.id],
              sweeperIds: [],
            },
          }),
        ),
      ),
    )
    return served
  }

  it('puts Delete registration in a Danger zone below the form', async () => {
    signIn()
    serveEdit()

    renderApp(editUrl)

    const zone = await screen.findByRole('region', { name: 'Danger zone' })
    expect(within(zone).getByRole('button', { name: 'Delete registration' })).toBeVisible()
    expect(within(zone).getByText(/cannot be undone/)).toBeVisible()
  })

  it('deletes from there and goes to the list with the toast, named for the bowler', async () => {
    signIn()
    const served = serveEdit()
    const user = userEvent.setup()
    renderApp(editUrl)

    const zone = await screen.findByRole('region', { name: 'Danger zone' })
    await user.click(within(zone).getByRole('button', { name: 'Delete registration' }))
    const dialog = await screen.findByRole('dialog', {
      name: "Delete Maria Gonzalez's registration?",
    })
    await user.click(await within(dialog).findByRole('button', { name: 'Delete registration' }))

    expect(await screen.findByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
    expect(await screen.findByText('Maria Gonzalez: Registration deleted.')).toBeVisible()
    expect(served.deletes).toEqual([''])
  })

  it('goes to the list when the registration was already deleted', async () => {
    signIn()
    serveEdit()
    server.use(
      http.delete('/v1/tournaments/:id/registrations/:registrationId', () =>
        HttpResponse.json({ message: 'Registration not found' }, { status: 404 }),
      ),
    )
    const user = userEvent.setup()
    renderApp(editUrl)

    const zone = await screen.findByRole('region', { name: 'Danger zone' })
    await user.click(within(zone).getByRole('button', { name: 'Delete registration' }))
    const dialog = await screen.findByRole('dialog', {
      name: "Delete Maria Gonzalez's registration?",
    })
    await user.click(await within(dialog).findByRole('button', { name: 'Delete registration' }))

    expect(await screen.findByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
    expect(
      await screen.findByText('Maria Gonzalez: Registration was already deleted.'),
    ).toBeVisible()
  })

  it('shows no Danger zone to a score keeper, who cannot reach the page', async () => {
    signIn('scoreKeeper')
    serveEdit()

    renderApp(editUrl)

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Danger zone' })).not.toBeInTheDocument()
    })
  })
})
