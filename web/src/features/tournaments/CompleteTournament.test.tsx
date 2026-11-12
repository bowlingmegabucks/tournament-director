import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSettings, createSignedInUser, createTournament } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'
import type { TournamentCompleteInfo } from './completeApi'

const tournament = createTournament({ name: 'Spring Open' })
const id = tournament.id

const info = (overrides: Partial<TournamentCompleteInfo> = {}): TournamentCompleteInfo => ({
  squadCount: 3,
  openSquadCount: 2,
  openSweeperCount: 1,
  noScoreCount: 3,
  partialCount: 1,
  ...overrides,
})

/** Settings turn `completed` once a complete went through, as the real API does. */
function serve(options: { completed?: boolean; info?: TournamentCompleteInfo } = {}) {
  let completed = options.completed === true
  server.use(
    http.get(`/v1/tournaments/${id}`, () => HttpResponse.json({ tournament })),
    http.get(`/v1/tournaments/${id}/settings`, () =>
      HttpResponse.json({ settings: createSettings({ completed }) }),
    ),
    http.get(`/v1/tournaments/${id}/complete-info`, () =>
      HttpResponse.json({ completeInfo: options.info ?? info() }),
    ),
  )
  return {
    finish: () => {
      completed = true
    },
  }
}

const completeButton = () => screen.queryByRole('button', { name: 'Complete tournament' })

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Complete tournament' }))
  return screen.findByRole('dialog', { name: 'Complete this tournament?' })
}

async function typeName(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  name = 'Spring Open',
) {
  await user.type(within(dialog).getByLabelText('Type the tournament name to confirm'), name)
}

describe('who sees Complete tournament (TRN-42, D-256, D-260)', () => {
  it.each([['director'], ['admin']] as const)(
    'shows a %s the button inside the Danger zone with its sentence (D-215)',
    async (role) => {
      setMockUser(createSignedInUser({ roles: [role] }))
      serve()

      renderApp(`/tournaments/${id}`)

      const zone = await screen.findByRole('region', { name: 'Danger zone' })
      expect(within(zone).getByRole('button', { name: 'Complete tournament' })).toBeVisible()
      expect(within(zone).getByText(/closes every open squad and sweeper/)).toBeVisible()
    },
  )

  it('shows a director Complete but not Delete, and an admin both (D-132, D-260)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    const director = renderApp(`/tournaments/${id}`)
    await screen.findByRole('button', { name: 'Complete tournament' })
    expect(screen.queryByRole('button', { name: 'Delete tournament' })).not.toBeInTheDocument()
    director.unmount()

    setMockUser(createSignedInUser({ roles: ['admin'] }))
    renderApp(`/tournaments/${id}`)
    expect(await screen.findByRole('button', { name: 'Delete tournament' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Complete tournament' })).toBeVisible()
  })

  it.each([
    ['a score keeper', createSignedInUser({ roles: ['scoreKeeper'] })],
    ['a signed-out visitor', null],
  ])('hides it from %s, with no empty Danger zone', async (_who, user) => {
    setMockUser(user)
    serve()

    renderApp(`/tournaments/${id}`)

    await screen.findByText('Games per squad')
    expect(completeButton()).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Danger zone' })).not.toBeInTheDocument()
  })

  it('hides it on a complete tournament, which shows the badge instead (TRN-31)', async () => {
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    serve({ completed: true })

    renderApp(`/tournaments/${id}`)

    await screen.findByText('Completed')
    expect(completeButton()).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Danger zone' })).not.toBeInTheDocument()
  })

  it('is not on the edit page (D-260)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    server.use(
      http.get(`/v1/tournaments/${id}/edit-info`, () =>
        HttpResponse.json({
          editInfo: { registrationCount: 0, hasScores: false, hasSweeperScores: false },
        }),
      ),
    )

    renderApp(`/tournaments/${id}/edit`)

    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeVisible()
    expect(completeButton()).not.toBeInTheDocument()
  })
})

