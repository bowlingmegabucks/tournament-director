import { beforeEach, describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { setMockUser } from '../mocks/authHandlers'
import {
  createScorePage,
  createSettings,
  createSignedInUser,
  createSquad,
  createSweeper,
  createTournament,
} from '../mocks/data'
import { renderApp } from '../test/renderApp'

const tournament = createTournament({ name: 'Spring Open' })
const id = tournament.id
const date = 'Sat 10/24/2026 9:00 AM'

interface Session {
  id: string
  date: string
  complete: boolean
}

interface Kind {
  kind: 'squads' | 'sweepers'
  word: 'squad' | 'sweeper'
  make: (overrides: { date: string; complete?: boolean }) => Session
}

const kinds: Kind[] = [
  { kind: 'squads', word: 'squad', make: createSquad },
  { kind: 'sweepers', word: 'sweeper', make: createSweeper },
]

beforeEach(() => {
  setMockUser(createSignedInUser({ roles: ['director'] }))
})

describe.each(kinds)(
  'completing a $word (SQD-15, SQD-16, D-190 to D-195)',
  ({ kind, word, make }) => {
    const session = () => make({ date: '2026-10-24T09:00:00', complete: false })

    /** A page the complete can change: the POST flips the row, so the refetch shows it complete. */
    function serve(
      row: Session,
      options: {
        completed?: boolean
        info?: () => Response | Promise<Response>
        complete?: () => Response | Promise<Response | undefined> | undefined
      } = {},
    ) {
      const requests: string[] = []
      server.use(
        http.get(`/v1/tournaments/${id}`, () => HttpResponse.json({ tournament })),
        http.get(`/v1/tournaments/${id}/settings`, () =>
          HttpResponse.json({
            settings: createSettings({ completed: options.completed === true }),
          }),
        ),
        http.get(`/v1/tournaments/${id}/${kind}`, () => HttpResponse.json({ [kind]: [row] })),
        http.get(`/v1/tournaments/${id}/${kind}/:sessionId/scores`, () =>
          HttpResponse.json(
            createScorePage({
              session: {
                ...createScorePage().session,
                id: row.id,
                kind: word,
                complete: row.complete,
              },
            }),
          ),
        ),
        http.get(
          `/v1/tournaments/${id}/${kind}/:sessionId/complete-info`,
          options.info ??
            (() =>
              HttpResponse.json({
                completeInfo:
                  kind === 'squads'
                    ? { entryCount: 12, noScoreCount: 3, partialCount: 1, games: 3 }
                    : { entryCount: 9 },
              })),
        ),
        http.post(`/v1/tournaments/${id}/${kind}/:sessionId/complete`, async ({ params }) => {
          requests.push(String(params['sessionId']))
          const answer = await options.complete?.()
          if (answer) return answer
          row.complete = true
          return HttpResponse.json(
            kind === 'squads' ? { squad: row, noShowCount: 3 } : { sweeper: row },
          )
        }),
      )
      return requests
    }

    const open = (row: Session) => renderApp(`/tournaments/${id}/${kind}/${row.id}/scores`)

    const trigger = () => screen.findByRole('button', { name: `Complete ${word}` })
    const dialog = () => screen.findByRole('dialog', { name: `Complete this ${word}?` })

    describe('who sees Complete (D-193, D-195)', () => {
      it.each(['director', 'admin'] as const)(
        'gives a %s the button in the header',
        async (role) => {
          setMockUser(createSignedInUser({ roles: [role] }))
          const row = session()
          serve(row)

          open(row)

          expect(await trigger()).toBeVisible()
          expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Open')
        },
      )

      it('hides it on a complete session (SQD-18)', async () => {
        const row = make({ date: '2026-10-24T09:00:00', complete: true })
        serve(row)

        open(row)

        expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Complete')
        expect(screen.queryByRole('button', { name: /^Complete / })).not.toBeInTheDocument()
      })

      it('hides it for a complete tournament (D-130)', async () => {
        const row = session()
        serve(row, { completed: true })

        open(row)

        await screen.findByRole('heading', { level: 1 })
        await waitFor(() => {
          expect(screen.queryByRole('button', { name: /^Complete / })).not.toBeInTheDocument()
        })
      })

      it('hides it from a score keeper and from a signed-out visitor', async () => {
        const row = session()
        setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
        serve(row)
        const first = open(row)
        await screen.findByRole('heading', { level: 1 })
        expect(screen.queryByRole('button', { name: /^Complete / })).not.toBeInTheDocument()
        first.unmount()

        setMockUser(null)
        open(row)
        await screen.findByRole('heading', { level: 1 })
        expect(screen.queryByRole('button', { name: /^Complete / })).not.toBeInTheDocument()
      })
    })

    describe('the dialog (D-194)', () => {
      it('opens with the counts and sends nothing until Complete is pressed', async () => {
        const user = userEvent.setup()
        const row = session()
        const requests = serve(row)
        open(row)

        await user.click(await trigger())

        const opened = await dialog()
        expect(await within(opened).findByText(/bowlers are entered/)).toHaveTextContent(
          `${date}: ${kind === 'squads' ? '12' : '9'} bowlers are entered.`,
        )
        expect(requests).toEqual([])
      })

      it('closes on Cancel, completes nothing, and leaves the button', async () => {
        const user = userEvent.setup()
        const row = session()
        const requests = serve(row)
        open(row)
        await user.click(await trigger())

        await user.click(within(await dialog()).getByRole('button', { name: 'Cancel' }))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(await trigger()).toBeVisible()
        expect(requests).toEqual([])
      })

      it('keeps Complete off while the counts load', async () => {
        const user = userEvent.setup()
        const row = session()
        serve(row, {
          info: async () => {
            await delay(150)
            return HttpResponse.json({
              completeInfo: { entryCount: 1, noScoreCount: 0, partialCount: 0, games: 3 },
            })
          },
        })
        open(row)

        await user.click(await trigger())

        expect(
          await within(await dialog()).findByRole('button', { name: `Complete ${word}` }),
        ).toBeDisabled()
        await within(await dialog()).findByText(/1 bowler is entered/)
      })

      it('still lets the director complete when the counts could not be read', async () => {
        const user = userEvent.setup()
        const row = session()
        const requests = serve(row, { info: () => new HttpResponse(null, { status: 503 }) })
        open(row)
        await user.click(await trigger())

        const opened = await dialog()
        await user.click(await within(opened).findByRole('button', { name: `Complete ${word}` }))

        await waitFor(() => {
          expect(requests).toEqual([row.id])
        })
      })
    })

    describe('after Complete', () => {
      it('flips the status, drops the button, and says how many got zeros (SQD-15, D-195)', async () => {
        const user = userEvent.setup()
        const row = session()
        const requests = serve(row)
        open(row)
        await user.click(await trigger())

        await user.click(
          await within(await dialog()).findByRole('button', { name: `Complete ${word}` }),
        )

        expect(await screen.findByRole('status')).toHaveTextContent(
          kind === 'squads' ? 'Squad completed. 3 bowlers got zeros.' : 'Sweeper completed.',
        )
        await waitFor(() => {
          expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Complete')
        })
        expect(screen.queryByRole('button', { name: /^Complete / })).not.toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(requests).toEqual([row.id])
      })

      it('shows Completing… and locks the dialog while it saves', async () => {
        const user = userEvent.setup()
        const row = session()
        serve(row, {
          complete: async () => {
            await delay(150)
            return undefined
          },
        })
        open(row)
        await user.click(await trigger())

        await user.click(
          await within(await dialog()).findByRole('button', { name: `Complete ${word}` }),
        )

        const saving = await screen.findByRole('button', { name: 'Completing…' })
        expect(saving).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
        await screen.findByRole('status')
      })
    })

    describe('when it fails', () => {
      it('keeps the dialog open and shows the failure in it (503)', async () => {
        const user = userEvent.setup()
        const row = session()
        serve(row, { complete: () => new HttpResponse(null, { status: 503 }) })
        open(row)
        await user.click(await trigger())

        await user.click(
          await within(await dialog()).findByRole('button', { name: `Complete ${word}` }),
        )

        expect(await within(await dialog()).findByRole('alert')).toHaveTextContent(
          `Failed to complete the ${word} (503)`,
        )
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Open')
      })

      it('closes the dialog and keeps an error toast when the API refuses (SQD-18, D-192)', async () => {
        const user = userEvent.setup()
        const row = session()
        const reason = `This ${word} is already complete`
        serve(row, {
          complete: () =>
            HttpResponse.json({ message: reason, errors: { session: reason } }, { status: 409 }),
        })
        open(row)
        await user.click(await trigger())

        await user.click(
          await within(await dialog()).findByRole('button', { name: `Complete ${word}` }),
        )

        expect(await screen.findByRole('alert')).toHaveTextContent(reason)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        // The toast stays until dismissed.
        await user.click(screen.getByRole('button', { name: 'Dismiss' }))
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      })
      describe('the dialog over time', () => {
        const press = async (user: ReturnType<typeof userEvent.setup>) =>
          user.click(
            await within(await dialog()).findByRole('button', { name: `Complete ${word}` }),
          )

        it('closes the dialog after a complete even while the page still shows the session open', async () => {
          const user = userEvent.setup()
          const row = session()
          // A 200 that leaves the list alone: only the button itself can close the dialog.
          serve(row, {
            complete: () =>
              HttpResponse.json(
                kind === 'squads' ? { squad: row, noShowCount: 0 } : { sweeper: row },
              ),
          })
          open(row)
          await user.click(await trigger())

          await press(user)

          await screen.findByRole('status')
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })

        it('forgets an old failure when the dialog closes', async () => {
          const user = userEvent.setup()
          const row = session()
          serve(row, { complete: () => new HttpResponse(null, { status: 500 }) })
          open(row)
          await user.click(await trigger())
          const first = await dialog()
          await press(user)
          await within(first).findByRole('alert')
          await user.click(within(first).getByRole('button', { name: 'Cancel' }))

          await user.click(await trigger())

          expect(within(await dialog()).queryByRole('alert')).not.toBeInTheDocument()
        })

        it('clears a failure when the director tries again', async () => {
          const user = userEvent.setup()
          const row = session()
          let release: () => void = () => undefined
          const held = new Promise<void>((resolve) => {
            release = resolve
          })
          let calls = 0
          serve(row, {
            complete: async () => {
              calls += 1
              if (calls === 1) return new HttpResponse(null, { status: 500 })
              await held
              return undefined
            },
          })
          open(row)
          await user.click(await trigger())
          const opened = await dialog()
          await press(user)
          await within(opened).findByRole('alert')

          await user.click(within(opened).getByRole('button', { name: `Complete ${word}` }))

          await within(opened).findByRole('button', { name: 'Completing…' })
          expect(within(opened).queryByRole('alert')).not.toBeInTheDocument()
          release()
          await screen.findByRole('status')
        })

        it('ignores a reply that lands after the dialog was closed', async () => {
          const user = userEvent.setup()
          const row = session()
          let release: () => void = () => undefined
          const held = new Promise<void>((resolve) => {
            release = resolve
          })
          serve(row, {
            complete: async () => {
              await held
              return HttpResponse.json(
                { message: 'No', errors: { session: 'No' } },
                { status: 409 },
              )
            },
          })
          open(row)
          await user.click(await trigger())
          const first = await dialog()
          await press(user)
          await within(first).findByRole('button', { name: 'Completing…' })
          // Escape closes a native dialog; the Cancel button is off while the request runs.
          act(() => {
            ;(first as HTMLDialogElement).close()
          })
          await user.click(await trigger())
          await dialog()

          release()
          await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 30))
          })

          expect(screen.queryByRole('alert')).not.toBeInTheDocument()
          expect(screen.getByRole('dialog')).toBeInTheDocument()
        })
      })
    })
  },
)

