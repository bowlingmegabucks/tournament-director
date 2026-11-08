import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { setMockUser } from '../mocks/authHandlers'
import {
  createSettings,
  createSignedInUser,
  createSquad,
  createSweeper,
  createTournament,
} from '../mocks/data'
import { renderApp } from '../test/renderApp'

const tournament = createTournament({ name: 'Spring Open' })
const id = tournament.id

interface Session {
  id: string
  date: string
  complete: boolean
}

interface Kind {
  kind: 'squads' | 'sweepers'
  word: 'squad' | 'sweeper'
  Word: 'Squad' | 'Sweeper'
  make: (overrides: { date: string; complete?: boolean }) => Session
}

const kinds: Kind[] = [
  { kind: 'squads', word: 'squad', Word: 'Squad', make: createSquad },
  { kind: 'sweepers', word: 'sweeper', Word: 'Sweeper', make: createSweeper },
]

const morning = 'Sat 10/24/2026 9:00 AM'
const evening = 'Sat 10/24/2026 6:00 PM'

describe.each(kinds)('deleting a $word (SQD-14, D-186 to D-189)', ({ kind, word, Word, make }) => {
  const open = () => renderApp(`/tournaments/${id}/${kind}`)

  const pair = () => [make({ date: '2026-10-24T09:00:00' }), make({ date: '2026-10-24T18:00:00' })]

  /** A list the delete can change: the DELETE handler removes the row, so the refetch shows it gone. */
  function serve(
    sessions: Session[],
    options: {
      completed?: boolean
      info?: () => Response
      remove?: (sessionId: string) => Response | Promise<Response> | undefined
    } = {},
  ) {
    const requests: string[] = []
    server.use(
      http.get(`/v1/tournaments/${id}`, () => HttpResponse.json({ tournament })),
      http.get(`/v1/tournaments/${id}/settings`, () =>
        HttpResponse.json({ settings: createSettings({ completed: options.completed === true }) }),
      ),
      http.get(`/v1/tournaments/${id}/${kind}`, () => HttpResponse.json({ [kind]: sessions })),
      http.get(
        `/v1/tournaments/${id}/${kind}/:sessionId/delete-info`,
        options.info ?? (() => HttpResponse.json({ deleteInfo: { entryCount: 0, scoreCount: 0 } })),
      ),
      http.delete(`/v1/tournaments/${id}/${kind}/:sessionId`, async ({ params }) => {
        const sessionId = String(params['sessionId'])
        requests.push(sessionId)
        const answer = await options.remove?.(sessionId)
        if (answer) return answer
        sessions.splice(
          sessions.findIndex((session) => session.id === sessionId),
          1,
        )
        return new HttpResponse(null, { status: 204 })
      }),
    )
    return requests
  }

  async function openDialog(user: ReturnType<typeof userEvent.setup>, date = morning) {
    await user.click(await screen.findByRole('button', { name: `Delete ${word} ${date}` }))
    return screen.findByRole('dialog', { name: `Delete this ${word}?` })
  }

  const confirm = (dialog: HTMLElement) =>
    within(dialog).findByRole('button', { name: `Delete ${word}` })

  describe('who sees Delete (D-187, D-188)', () => {
    it.each(['director', 'admin'] as const)(
      'gives a %s a Delete button per open card, named for its date',
      async (role) => {
        setMockUser(createSignedInUser({ roles: [role] }))
        serve(pair())

        open()

        expect(
          await screen.findByRole('button', { name: `Delete ${word} ${morning}` }),
        ).toBeVisible()
        expect(screen.getByRole('button', { name: `Delete ${word} ${evening}` })).toBeVisible()
      },
    )

    it('hides it on a complete card (SQD-17, D-188)', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([make({ date: '2026-10-24T09:00:00', complete: true }), ...pair().slice(1)])

      open()

      expect(await screen.findByRole('button', { name: `Delete ${word} ${evening}` })).toBeVisible()
      expect(
        screen.queryByRole('button', { name: `Delete ${word} ${morning}` }),
      ).not.toBeInTheDocument()
    })

    it('hides it for a complete tournament (D-130)', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve(pair(), { completed: true })

      open()

      await screen.findByRole('heading', { name: new RegExp(morning) })
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
      })
    })

    it('hides it from a score keeper and from a signed-out visitor', async () => {
      setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
      serve(pair())
      const first = open()
      await screen.findByRole('heading', { name: new RegExp(morning) })
      expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
      first.unmount()

      setMockUser(null)
      open()
      await screen.findByRole('heading', { name: new RegExp(morning) })
      expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
    })
  })

  it('asks first, and Cancel sends nothing', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    const requests = serve(pair())
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    expect(within(dialog).getByText(morning)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(requests).toEqual([])
  })

  it('shows the refusal and only Close when bowlers are entered (D-186, D-188)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    const requests = serve(pair(), {
      info: () => HttpResponse.json({ deleteInfo: { entryCount: 12, scoreCount: 0 } }),
    })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)

    expect(await within(dialog).findByText(/12 bowlers are entered in/)).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: `Delete ${word}` })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(requests).toEqual([])
  })

  it('shows the refusal when scores are saved (D-186)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve(pair(), {
      info: () => HttpResponse.json({ deleteInfo: { entryCount: 0, scoreCount: 3 } }),
    })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)

    expect(await within(dialog).findByText(/Scores are saved for/)).toBeVisible()
  })

  it('still deletes when the counts cannot be read (D-188)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    const requests = serve(pair(), { info: () => new HttpResponse(null, { status: 503 }) })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    await user.click(await confirm(dialog))

    await waitFor(() => {
      expect(requests).toHaveLength(1)
    })
  })

  it(`deletes the ${word}, closes the dialog, and says "${Word} deleted" (SQD-14, D-188)`, async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    const sessions = pair()
    const firstId = sessions[0]?.id
    const requests = serve(sessions)
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    await user.click(await confirm(dialog))

    expect(await screen.findByText(`${Word} deleted`)).toBeVisible()
    expect(requests).toEqual([firstId])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: new RegExp(morning) })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: new RegExp(evening) })).toBeVisible()
  })

  it('shows the empty list after the last one goes (D-186)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve([make({ date: '2026-10-24T09:00:00' })])
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    await user.click(await confirm(dialog))

    expect(await screen.findByText(`No ${kind} yet.`)).toBeVisible()
  })

  it('shows Deleting… while the request runs', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    serve(pair(), {
      remove: async () => {
        await held
        return new HttpResponse(null, { status: 204 })
      },
    })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    await user.click(await confirm(dialog))

    expect(await within(dialog).findByRole('button', { name: 'Deleting…' })).toBeDisabled()
    release()
    expect(await screen.findByText(`${Word} deleted`)).toBeVisible()
  })

  it('shows a refusal in an error toast that stays until dismissed, and keeps the card (D-186, D-188)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    const entries = `1 bowler is entered in this ${word}. Remove them from the ${word} first.`
    const scores = `Scores are saved for this ${word}, so it cannot be deleted.`
    serve(pair(), {
      remove: () =>
        HttpResponse.json({ message: entries, errors: { entries, scores } }, { status: 409 }),
    })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    await user.click(await confirm(dialog))

    const toast = await screen.findByRole('alert')
    expect(
      within(toast)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([entries, scores])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: new RegExp(morning) })).toBeVisible()
    expect(screen.queryByText(`${Word} deleted`)).not.toBeInTheDocument()
    await user.click(within(toast).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears an old refusal when the button is pressed again', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve(pair(), {
      remove: () =>
        HttpResponse.json({ message: 'No', errors: { entries: 'No' } }, { status: 409 }),
    })
    const user = userEvent.setup()
    open()
    const dialog = await openDialog(user)
    await user.click(await confirm(dialog))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: `Delete ${word} ${morning}` }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the dialog open and says why when the request fails another way', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve(pair(), { remove: () => new HttpResponse(null, { status: 500 }) })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    await user.click(await confirm(dialog))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      `Failed to delete the ${word} (500)`,
    )
    expect(screen.getByRole('dialog', { name: `Delete this ${word}?` })).toBeVisible()
  })

  it('does not show the toast on an ordinary visit', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve(pair())

    open()

    await screen.findByRole('heading', { name: new RegExp(morning) })
    expect(screen.queryByText(`${Word} deleted`)).not.toBeInTheDocument()
  })

  it('forgets an old failure when the dialog closes', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve(pair(), { remove: () => new HttpResponse(null, { status: 500 }) })
    const user = userEvent.setup()
    open()
    const first = await openDialog(user)
    await user.click(await confirm(first))
    await within(first).findByRole('alert')
    await user.click(within(first).getByRole('button', { name: 'Cancel' }))

    const second = await openDialog(user)

    await confirm(second)
    expect(within(second).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears a failure when the director tries again', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    serve(pair(), {
      remove: async () => {
        calls += 1
        if (calls === 1) return new HttpResponse(null, { status: 500 })
        await held
        return new HttpResponse(null, { status: 204 })
      },
    })
    const user = userEvent.setup()
    open()
    const dialog = await openDialog(user)
    await user.click(await confirm(dialog))
    await within(dialog).findByRole('alert')

    await user.click(within(dialog).getByRole('button', { name: `Delete ${word}` }))

    await within(dialog).findByRole('button', { name: 'Deleting…' })
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    release()
    await screen.findByText(`${Word} deleted`)
  })

  it('ignores a reply that lands after the dialog was closed', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    serve(pair(), {
      remove: async () => {
        await held
        return HttpResponse.json({ message: 'No', errors: { entries: 'No' } }, { status: 409 })
      },
    })
    const user = userEvent.setup()
    open()
    const first = await openDialog(user)
    await user.click(await confirm(first))
    await within(first).findByRole('button', { name: 'Deleting…' })
    // Escape closes a native dialog; the Cancel button is off while the request runs.
    act(() => {
      ;(first as HTMLDialogElement).close()
    })
    const second = await openDialog(user)

    release()
    await confirm(second)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