describe('the Complete dialog (TRN-43, D-130, D-259)', () => {
  it('loads, then lists what will happen and asks for the name', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)

    const dialog = await openDialog(user)

    expect(
      await within(dialog).findByText('Complete 2 open squads and 1 open sweeper.'),
    ).toBeVisible()
    expect(
      within(dialog).getByText('Save a zero for every game of 3 bowlers with no scores.'),
    ).toBeVisible()
    expect(
      within(dialog).getByText('Leave 1 bowler with some games but not all as entered.'),
    ).toBeVisible()
    expect(within(dialog).getByText(/This cannot be undone/)).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Complete tournament' })).toBeDisabled()
  })

  it('shows a Loading state and no Complete button until the counts arrive', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(`/v1/tournaments/${id}/complete-info`, async () => {
        await gate
        return HttpResponse.json({ completeInfo: info() })
      }),
    )
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)

    const dialog = await openDialog(user)

    expect(within(dialog).getByText('Loading what this will do…')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Complete tournament' })).toBeDisabled()
    release()
    await within(dialog).findByLabelText('Type the tournament name to confirm')
  })

  it('drops the lines with a zero count, and says so when nothing is open (D-259)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve({
      info: info({ openSquadCount: 0, openSweeperCount: 0, noScoreCount: 0, partialCount: 0 }),
    })
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)

    const dialog = await openDialog(user)

    expect(
      await within(dialog).findByText(
        'Every squad and sweeper is already complete, so no scores will be saved.',
      ),
    ).toBeVisible()
    expect(within(dialog).queryByText('This will:')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument()
  })

  it('turns Complete on only when the typed name matches (D-136)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    const button = await within(dialog).findByRole('button', { name: 'Complete tournament' })

    await typeName(user, dialog, 'Spring')
    expect(button).toBeDisabled()
    await typeName(user, dialog, ' Open')
    expect(button).toBeEnabled()
  })

  it('has focus on Cancel first and closes without a request (D-136)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    let posted = false
    server.use(
      http.post(`/v1/tournaments/${id}/complete`, () => {
        posted = true
        return HttpResponse.json({})
      }),
    )
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(posted).toBe(false)
  })

  it('offers Try again and no Complete button when the counts fail to load (D-259)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    let calls = 0
    server.use(
      http.get(`/v1/tournaments/${id}/complete-info`, () => {
        calls += 1
        return calls === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ completeInfo: info() })
      }),
    )
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Failed to load what completing does (500)',
    )
    expect(
      within(dialog).queryByRole('button', { name: 'Complete tournament' }),
    ).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))

    expect(within(dialog).getByText('Loading what this will do…')).toBeVisible()
    expect(
      await within(dialog).findByLabelText('Type the tournament name to confirm'),
    ).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Complete tournament' })).toBeVisible()
  })
})