describe('the toast words (D-190, D-195)', () => {
  const row = createSquad({ date: '2026-10-24T09:00:00', complete: false })

  async function completeWith(noShowCount: number) {
    const user = userEvent.setup()
    server.use(
      http.get(`/v1/tournaments/${id}`, () => HttpResponse.json({ tournament })),
      http.get(`/v1/tournaments/${id}/settings`, () =>
        HttpResponse.json({ settings: createSettings() }),
      ),
      http.get(`/v1/tournaments/${id}/squads`, () => HttpResponse.json({ squads: [row] })),
      http.get(`/v1/tournaments/${id}/squads/:sessionId/scores`, () =>
        HttpResponse.json(
          createScorePage({ session: { ...createScorePage().session, id: row.id } }),
        ),
      ),
      http.get(`/v1/tournaments/${id}/squads/:sessionId/complete-info`, () =>
        HttpResponse.json({
          completeInfo: { entryCount: 1, noScoreCount: 0, partialCount: 0, games: 3 },
        }),
      ),
      http.post(`/v1/tournaments/${id}/squads/:sessionId/complete`, () =>
        HttpResponse.json({ squad: row, noShowCount }),
      ),
    )
    renderApp(`/tournaments/${id}/squads/${row.id}/scores`)
    await user.click(await screen.findByRole('button', { name: 'Complete squad' }))
    await user.click(
      await within(await screen.findByRole('dialog')).findByRole('button', {
        name: 'Complete squad',
      }),
    )
    return screen.findByRole('status')
  }

  it('says no zeros when nobody was a no-show', async () => {
    const toast = await completeWith(0)

    expect(toast).toHaveTextContent('Squad completed.')
    expect(toast).not.toHaveTextContent('zeros')
  })

  it('says 1 bowler for one no-show', async () => {
    expect(await completeWith(1)).toHaveTextContent('Squad completed. 1 bowler got zeros.')
  })
})
