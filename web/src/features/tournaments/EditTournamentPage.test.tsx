import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSettings, createSignedInUser, createTournament } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'
import type { EditInfo, TournamentSettingsView } from './types'

const tournament = createTournament({
  name: 'Spring Open',
  startDate: '2027-03-12',
  endDate: '2027-03-14',
  bowlingCenter: 'Bowl-O-Rama',
  entryFee: 60,
})
const quiet: EditInfo = { registrationCount: 0, hasScores: false, hasSweeperScores: false }
const path = `/v1/tournaments/${tournament.id}`

function signInAs(role: 'director' | 'scoreKeeper' = 'director') {
  setMockUser(createSignedInUser({ roles: [role] }))
}

/** The tournament, its settings, and what depends on them, as the API would send them. */
function serve(
  options: {
    settings?: Partial<TournamentSettingsView>
    info?: Partial<EditInfo>
    patch?: Parameters<typeof http.patch>[1]
  } = {},
) {
  server.use(
    http.get(path, () => HttpResponse.json({ tournament })),
    http.get(`${path}/settings`, () =>
      HttpResponse.json({ settings: createSettings({ games: 5, ...options.settings }) }),
    ),
    http.get(`${path}/edit-info`, () =>
      HttpResponse.json({ editInfo: { ...quiet, ...options.info } }),
    ),
    http.patch(path, options.patch ?? (() => HttpResponse.json({ tournament }))),
  )
}

const label = (name: string) => screen.getByLabelText(`${name} (required)`)
const save = () => screen.getByRole('button', { name: /Save changes|Saving/ })

async function openForm() {
  renderApp(`/tournaments/${tournament.id}/edit`)
  await screen.findByRole('button', { name: 'Save changes' })
}

/** Run the app until a PATCH arrives and keep the bodies it was sent. */
function recordPatches(respond: (body: Record<string, unknown>, call: number) => Response) {
  const bodies: Record<string, unknown>[] = []
  const handler: Parameters<typeof http.patch>[1] = async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    bodies.push(body)
    return respond(body, bodies.length) as never
  }
  return { bodies, handler }
}

const warnings = (...items: [string, string][]) =>
  HttpResponse.json(
    {
      message: 'Confirm these changes to save them.',
      warnings: items.map(([field, message]) => ({ field, message })),
    },
    { status: 409 },
  )

