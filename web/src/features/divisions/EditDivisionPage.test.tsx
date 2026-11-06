import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createDivision,
  createSettings,
  createSignedInUser,
  createTournament,
} from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'
import type { Division, DivisionChanges, DivisionEditInfo } from './types'

const tournament = createTournament({ name: 'Spring Open' })
const open = createDivision({
  number: 1,
  name: 'Open',
  gender: null,
  handicapPercentage: 90,
  handicapBase: 220,
  maximumHandicapPerGame: 40,
})
const women = createDivision({ number: 2, name: 'Women', gender: 'Female' })
const url = `/tournaments/${tournament.id}/divisions/${open.id}/edit`
const listUrl = `/tournaments/${tournament.id}/divisions`

type Sent = DivisionChanges & { confirmWarnings?: boolean }

/** The reads the page needs, and a PATCH that records what it is given. */
function serve(
  options: {
    divisions?: Division[]
    completed?: boolean
    info?: DivisionEditInfo
    patch?: (sent: Sent) => Response | Promise<Response>
  } = {},
) {
  const sent: Sent[] = []
  const divisions = options.divisions ?? [open, women]
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/settings', () =>
      HttpResponse.json({ settings: createSettings({ completed: options.completed === true }) }),
    ),
    http.get('/v1/tournaments/:id/divisions', () => HttpResponse.json({ divisions })),
    http.get('/v1/tournaments/:id/divisions/:divisionId/edit-info', () =>
      HttpResponse.json({
        editInfo: options.info ?? { registrationCount: 0, hasScores: false },
      }),
    ),
    http.patch('/v1/tournaments/:id/divisions/:divisionId', async ({ request }) => {
      const body = (await request.json()) as Sent
      sent.push(body)
      if (options.patch) return options.patch(body)
      return HttpResponse.json({ division: { ...open, ...body } })
    }),
  )
  return sent
}

const signIn = (role: 'director' | 'scoreKeeper' = 'director') => {
  setMockUser(createSignedInUser({ roles: [role] }))
}
const save = () => screen.getByRole('button', { name: /Save changes|Saving/ })
const openForm = async () => {
  renderApp(url)
  await screen.findByRole('heading', { name: 'Edit division', level: 1 })
  await screen.findByLabelText('Name (required)')
}

