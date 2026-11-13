import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import App from '../../App'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSettings, createSignedInUser, createTournament } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'

const tournament = createTournament({ name: 'Spring Open' })
const id = tournament.id

function serve(options: { completed?: boolean } = {}) {
  server.use(
    http.get(`/v1/tournaments/${id}`, () => HttpResponse.json({ tournament })),
    http.get(`/v1/tournaments/${id}/settings`, () =>
      HttpResponse.json({ settings: createSettings({ completed: options.completed === true }) }),
    ),
    http.get(`/v1/tournaments/${id}/edit-info`, () =>
      HttpResponse.json({
        editInfo: { registrationCount: 0, hasScores: false, hasSweeperScores: false },
      }),
    ),
  )
}

/** Record each DELETE and answer with `answer`, which may differ per call. */
function serveDelete(...answers: (() => Response)[]) {
  const urls: string[] = []
  server.use(
    http.delete(`/v1/tournaments/${id}`, ({ request }) => {
      urls.push(new URL(request.url).search)
      const answer = answers[Math.min(urls.length, answers.length) - 1]
      return answer ? answer() : new HttpResponse(null, { status: 204 })
    }),
  )
  return urls
}

const gone = () => new HttpResponse(null, { status: 204 })
const deleteButton = () => screen.queryByRole('button', { name: 'Delete tournament' })

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Delete tournament' }))
  return screen.findByRole('dialog', { name: 'Delete this tournament?' })
}

async function typeNameAndDelete(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  name = 'Spring Open',
) {
  await user.type(within(dialog).getByLabelText('Type the tournament name to confirm'), name)
  await user.click(within(dialog).getByRole('button', { name: /^Delete/ }))
}

describe('who sees Delete (TRN-37, D-132, D-136, D-19)', () => {
  it.each([
    ['the overview', `/tournaments/${id}`],
    ['the edit page', `/tournaments/${id}/edit`],
  ])('shows an admin a Delete button on %s', async (_page, route) => {
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    serve()

    renderApp(route)

    expect(await screen.findByRole('button', { name: 'Delete tournament' })).toBeVisible()
  })

  it.each([
    ['the overview', `/tournaments/${id}`],
    ['the edit page', `/tournaments/${id}/edit`],
  ])('keeps the Delete button in a Danger zone on %s (D-215)', async (_page, route) => {
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    serve()

    renderApp(route)

    const zone = await screen.findByRole('region', { name: 'Danger zone' })
    expect(within(zone).getByRole('button', { name: 'Delete tournament' })).toBeVisible()
    expect(within(zone).getByText(/Delete this tournament and everything under it/)).toBeVisible()
  })

  it.each([
    ['the overview', `/tournaments/${id}`],
    ['the edit page', `/tournaments/${id}/edit`],
  ])('shows no Delete button or empty Danger zone to a director on %s', async (_page, route) => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()

    renderApp(route)

    await screen.findByRole('heading', { level: 1 })
    expect(deleteButton()).not.toBeInTheDocument()
    // The overview's zone holds Complete for a director (D-260); the edit page has no zone for one.
    if (route.endsWith('/edit')) {
      expect(screen.queryByRole('region', { name: 'Danger zone' })).not.toBeInTheDocument()
    }
  })

  it.each([
    ['a director', createSignedInUser({ roles: ['director'] })],
    ['a score keeper', createSignedInUser({ roles: ['scoreKeeper'] })],
    ['a signed-out visitor', null],
  ])('hides it from %s on the overview', async (_who, user) => {
    setMockUser(user)
    serve()

    renderApp(`/tournaments/${id}`)

    await screen.findByText('Games per squad')
    expect(deleteButton()).not.toBeInTheDocument()
  })

  it('hides it from a director on the edit page, who can still edit', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()

    renderApp(`/tournaments/${id}/edit`)

    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeVisible()
    expect(deleteButton()).not.toBeInTheDocument()
  })

  it('hides it on a complete tournament, even from an admin', async () => {
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    serve({ completed: true })

    renderApp(`/tournaments/${id}`)

    await screen.findByText('Completed')
    expect(deleteButton()).not.toBeInTheDocument()
  })

  it('hides it on the edit page of a complete tournament', async () => {
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    serve({ completed: true })

    renderApp(`/tournaments/${id}/edit`)

    await screen.findByRole('link', { name: 'Back to tournament' })
    expect(deleteButton()).not.toBeInTheDocument()
  })

  it('shows no button until the settings are known', async () => {
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    serve()
    server.use(
      http.get(`/v1/tournaments/${id}/settings`, () => new HttpResponse(null, { status: 500 })),
    )

    renderApp(`/tournaments/${id}`)

    await screen.findByRole('heading', { name: 'Spring Open', level: 1 })
    expect(deleteButton()).not.toBeInTheDocument()
  })
})