describe('completing (TRN-38, TRN-43, D-256, D-260)', () => {
  it('posts, closes the dialog, shows the toast and the badge, and removes the Danger zone', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    const state = serve()
    let posts = 0
    server.use(
      http.post(`/v1/tournaments/${id}/complete`, () => {
        posts += 1
        state.finish()
        return HttpResponse.json({
          completed: true,
          squadsCompleted: 2,
          sweepersCompleted: 1,
          noShowCount: 3,
        })
      }),
    )
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await within(dialog).findByLabelText('Type the tournament name to confirm')

    await typeName(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Complete tournament' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Tournament completed. 2 squads and 1 sweeper closed, 3 bowlers got zeros.',
    )
    expect(posts).toBe(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Completed')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Danger zone' })).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('link', { name: 'Edit tournament' })).not.toBeInTheDocument()
  })

  it('shows the Completing… state and holds the buttons while it saves', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post(`/v1/tournaments/${id}/complete`, async () => {
        await gate
        return HttpResponse.json({
          completed: true,
          squadsCompleted: 0,
          sweepersCompleted: 0,
          noShowCount: 0,
        })
      }),
    )
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await within(dialog).findByLabelText('Type the tournament name to confirm')
    await typeName(user, dialog)

    await user.click(within(dialog).getByRole('button', { name: 'Complete tournament' }))

    expect(await within(dialog).findByRole('button', { name: 'Completing…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    release()
    expect(await screen.findByRole('status')).toHaveTextContent('Tournament completed.')
  })

  it('submits with Enter in the name box once the name matches', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    let posts = 0
    server.use(
      http.post(`/v1/tournaments/${id}/complete`, () => {
        posts += 1
        return HttpResponse.json({
          completed: true,
          squadsCompleted: 0,
          sweepersCompleted: 0,
          noShowCount: 0,
        })
      }),
    )
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await within(dialog).findByLabelText('Type the tournament name to confirm')

    await user.type(
      within(dialog).getByLabelText('Type the tournament name to confirm'),
      'Nope{Enter}',
    )
    expect(posts).toBe(0)
    await user.clear(within(dialog).getByLabelText('Type the tournament name to confirm'))
    await user.type(
      within(dialog).getByLabelText('Type the tournament name to confirm'),
      'Spring Open{Enter}',
    )

    await waitFor(() => {
      expect(posts).toBe(1)
    })
  })

  it('closes the dialog and keeps an error toast until dismissed when the API refuses (TRN-39, D-257)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    server.use(
      http.post(`/v1/tournaments/${id}/complete`, () =>
        HttpResponse.json(
          {
            message: 'This tournament is already complete',
            errors: { tournament: 'This tournament is already complete' },
          },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await within(dialog).findByLabelText('Type the tournament name to confirm')
    await typeName(user, dialog)

    await user.click(within(dialog).getByRole('button', { name: 'Complete tournament' }))

    const toast = await screen.findByRole('alert')
    expect(toast).toHaveTextContent('This tournament is already complete')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(within(toast).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lists every reason of a refusal in the toast', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    server.use(
      http.post(`/v1/tournaments/${id}/complete`, () =>
        HttpResponse.json(
          {
            message: 'This tournament is already complete',
            errors: {
              tournament:
                'This tournament is already complete\nAdd a squad before you complete this tournament',
            },
          },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await within(dialog).findByLabelText('Type the tournament name to confirm')
    await typeName(user, dialog)

    await user.click(within(dialog).getByRole('button', { name: 'Complete tournament' }))

    const toast = await screen.findByRole('alert')
    expect(
      within(toast)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'This tournament is already complete',
      'Add a squad before you complete this tournament',
    ])
  })

  it('says the tournament is gone for a 404', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    server.use(
      http.post(`/v1/tournaments/${id}/complete`, () => new HttpResponse(null, { status: 404 })),
    )
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await within(dialog).findByLabelText('Type the tournament name to confirm')
    await typeName(user, dialog)

    await user.click(within(dialog).getByRole('button', { name: 'Complete tournament' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This tournament was not found. It may have been removed.',
    )
  })

  it('keeps the dialog open with the failure and the name typed when the request fails', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve()
    server.use(
      http.post(`/v1/tournaments/${id}/complete`, () => new HttpResponse(null, { status: 500 })),
    )
    const user = userEvent.setup()
    renderApp(`/tournaments/${id}`)
    const dialog = await openDialog(user)
    await within(dialog).findByLabelText('Type the tournament name to confirm')
    await typeName(user, dialog)

    await user.click(within(dialog).getByRole('button', { name: 'Complete tournament' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Failed to complete the tournament (500)',
    )
    expect(within(dialog).getByLabelText('Type the tournament name to confirm')).toHaveValue(
      'Spring Open',
    )
    expect(within(dialog).getByRole('button', { name: 'Complete tournament' })).toBeEnabled()
  })
})