describe('EditDivisionPage', () => {
  it('shows the form filled with the stored values and the number as fixed text (DIV-12, D-146)', async () => {
    signIn()
    serve()

    await openForm()

    expect(screen.getByLabelText('Name (required)')).toHaveValue('Open')
    expect(screen.getByLabelText('Gender')).toHaveValue('')
    expect(screen.getByLabelText('Handicap percent')).toHaveValue('90')
    expect(screen.getByLabelText('Handicap base')).toHaveValue('220')
    expect(screen.getByLabelText('Maximum handicap per game')).toHaveValue('40')
    expect(screen.getByLabelText('Minimum age')).toHaveValue('')
    expect(screen.getByText('Number:')).toBeVisible()
    expect(screen.getByText('The number cannot change.')).toBeVisible()
    expect(screen.queryByRole('textbox', { name: /Number/ })).not.toBeInTheDocument()
    expect(document.title).toBe('Edit division · Spring Open · Tournament Director')
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', listUrl)
  })

  it('shows a female division as Female (DIV-12)', async () => {
    signIn()
    serve()

    renderApp(`/tournaments/${tournament.id}/divisions/${women.id}/edit`)

    await waitFor(() => {
      expect(screen.getByLabelText('Gender')).toHaveValue('Female')
    })
  })

  describe('the notes before the director types (D-12, D-147, D-148)', () => {
    it('shows none when nobody is registered and no scores are saved', async () => {
      signIn()
      serve()

      await openForm()

      expect(screen.queryByText(/Asks you to confirm/)).not.toBeInTheDocument()
    })

    it('says registered bowlers make a change to gender, ages, and averages ask to confirm', async () => {
      signIn()
      serve({ info: { registrationCount: 12, hasScores: false } })

      await openForm()

      const note =
        '12 bowlers are registered in this division. The change is not retroactive; review them by hand.'
      for (const label of [
        'Gender',
        'Minimum age',
        'Maximum age',
        'Minimum average',
        'Maximum average',
      ]) {
        expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
          expect.stringContaining(note),
        )
      }
      expect(screen.getByLabelText('Name (required)')).not.toHaveAccessibleDescription(
        expect.stringContaining('Asks you to confirm'),
      )
      expect(screen.getByLabelText('Handicap base')).not.toHaveAccessibleDescription(
        expect.stringContaining('Asks you to confirm'),
      )
    })

    it('says saved scores make a handicap change ask to confirm', async () => {
      signIn()
      serve({ info: { registrationCount: 0, hasScores: true } })

      await openForm()

      for (const label of ['Handicap percent', 'Handicap base', 'Maximum handicap per game']) {
        expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
          expect.stringContaining('Posted results change at once.'),
        )
      }
      expect(screen.getByLabelText('Minimum age')).not.toHaveAccessibleDescription(
        expect.stringContaining('Asks you to confirm'),
      )
    })
  })

  describe('saving', () => {
    it('sends only the changed fields, goes to the list, and shows the toast (DIV-12)', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await user.clear(screen.getByLabelText('Name (required)'))
      await user.type(screen.getByLabelText('Name (required)'), '  Main ')
      await user.selectOptions(screen.getByLabelText('Gender'), 'Male')
      await user.click(save())

      expect(await screen.findByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
      expect(sent).toEqual([{ name: 'Main', gender: 'Male' }])
      expect(await screen.findByText('Division saved')).toBeVisible()
    })

    it('sends a cleared box as null (D-147)', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await user.clear(screen.getByLabelText('Handicap percent'))
      await user.clear(screen.getByLabelText('Handicap base'))
      await user.clear(screen.getByLabelText('Maximum handicap per game'))
      await user.click(save())

      await waitFor(() => {
        expect(sent).toEqual([
          { handicapPercentage: null, handicapBase: null, maximumHandicapPerGame: null },
        ])
      })
    })

    it('sends nothing but an empty body when nothing changed, and still goes back (DIV-12)', async () => {
      signIn()
      const sent = serve()
      const user = userEvent.setup()
      await openForm()

      await user.click(save())

      expect(await screen.findByText('Division saved')).toBeVisible()
      expect(sent).toEqual([{}])
    })

    it('checks only what the director changed: a stored odd pair never blocks a name fix (DIV-05, D-147)', async () => {
      signIn()
      const odd = createDivision({ ...open, minimumAge: 60, maximumAge: 40 })
      const sent = serve({ divisions: [odd, women] })
      const user = userEvent.setup()
      renderApp(`/tournaments/${tournament.id}/divisions/${odd.id}/edit`)
      await screen.findByLabelText('Name (required)')

      await user.type(screen.getByLabelText('Name (required)'), '!')
      await user.click(save())

      await waitFor(() => {
        expect(sent).toEqual([{ name: 'Open!' }])
      })
    })

    it('shows a message and sends nothing when a changed pair breaks the rule (DIV-05)', async () => {
      signIn()
      const aged = createDivision({ ...open, minimumAge: 40, maximumAge: 60 })
      const sent = serve({ divisions: [aged] })
      const user = userEvent.setup()
      renderApp(`/tournaments/${tournament.id}/divisions/${aged.id}/edit`)
      await screen.findByLabelText('Name (required)')

      await user.clear(screen.getByLabelText('Maximum age'))
      await user.type(screen.getByLabelText('Maximum age'), '30')
      await user.click(save())

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Fix 1 field to save.')
      expect(
        within(alert).getByText('Minimum age must be less than or equal to maximum age'),
      ).toBeVisible()
      expect(sent).toEqual([])
    })

    it('shows a name another division uses under the name (DIV-15)', async () => {
      signIn()
      const message = 'A division with this name already exists in this tournament'
      serve({
        patch: () => HttpResponse.json({ message, errors: { name: message } }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()

      await user.clear(screen.getByLabelText('Name (required)'))
      await user.type(screen.getByLabelText('Name (required)'), 'women')
      await user.click(save())

      expect(await screen.findByText(message, { selector: 'p' })).toBeVisible()
      expect(screen.getByLabelText('Name (required)')).toHaveAccessibleDescription(
        expect.stringContaining(message),
      )
    })

    it('shows an outage as an error toast that stays, and keeps the typing', async () => {
      signIn()
      serve({ patch: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()

      await user.type(screen.getByLabelText('Name (required)'), '!')
      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Failed to save the division (503)',
      )
      expect(screen.getByLabelText('Name (required)')).toHaveValue('Open!')
    })

    it('lets the director dismiss the error toast', async () => {
      signIn()
      serve({ patch: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()
      await user.type(screen.getByLabelText('Name (required)'), '!')
      await user.click(save())
      await screen.findByRole('alert')

      await user.click(screen.getByRole('button', { name: 'Dismiss' }))

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('drops the old toast as soon as the director presses Save again, even when a check fails', async () => {
      signIn()
      serve({ patch: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()
      await user.type(screen.getByLabelText('Name (required)'), '!')
      await user.click(save())
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Failed to save the division (503)',
      )

      await user.clear(screen.getByLabelText('Name (required)'))
      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent('Fix 1 field to save.')
      expect(screen.queryByText('Failed to save the division (503)')).not.toBeInTheDocument()
    })

    it('shows a refusal with no field messages as a toast, not an empty form summary', async () => {
      signIn()
      serve({
        patch: () => HttpResponse.json({ message: 'Refused for a reason.' }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()
      await user.type(screen.getByLabelText('Name (required)'), '!')

      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent('Refused for a reason.')
      expect(screen.queryByText(/Fix \d+ field/)).not.toBeInTheDocument()
    })

    it('shows the complete-tournament refusal as a toast, not under a box (D-149)', async () => {
      signIn()
      const reason = 'This tournament is complete and cannot be changed'
      serve({
        patch: () =>
          HttpResponse.json({ message: reason, errors: { tournament: reason } }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()

      await user.type(screen.getByLabelText('Name (required)'), '!')
      await user.click(save())

      expect(await screen.findByRole('alert')).toHaveTextContent(reason)
      expect(screen.queryByText('Fix 1 field to save.')).not.toBeInTheDocument()
    })
  })

  describe('the confirm dialog (D-147, D-129)', () => {
    const warning = {
      message: 'Confirm these changes to save them.',
      warnings: [
        {
          field: 'handicapPercentage',
          message: 'Scores are saved for bowlers in this division. Posted results change at once.',
        },
        {
          field: 'minimumAge',
          message:
            '12 bowlers are registered in this division. The change is not retroactive; review them by hand.',
        },
      ],
    }

    const askFirst = (sent: Sent) =>
      sent.confirmWarnings === true
        ? HttpResponse.json({ division: open })
        : HttpResponse.json(warning, { status: 409 })

    async function change() {
      const user = userEvent.setup()
      await openForm()
      await user.clear(screen.getByLabelText('Handicap percent'))
      await user.type(screen.getByLabelText('Handicap percent'), '85')
      await user.type(screen.getByLabelText('Minimum age'), '18')
      await user.click(save())
      return user
    }

    it('lists each warning with the change behind it (D-147)', async () => {
      signIn()
      serve({ patch: askFirst })

      await change()

      const dialog = await screen.findByRole('dialog', { name: 'Save these changes?' })
      for (const item of warning.warnings) {
        expect(within(dialog).getByText(item.message)).toBeVisible()
      }
      expect(within(dialog).getByText('Handicap percent: 90% → 85%')).toBeVisible()
      expect(within(dialog).getByText('Minimum age: not set → 18')).toBeVisible()
    })

    it('Go back closes it, keeps the typing, and sends nothing more', async () => {
      signIn()
      const sent = serve({ patch: askFirst })
      const user = await change()
      await screen.findByRole('dialog')

      await user.click(screen.getByRole('button', { name: 'Go back' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Handicap percent')).toHaveValue('85')
      expect(sent).toHaveLength(1)
    })

    it('Save anyway sends the same changes with confirmWarnings (D-129)', async () => {
      signIn()
      const sent = serve({ patch: askFirst })
      const user = await change()
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))

      expect(await screen.findByText('Division saved')).toBeVisible()
      expect(sent).toEqual([
        { handicapPercentage: 85, minimumAge: 18 },
        { handicapPercentage: 85, minimumAge: 18, confirmWarnings: true },
      ])
    })

    it('shows a refusal that comes after the confirm on the form (D-129)', async () => {
      signIn()
      const message = 'A division with this name already exists in this tournament'
      serve({
        patch: (sent) =>
          sent.confirmWarnings === true
            ? HttpResponse.json({ message, errors: { name: message } }, { status: 409 })
            : HttpResponse.json(warning, { status: 409 }),
      })
      const user = await change()
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      expect(await screen.findByText(message, { selector: 'p' })).toBeVisible()
    })

    it('says why inside the dialog when the confirmed save fails another way', async () => {
      signIn()
      serve({
        patch: (sent) =>
          sent.confirmWarnings === true
            ? new HttpResponse(null, { status: 503 })
            : HttpResponse.json(warning, { status: 409 }),
      })
      const user = await change()
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Failed to save the division (503)',
      )
    })
  })

  it('starts the form from fresh data, not from what the list left in the cache (D-147)', async () => {
    signIn()
    let name = 'Open'
    serve()
    server.use(
      http.get('/v1/tournaments/:id/divisions', () =>
        HttpResponse.json({ divisions: [{ ...open, name }, women] }),
      ),
    )
    const user = userEvent.setup()
    renderApp(listUrl)
    await user.click(await screen.findByRole('link', { name: 'Edit Open' }))
    await screen.findByLabelText('Name (required)')
    // Back to the list, then the stored name changes elsewhere before the next visit.
    await user.click(screen.getByRole('link', { name: 'Cancel' }))
    await screen.findByRole('link', { name: 'Edit Open' })
    name = 'Main'

    await user.click(screen.getByRole('link', { name: 'Edit Open' }))

    expect(await screen.findByLabelText('Name (required)')).toHaveValue('Main')
  })

  describe('what else the page can show', () => {
    it('shows a notice in place of the form for a complete tournament (D-149)', async () => {
      signIn()
      serve({ completed: true })

      renderApp(url)

      expect(await screen.findByText('This tournament is complete')).toBeVisible()
      expect(screen.queryByLabelText('Name (required)')).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to divisions' })).toHaveAttribute(
        'href',
        listUrl,
      )
    })

    it('says "Division not found" for a division the tournament does not have (DIV-03)', async () => {
      signIn()
      serve({ divisions: [women] })

      renderApp(url)

      expect(await screen.findByText('Division not found')).toBeVisible()
      expect(screen.queryByLabelText('Name (required)')).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to divisions' })).toHaveAttribute(
        'href',
        listUrl,
      )
    })

    it('shows an error with Try again when the edit-info read fails, then the form', async () => {
      signIn()
      serve()
      let fail = true
      server.use(
        http.get('/v1/tournaments/:id/divisions/:divisionId/edit-info', () =>
          fail
            ? new HttpResponse(null, { status: 500 })
            : HttpResponse.json({ editInfo: { registrationCount: 0, hasScores: false } }),
        ),
      )
      const user = userEvent.setup()
      renderApp(url)

      // The built-in retry waits about a second before the error shows.
      expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toBeVisible()
      fail = false
      await user.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByLabelText('Name (required)')).toBeVisible()
    })

    it('shows an error with Try again when the list fails', async () => {
      signIn()
      serve()
      let fail = true
      server.use(
        http.get('/v1/tournaments/:id/divisions', () =>
          fail
            ? new HttpResponse(null, { status: 500 })
            : HttpResponse.json({ divisions: [open, women] }),
        ),
      )
      const user = userEvent.setup()
      renderApp(url)

      expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toBeVisible()
      fail = false
      await user.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByLabelText('Name (required)')).toBeVisible()
    })
  })

  describe('who may see it (DIV-12, D-102, D-150)', () => {
    it('tells a score keeper they lack permission, with no form', async () => {
      signIn('scoreKeeper')
      serve()

      renderApp(url)

      expect(await screen.findByText(/You do not have permission/)).toBeVisible()
      expect(screen.queryByLabelText('Name (required)')).not.toBeInTheDocument()
    })

    it('sends a signed-out visitor to sign in', async () => {
      serve()

      renderApp(url)

      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible()
    })
  })
})