describe('the delete dialog (TRN-36, D-136)', () => {
  function admin() {
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    serve()
    return userEvent.setup()
  }

  it('says the delete is permanent, names the tournament, and puts focus on Cancel', async () => {
    const user = admin()
    renderApp(`/tournaments/${id}`)

    const dialog = await openDialog(user)

    expect(dialog).toHaveTextContent('This deletes Spring Open for good. It cannot be undone.')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('keeps Delete off until the typed name matches, ignoring case and outer spaces', async () => {
    const user = admin()
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    const box = within(dialog).getByLabelText('Type the tournament name to confirm')
    const button = within(dialog).getByRole('button', { name: 'Delete tournament' })
    expect(button).toBeDisabled()

    await user.type(box, 'Spring Ope')
    expect(button).toBeDisabled()

    await user.type(box, 'n')
    expect(button).toBeEnabled()

    await user.clear(box)
    await user.type(box, '  spring OPEN ')
    expect(button).toBeEnabled()
  })

  it('does not send anything for a wrong name, even on Enter', async () => {
    const user = admin()
    const urls = serveDelete(gone)
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)

    await user.type(
      within(dialog).getByLabelText('Type the tournament name to confirm'),
      'Spring{Enter}',
    )

    expect(urls).toEqual([])
  })

  it('closes with Cancel, sending nothing (Escape is checked in e2e)', async () => {
    const user = admin()
    const urls = serveDelete(gone)
    renderApp(`/tournaments/${id}`)

    await openDialog(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(urls).toEqual([])
  })

  it('starts clean each time it opens', async () => {
    const user = admin()
    renderApp(`/tournaments/${id}`)
    const first = await openDialog(user)
    await user.type(within(first).getByLabelText('Type the tournament name to confirm'), 'Spring')
    await user.click(within(first).getByRole('button', { name: 'Cancel' }))

    const second = await openDialog(user)

    expect(within(second).getByLabelText('Type the tournament name to confirm')).toHaveValue('')
  })

  it('goes to the list with a "Tournament deleted" toast, sending no confirmation first (TRN-37)', async () => {
    const user = admin()
    const urls = serveDelete(gone)
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)

    await typeNameAndDelete(user, dialog)

    expect(await screen.findByRole('heading', { name: 'Tournaments', level: 1 })).toBeVisible()
    expect(await screen.findByText('Tournament deleted')).toBeVisible()
    expect(urls).toEqual([''])
    expect(screen.queryByText('Tournament not found')).not.toBeInTheDocument()
  })

  it('shows Deleting… with both buttons off while the request runs', async () => {
    const user = admin()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.delete(`/v1/tournaments/${id}`, async () => {
        await gate
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)

    await typeNameAndDelete(user, dialog)

    expect(await within(dialog).findByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    release()
    expect(await screen.findByText('Tournament deleted')).toBeVisible()
  })

  it('ignores a warning that arrives after the dialog closed, so the next open starts clean', async () => {
    const user = admin()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.delete(`/v1/tournaments/${id}`, async () => {
        await gate
        return HttpResponse.json(
          {
            message: 'Confirm.',
            warnings: [{ field: 'tournament', message: '3 registrations go.' }],
            counts: { registrations: 3, divisions: 0, squads: 0, sweepers: 0 },
          },
          { status: 409 },
        )
      }),
    )
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await typeNameAndDelete(user, dialog)
    await within(dialog).findByRole('button', { name: 'Deleting…' })

    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent(dialog, new Event('close'))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    release()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete tournament' })).toBeEnabled()
    })

    const next = await openDialog(user)
    expect(within(next).getByLabelText('Type the tournament name to confirm')).toBeVisible()
    expect(within(next).queryByText('3 registrations go.')).not.toBeInTheDocument()
  })

  describe('the registrations warning (TRN-34, D-134)', () => {
    const warn = () =>
      HttpResponse.json(
        {
          message: 'Confirm to delete this tournament.',
          warnings: [
            {
              field: 'tournament',
              message:
                '12 registrations and 4 divisions will be deleted, with their lane assignments and payment records. The bowlers stay.',
            },
          ],
          counts: { registrations: 12, divisions: 4, squads: 0, sweepers: 0 },
        },
        { status: 409 },
      )

    it('shows what will go, then deletes with confirmWarnings=true and the counts shown (D-137)', async () => {
      const user = admin()
      const urls = serveDelete(warn, gone)
      renderApp(`/tournaments/${id}`)
      const dialog = await openDialog(user)

      await typeNameAndDelete(user, dialog)

      expect(await within(dialog).findByText(/12 registrations and 4 divisions/)).toBeVisible()
      expect(within(dialog).getByText('This cannot be undone.')).toBeVisible()
      expect(
        within(dialog).queryByLabelText('Type the tournament name to confirm'),
      ).not.toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Delete anyway' }))

      expect(await screen.findByText('Tournament deleted')).toBeVisible()
      expect(urls).toEqual([
        '',
        '?confirmWarnings=true&registrations=12&divisions=4&squads=0&sweepers=0',
      ])
    })

    it('shows the new counts and asks again when they moved since the warning (D-137)', async () => {
      const user = admin()
      const moved = () =>
        HttpResponse.json(
          {
            message: 'Confirm to delete this tournament.',
            warnings: [{ field: 'tournament', message: '14 registrations will be deleted.' }],
            counts: { registrations: 14, divisions: 4, squads: 0, sweepers: 0 },
          },
          { status: 409 },
        )
      const urls = serveDelete(warn, moved, gone)
      renderApp(`/tournaments/${id}`)
      const dialog = await openDialog(user)
      await typeNameAndDelete(user, dialog)
      await user.click(await within(dialog).findByRole('button', { name: 'Delete anyway' }))

      expect(await within(dialog).findByText(/14 registrations will be deleted/)).toBeVisible()
      expect(screen.queryByText('Tournament deleted')).not.toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Delete anyway' }))

      expect(await screen.findByText('Tournament deleted')).toBeVisible()
      expect(urls[2]).toBe('?confirmWarnings=true&registrations=14&divisions=4&squads=0&sweepers=0')
    })

    it('forgets the warning when the dialog is closed and opened again', async () => {
      const user = admin()
      serveDelete(warn)
      renderApp(`/tournaments/${id}`)
      const dialog = await openDialog(user)
      await typeNameAndDelete(user, dialog)
      await within(dialog).findByText(/12 registrations/)
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

      const again = await openDialog(user)

      expect(within(again).getByLabelText('Type the tournament name to confirm')).toBeVisible()
      expect(within(again).queryByText(/12 registrations/)).not.toBeInTheDocument()
    })
  })

  describe('a refusal (TRN-33, D-133)', () => {
    it('closes the dialog and keeps an error toast with every reason', async () => {
      const user = admin()
      serveDelete(() =>
        HttpResponse.json(
          {
            message: 'Scores are saved, so this tournament cannot be deleted.',
            errors: {
              tournament:
                'Scores are saved, so this tournament cannot be deleted.\n3 bowlers paid online. Remove their registrations first.',
            },
          },
          { status: 409 },
        ),
      )
      renderApp(`/tournaments/${id}`)
      const dialog = await openDialog(user)

      await typeNameAndDelete(user, dialog)

      const alert = await screen.findByRole('alert')
      expect(
        within(alert)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        'Scores are saved, so this tournament cannot be deleted.',
        '3 bowlers paid online. Remove their registrations first.',
      ])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Spring Open', level: 1 })).toBeVisible()
      await user.click(within(alert).getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('goes to the list with an info toast when the tournament is already gone (D-136)', async () => {
    const user = admin()
    serveDelete(() => new HttpResponse(null, { status: 404 }))
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)

    await typeNameAndDelete(user, dialog)

    expect(await screen.findByRole('heading', { name: 'Tournaments', level: 1 })).toBeVisible()
    expect(await screen.findByText('That tournament was already deleted.')).toBeVisible()
    expect(screen.queryByText('Tournament deleted')).not.toBeInTheDocument()
  })

  it('stays open and says why for any other failure, so the admin can try again', async () => {
    const user = admin()
    const urls = serveDelete(() => new HttpResponse(null, { status: 503 }), gone)
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)

    await typeNameAndDelete(user, dialog)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Failed to delete the tournament (503)',
    )
    expect(dialog).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Delete tournament' }))

    expect(await screen.findByText('Tournament deleted')).toBeVisible()
    await waitFor(() => {
      expect(urls).toEqual(['', ''])
    })
  })

  it('works from the edit page too (D-136)', async () => {
    const user = admin()
    serveDelete(gone)
    renderApp(`/tournaments/${id}/edit`)
    const dialog = await openDialog(user)

    await typeNameAndDelete(user, dialog)

    expect(await screen.findByText('Tournament deleted')).toBeVisible()
  })

  it('joins several warnings with a space', async () => {
    const user = admin()
    serveDelete(() =>
      HttpResponse.json(
        {
          message: 'Confirm.',
          warnings: [
            { field: 'tournament', message: 'First warning.' },
            { field: 'tournament', message: 'Second warning.' },
          ],
          counts: { registrations: 1, divisions: 0, squads: 0, sweepers: 0 },
        },
        { status: 409 },
      ),
    )
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)

    await typeNameAndDelete(user, dialog)

    expect(await within(dialog).findByText('First warning. Second warning.')).toBeVisible()
  })

  it('clears an old failure when the admin tries again, and when the dialog closes', async () => {
    const user = admin()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    server.use(
      http.delete(`/v1/tournaments/${id}`, async () => {
        calls += 1
        if (calls === 1) return new HttpResponse(null, { status: 503 })
        await gate
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await typeNameAndDelete(user, dialog)
    expect(await within(dialog).findByRole('alert')).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: 'Delete tournament' }))

    await within(dialog).findByRole('button', { name: 'Deleting…' })
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    release()
    await screen.findByText('Tournament deleted')
  })

  it('does not show an old failure when the dialog opens again', async () => {
    const user = admin()
    serveDelete(() => new HttpResponse(null, { status: 503 }))
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await typeNameAndDelete(user, dialog)
    await within(dialog).findByRole('alert')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    const again = await openDialog(user)

    expect(within(again).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('drops the refusal toast when the dialog opens again', async () => {
    const user = admin()
    serveDelete(() =>
      HttpResponse.json(
        { message: 'Scores are saved.', errors: { tournament: 'Scores are saved.' } },
        { status: 409 },
      ),
    )
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await typeNameAndDelete(user, dialog)
    await screen.findByRole('alert')

    await openDialog(user)

    expect(screen.queryByText('Scores are saved.')).not.toBeInTheDocument()
  })

  it('sends nothing when the form is submitted with the wrong name', async () => {
    const user = admin()
    const urls = serveDelete(gone)
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await user.type(within(dialog).getByLabelText('Type the tournament name to confirm'), 'Spring')

    const form = within(dialog).getByRole('button', { name: 'Delete tournament' }).closest('form')
    expect(form).not.toBeNull()
    // Not a click on the disabled button: the form itself is submitted, as Enter would do.
    const notPrevented = form ? fireEvent.submit(form) : true

    expect(notPrevented).toBe(false)
    // A request would start a tick later: give it one before saying none was sent.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(urls).toEqual([])
    expect(within(dialog).queryByRole('button', { name: 'Deleting…' })).not.toBeInTheDocument()
  })

  it('drops the deleted tournament from the cache and leaves other queries alone', async () => {
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    serve()
    serveDelete(gone)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const otherDetail = ['tournaments', crypto.randomUUID()] as const
    client.setQueryData(otherDetail, 'other tournament')
    client.setQueryData(['unrelated'], 'unrelated')
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/tournaments/${id}`]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const dialog = await openDialog(user)

    await typeNameAndDelete(user, dialog)
    await screen.findByText('Tournament deleted')

    expect(client.getQueryData(['tournaments', id])).toBeUndefined()
    expect(client.getQueryData(otherDetail)).toBe('other tournament')
    expect(client.getQueryState(['unrelated'])?.isInvalidated).toBe(false)
    expect(client.getQueryState(otherDetail)?.isInvalidated).toBe(true)
  })

  it.each([
    ['deleted', gone, 'Tournament deleted'],
    [
      'already deleted',
      () => new HttpResponse(null, { status: 404 }),
      'That tournament was already deleted.',
    ],
  ])('closes the %s toast with Dismiss', async (_which, answer, text) => {
    const user = admin()
    serveDelete(answer)
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await typeNameAndDelete(user, dialog)
    expect(await screen.findByText(text)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText(text)).not.toBeInTheDocument()
  })
})

describe('deleting from an edit page with unsaved changes', () => {
  it('goes to the list without asking "Leave without saving?"', async () => {
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    serve()
    serveDelete(gone)
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}/edit`)
    await user.type(await screen.findByLabelText('Name (required)'), ' Two')

    const dialog = await openDialog(user)
    await typeNameAndDelete(user, dialog)

    expect(await screen.findByText('Tournament deleted')).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).not.toBeInTheDocument()
  })
})