describe('EditTournamentPage (TRN-29)', () => {
  describe('the form', () => {
    it('opens with the stored values and the right title and links', async () => {
      signInAs()
      serve()

      await openForm()

      expect(screen.getByRole('heading', { name: 'Edit tournament', level: 1 })).toBeVisible()
      expect(document.title).toBe('Edit Spring Open · Tournament Director')
      expect(label('Name')).toHaveValue('Spring Open')
      expect(label('Start date')).toHaveValue('03/12/2027')
      expect(label('End date')).toHaveValue('03/14/2027')
      expect(label('Bowling center')).toHaveValue('Bowl-O-Rama')
      expect(label('Entry fee in dollars')).toHaveValue('60')
      expect(label('Games per squad')).toHaveValue('5')
      expect(label('Finals ratio')).toHaveValue('8')
      expect(label('Cash ratio')).toHaveValue('5')
      expect(label('Super sweeper cash ratio')).toHaveValue('4')
      expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
        'href',
        `/tournaments/${tournament.id}`,
      )
      // The usual hint stays when the stored ratio is a real one, and a field with no note has no description.
      expect(label('Super sweeper cash ratio')).toHaveAccessibleDescription(
        '1 in N super sweeper bowlers cash. At least 1.',
      )
      expect(label('Name')).not.toHaveAttribute('aria-describedby')
    })

    it('has nothing locked and nothing to confirm when nothing depends on it (D-128)', async () => {
      signInAs()
      serve()

      await openForm()

      expect(screen.queryByText(/Locked:/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Asks you to confirm:/)).not.toBeInTheDocument()
      expect(label('Games per squad')).not.toHaveAttribute('readonly')
    })

    it('says up front which fields are locked and which ask to confirm (D-128, D-129)', async () => {
      signInAs()
      serve({ info: { registrationCount: 38, hasScores: true } })

      await openForm()

      expect(label('Games per squad')).toHaveAttribute('readonly')
      expect(label('Games per squad')).toHaveAccessibleDescription(
        expect.stringContaining('Locked: Scores are saved, so the number of games cannot change.'),
      )
      expect(label('Start date')).toHaveAttribute('readonly')
      expect(label('Start date')).toHaveAccessibleDescription(
        expect.stringContaining('Locked: Scores are saved, so the start date cannot change.'),
      )
      expect(label('Entry fee in dollars')).not.toHaveAttribute('readonly')
      expect(label('Entry fee in dollars')).toHaveAccessibleDescription(
        expect.stringContaining(
          'Asks you to confirm: 38 bowlers are registered. They keep what they paid.',
        ),
      )
      expect(label('Cash ratio')).toHaveAccessibleDescription(
        expect.stringContaining('Asks you to confirm: Scores are saved.'),
      )
    })

    it('shows a stored super sweeper ratio of 0 as empty with a hint (D-17)', async () => {
      signInAs()
      serve({ settings: { superSweeperCashRatio: 0 } })

      await openForm()

      expect(label('Super sweeper cash ratio')).toHaveValue('')
      expect(label('Super sweeper cash ratio')).toHaveAccessibleDescription(
        expect.stringContaining('Stored as 0 (not set)'),
      )
    })
  })

  describe('saving', () => {
    it('sends only the fields that changed and returns to the overview with a toast', async () => {
      signInAs()
      const { bodies, handler } = recordPatches(() => HttpResponse.json({ tournament }) as Response)
      serve({ patch: handler })
      const user = userEvent.setup()
      await openForm()

      await user.clear(label('Name'))
      await user.type(label('Name'), 'Spring Classic')
      await user.clear(label('Cash ratio'))
      await user.type(label('Cash ratio'), '4.5')
      await user.click(save())

      expect(await screen.findByText('Tournament saved')).toBeVisible()
      expect(bodies).toEqual([{ name: 'Spring Classic', cashRatio: 4.5 }])
      expect(screen.getByRole('heading', { name: 'Spring Open', level: 1 })).toBeVisible()
    })

    it('lets a stored super sweeper ratio of 0 stay while the name changes (D-17, D-127)', async () => {
      signInAs()
      const { bodies, handler } = recordPatches(() => HttpResponse.json({ tournament }) as Response)
      serve({ settings: { superSweeperCashRatio: 0 }, patch: handler })
      const user = userEvent.setup()
      await openForm()

      await user.clear(label('Name'))
      await user.type(label('Name'), 'Renamed')
      await user.click(save())

      await screen.findByText('Tournament saved')
      expect(bodies).toEqual([{ name: 'Renamed' }])
    })

    it('checks a super sweeper ratio the director types over a stored 0 (D-13)', async () => {
      signInAs()
      const { bodies, handler } = recordPatches(() => HttpResponse.json({ tournament }) as Response)
      serve({ settings: { superSweeperCashRatio: 0 }, patch: handler })
      const user = userEvent.setup()
      await openForm()

      await user.type(label('Super sweeper cash ratio'), '0')
      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Super sweeper cash ratio must be at least 1',
      )
      expect(bodies).toEqual([])
    })

    it('sends an empty change when nothing was edited (TRN-24)', async () => {
      signInAs()
      const { bodies, handler } = recordPatches(() => HttpResponse.json({ tournament }) as Response)
      serve({ patch: handler })
      const user = userEvent.setup()
      await openForm()

      await user.click(save())

      await screen.findByText('Tournament saved')
      expect(bodies).toEqual([{}])
    })

    it('lists the problems, focuses the first, and sends nothing (TRN-01 to TRN-07)', async () => {
      signInAs()
      const { bodies, handler } = recordPatches(() => HttpResponse.json({ tournament }) as Response)
      serve({ patch: handler })
      const user = userEvent.setup()
      await openForm()

      await user.clear(label('Name'))
      await user.clear(label('Entry fee in dollars'))
      await user.type(label('Entry fee in dollars'), '0')
      await user.click(save())

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Fix 2 fields to save.')
      expect(alert).toHaveTextContent('Name is required')
      expect(alert).toHaveTextContent('Entry fee must be greater than $0')
      expect(label('Name')).toHaveFocus()
      expect(bodies).toEqual([])
    })

    it('says nothing about an old start date the director did not touch', async () => {
      signInAs()
      serve()
      const user = userEvent.setup()
      await openForm()

      await user.click(label('Start date'))
      await user.tab()

      expect(label('Start date')).toBeValid()
    })

    it('shows the API’s refusal under the field and in the summary (TRN-25)', async () => {
      signInAs()
      serve({
        patch: () =>
          HttpResponse.json(
            {
              message: 'Sunday 9:00 AM squad is on 2027-03-14, after this end date.',
              errors: { endDate: 'Sunday 9:00 AM squad is on 2027-03-14, after this end date.' },
            },
            { status: 409 },
          ),
      })
      const user = userEvent.setup()
      await openForm()
      await user.clear(label('End date'))
      await user.type(label('End date'), '2027-03-13')

      await user.click(save())

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Fix 1 field to save.')
      expect(label('End date')).toHaveFocus()
      expect(label('End date')).toHaveAccessibleDescription(
        expect.stringContaining('Sunday 9:00 AM squad is on 2027-03-14'),
      )
    })

    it('shows a duplicate name under the name field (TRN-27)', async () => {
      signInAs()
      const message = 'A tournament with this name and start date already exists'
      serve({
        patch: () => HttpResponse.json({ message, errors: { name: message } }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()
      await user.clear(label('Name'))
      await user.type(label('Name'), 'Fall Classic')

      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(label('Name')).toHaveAccessibleDescription(message)
    })

    it('keeps an error toast until dismissed when the save fails some other way', async () => {
      signInAs()
      serve({ patch: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()
      await user.clear(label('Name'))
      await user.type(label('Name'), 'Renamed')

      await user.click(save())

      const toast = await screen.findByRole('alert')
      expect(toast).toHaveTextContent('Failed to save the tournament (503)')
      expect(label('Name')).toHaveValue('Renamed')
      await user.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows the message as a toast when the API refuses without naming a field', async () => {
      signInAs()
      serve({
        patch: () =>
          HttpResponse.json({ message: 'The change was not accepted.' }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()
      await user.clear(label('Name'))
      await user.type(label('Name'), 'Renamed')

      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent('The change was not accepted.')
      expect(screen.queryByText(/Fix \d+ field/)).not.toBeInTheDocument()
    })

    it('removes an old toast when the director saves again', async () => {
      signInAs()
      serve({ patch: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()
      await user.clear(label('Name'))
      await user.type(label('Name'), 'Renamed')
      await user.click(save())
      await screen.findByText('Failed to save the tournament (503)')

      await user.clear(label('Name'))
      await user.click(save())

      expect(screen.queryByText('Failed to save the tournament (503)')).not.toBeInTheDocument()
    })

    it('disables Save and says "Saving…" while the request runs', async () => {
      signInAs()
      let release: () => void = () => undefined
      serve({
        patch: async () => {
          await new Promise<void>((resolve) => {
            release = resolve
          })
          return HttpResponse.json({ tournament })
        },
      })
      const user = userEvent.setup()
      await openForm()
      await user.clear(label('Name'))
      await user.type(label('Name'), 'Renamed')

      await user.click(save())

      expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
      release()
      await screen.findByText('Tournament saved')
    })
  })

  describe('the confirm dialog (TRN-30, D-129)', () => {
    const feeWarning: [string, string] = [
      'entryFee',
      '38 bowlers are registered. They keep what they paid. New entries pay the new fee.',
    ]

    async function changeFee(user: ReturnType<typeof userEvent.setup>) {
      await user.clear(label('Entry fee in dollars'))
      await user.type(label('Entry fee in dollars'), '75')
      await user.click(save())
    }

    it('opens with each warning and the change that caused it, and saves nothing yet', async () => {
      signInAs()
      const { bodies, handler } = recordPatches(() => warnings(feeWarning) as Response)
      serve({ info: { registrationCount: 38 }, patch: handler })
      const user = userEvent.setup()
      await openForm()

      await changeFee(user)

      const dialog = await screen.findByRole('dialog', { name: 'Save these changes?' })
      expect(within(dialog).getByText(feeWarning[1])).toBeVisible()
      expect(within(dialog).getByText('Entry fee: $60.00 → $75.00')).toBeVisible()
      expect(bodies).toEqual([{ entryFee: 75 }])
    })

    it('lists several warnings in the order the API sent them', async () => {
      signInAs()
      serve({
        patch: () =>
          warnings(feeWarning, ['finalsRatio', 'Scores are saved. Posted results change at once.']),
      })
      const user = userEvent.setup()
      await openForm()
      await user.clear(label('Finals ratio'))
      await user.type(label('Finals ratio'), '7')

      await changeFee(user)

      const dialog = await screen.findByRole('dialog')
      const items = within(dialog).getAllByRole('listitem')
      expect(items).toHaveLength(2)
      expect(items[0]).toHaveTextContent('Entry fee: $60.00 → $75.00')
      expect(items[1]).toHaveTextContent('Finals ratio: 8 → 7')
    })

    it('Go back closes it, keeps what was typed, and does not save', async () => {
      signInAs()
      const { bodies, handler } = recordPatches(() => warnings(feeWarning) as Response)
      serve({ patch: handler })
      const user = userEvent.setup()
      await openForm()
      await changeFee(user)
      await screen.findByRole('dialog')

      await user.click(screen.getByRole('button', { name: 'Go back' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(label('Entry fee in dollars')).toHaveValue('75')
      expect(bodies).toHaveLength(1)
    })

    it('opens again on the next save after Go back', async () => {
      signInAs()
      const { bodies, handler } = recordPatches(() => warnings(feeWarning) as Response)
      serve({ patch: handler })
      const user = userEvent.setup()
      await openForm()
      await changeFee(user)
      await screen.findByRole('dialog')
      await user.click(screen.getByRole('button', { name: 'Go back' }))

      await user.click(save())

      expect(await screen.findByRole('dialog', { name: 'Save these changes?' })).toBeVisible()
      expect(bodies).toHaveLength(2)
    })

    it('Save anyway sends the same changes with confirmWarnings and returns to the overview', async () => {
      signInAs()
      const { bodies, handler } = recordPatches((_body, call) =>
        call === 1
          ? (warnings(feeWarning) as Response)
          : (HttpResponse.json({ tournament }) as Response),
      )
      serve({ patch: handler })
      const user = userEvent.setup()
      await openForm()
      await changeFee(user)
      await screen.findByRole('dialog')

      await user.click(screen.getByRole('button', { name: 'Save anyway' }))

      expect(await screen.findByText('Tournament saved')).toBeVisible()
      expect(bodies).toEqual([{ entryFee: 75 }, { entryFee: 75, confirmWarnings: true }])
    })

    it('closes and shows the refusal on the form when the confirmed save is refused (TRN-25)', async () => {
      signInAs()
      const { handler } = recordPatches((_body, call) =>
        call === 1
          ? (warnings(feeWarning) as Response)
          : (HttpResponse.json(
              {
                message: 'This tournament is complete. Nothing can change.',
                errors: { entryFee: 'This tournament is complete. Nothing can change.' },
              },
              { status: 409 },
            ) as Response),
      )
      serve({ patch: handler })
      const user = userEvent.setup()
      await openForm()
      await changeFee(user)
      await screen.findByRole('dialog')

      await user.click(screen.getByRole('button', { name: 'Save anyway' }))

      expect(await screen.findByText('Fix 1 field to save.')).toBeVisible()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(label('Entry fee in dollars')).toHaveFocus()
    })

    it('stays open and says why when the confirmed save fails some other way', async () => {
      signInAs()
      const { handler } = recordPatches((_body, call) =>
        call === 1
          ? (warnings(feeWarning) as Response)
          : (new HttpResponse(null, { status: 503 }) as Response),
      )
      serve({ patch: handler })
      const user = userEvent.setup()
      await openForm()
      await changeFee(user)
      const dialog = await screen.findByRole('dialog')

      await user.click(screen.getByRole('button', { name: 'Save anyway' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Failed to save the tournament (503)',
      )
      expect(screen.getByRole('dialog')).toBeVisible()
      expect(screen.getByRole('button', { name: 'Save anyway' })).toBeEnabled()
    })

    it('disables both buttons while the confirmed save runs', async () => {
      signInAs()
      let release: () => void = () => undefined
      let calls = 0
      serve({
        patch: async () => {
          calls += 1
          if (calls === 1) return warnings(feeWarning)
          await new Promise<void>((resolve) => {
            release = resolve
          })
          return HttpResponse.json({ tournament })
        },
      })
      const user = userEvent.setup()
      await openForm()
      await changeFee(user)
      await screen.findByRole('dialog')

      await user.click(screen.getByRole('button', { name: 'Save anyway' }))

      const dialog = screen.getByRole('dialog')
      expect(await within(dialog).findByRole('button', { name: 'Saving…' })).toBeDisabled()
      expect(within(dialog).getByRole('button', { name: 'Go back' })).toBeDisabled()
      release()
      await screen.findByText('Tournament saved')
    })
  })

  describe('a complete tournament (D-130)', () => {
    it('is read-only, with a banner, no Save button, and a way back', async () => {
      signInAs()
      serve({ settings: { completed: true }, info: { registrationCount: 38, hasScores: true } })

      renderApp(`/tournaments/${tournament.id}/edit`)

      expect(await screen.findByText(/This tournament is complete and frozen/)).toBeVisible()
      expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
      for (const name of [
        'Name',
        'Start date',
        'End date',
        'Bowling center',
        'Entry fee in dollars',
        'Games per squad',
        'Finals ratio',
        'Cash ratio',
        'Super sweeper cash ratio',
      ]) {
        expect(label(name)).toHaveAttribute('readonly')
        // Only the reason: a frozen field has no use for "1 to 99."
        expect(label(name)).toHaveAccessibleDescription(
          'Locked: This tournament is complete. Nothing can change.',
        )
      }
      expect(screen.queryByText(/Asks you to confirm:/)).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to tournament' })).toHaveAttribute(
        'href',
        `/tournaments/${tournament.id}`,
      )
    })
  })

  describe('loading what the form needs', () => {
    it('shows loading, then the form', async () => {
      signInAs()
      serve()
      server.use(
        http.get(`${path}/edit-info`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 30))
          return HttpResponse.json({ editInfo: quiet })
        }),
      )

      renderApp(`/tournaments/${tournament.id}/edit`)

      expect(await screen.findByText('Loading the form…')).toBeVisible()
      expect(document.title).toBe('Edit Spring Open · Tournament Director')
      expect(await screen.findByRole('button', { name: 'Save changes' })).toBeVisible()
    })

    it('shows an error with Try again, and recovers', async () => {
      signInAs()
      serve()
      let fail = true
      server.use(
        http.get(`${path}/edit-info`, () =>
          fail ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ editInfo: quiet }),
        ),
      )
      const user = userEvent.setup()
      renderApp(`/tournaments/${tournament.id}/edit`)
      const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
      expect(alert).toHaveTextContent('Failed to load what depends on the settings (503)')
      expect(document.title).toBe('Edit Spring Open · Tournament Director')
      expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()

      fail = false
      await user.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByRole('button', { name: 'Save changes' })).toBeVisible()
    })

    it('shows an error when the settings fail to load', async () => {
      signInAs()
      serve()
      server.use(http.get(`${path}/settings`, () => new HttpResponse(null, { status: 500 })))

      renderApp(`/tournaments/${tournament.id}/edit`)

      expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
        'Failed to load the tournament format (500)',
      )
    })
  })

  describe('who may open it (TRN-29, D-102)', () => {
    it('sends a signed-out visitor to sign in', async () => {
      setMockUser(null)
      serve()

      renderApp(`/tournaments/${tournament.id}/edit`)

      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible()
    })

    it('tells a score keeper they have no access', async () => {
      signInAs('scoreKeeper')
      serve()

      renderApp(`/tournaments/${tournament.id}/edit`)

      expect(await screen.findByText('You do not have permission to view this page.')).toBeVisible()
      expect(screen.queryByLabelText(/Name/)).not.toBeInTheDocument()
    })

    describe('what the form starts from', () => {
      it('refetches the settings, so a stale cache from the overview does not fill the form', async () => {
        signInAs()
        serve({ settings: { games: 5 } })
        const user = userEvent.setup()
        renderApp(`/tournaments/${tournament.id}`)
        await user.click(await screen.findByRole('link', { name: 'Edit tournament' }))
        await screen.findByRole('button', { name: 'Save changes' })
        await user.click(screen.getByRole('link', { name: 'Cancel' }))
        serve({ settings: { games: 7 } })

        await user.click(await screen.findByRole('link', { name: 'Edit tournament' }))

        await screen.findByRole('button', { name: 'Save changes' })
        expect(label('Games per squad')).toHaveValue('7')
      })

      it('lists a warning for a field it does not know, without a change line', async () => {
        signInAs()
        const { handler } = recordPatches(
          () => warnings(['somethingNew', 'A new rule applies.']) as Response,
        )
        serve({ patch: handler })
        const user = userEvent.setup()
        await openForm()
        await user.clear(label('Entry fee in dollars'))
        await user.type(label('Entry fee in dollars'), '75')
        await user.click(save())

        const dialog = await screen.findByRole('dialog')

        expect(within(dialog).getByText('A new rule applies.')).toBeVisible()
        expect(within(dialog).getByRole('button', { name: 'Save anyway' })).toBeVisible()
      })
    })
  })
})

describe('EditTournamentPage leaving with changes', () => {
  it('lets an unchanged form go, and asks once a stored value changed', async () => {
    signInAs()
    serve()
    const user = userEvent.setup()
    await openForm()
    await user.type(label('Name'), 'X')
    await user.click(screen.getByRole('link', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stay on this page' }))

    await user.type(label('Name'), '{Backspace}')
    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).not.toBeInTheDocument()
  })

  it('goes to the overview after a save without asking', async () => {
    signInAs()
    serve()
    const user = userEvent.setup()
    await openForm()
    await user.type(label('Name'), ' Two')

    await user.click(save())

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).not.toBeInTheDocument()
  })
})
