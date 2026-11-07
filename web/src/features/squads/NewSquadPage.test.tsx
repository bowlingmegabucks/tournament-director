import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSettings, createSignedInUser, createSquad, createTournament } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'
import type { NewSquad, Squad } from './types'

const tournament = createTournament({
  name: 'Spring Open',
  startDate: '2026-10-24',
  endDate: '2026-10-25',
  entryFee: 50,
})
const url = `/tournaments/${tournament.id}/squads/new`

interface Served {
  posted: NewSquad[]
}

/** The reads the page needs, and a POST that answers the way the API would. */
function serve(
  options: {
    squads?: Squad[]
    completed?: boolean
    post?: () => Response | Promise<Response>
  } = {},
): Served {
  const served: Served = { posted: [] }
  const squads = options.squads ?? [
    createSquad({ date: '2026-10-24T09:00:00', startingLane: 1, numberOfLanes: 24, maxPerPair: 4 }),
    createSquad({ date: '2026-10-24T13:00:00', startingLane: 5, numberOfLanes: 12, maxPerPair: 3 }),
  ]
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
    http.post('/v1/tournaments/:id/squads', async ({ request }) => {
      served.posted.push((await request.json()) as NewSquad)
      if (options.post) return options.post()
      return HttpResponse.json({ squad: createSquad() }, { status: 201 })
    }),
  )
  return served
}

const signIn = (role: 'director' | 'scoreKeeper' = 'director') => {
  setMockUser(createSignedInUser({ roles: [role] }))
}
const add = () => screen.getByRole('button', { name: /Add squad|Saving/ })
const date = () => screen.getByLabelText('Date and time (required)')
const openForm = async () => {
  renderApp(url)
  await screen.findByRole('heading', { name: 'New squad', level: 1 })
  // The form appears once the settings and the list have answered. A failed read retries once, so wait longer than the default second.
  await screen.findByLabelText('Date and time (required)', {}, { timeout: 3000 })
}
/** A date-time box takes a whole value at once. */
const pickDate = (value: string) => {
  fireEvent.change(date(), { target: { value } })
}

describe('NewSquadPage', () => {
  it('starts with the lanes and bowlers per pair of the latest squad and a blank date (D-172, D-169)', async () => {
    signIn()
    serve()

    await openForm()

    expect(date()).toHaveValue('')
    expect(screen.getByLabelText('Starting lane (required)')).toHaveValue('5')
    expect(screen.getByLabelText('Number of lanes (required)')).toHaveValue('12')
    expect(screen.getByLabelText('Bowlers per pair (required)')).toHaveValue('3')
    expect(screen.getByLabelText('Entry fee')).toHaveValue('')
    expect(screen.getByLabelText('Finals ratio')).toHaveValue('')
    expect(screen.getByLabelText('Cash ratio')).toHaveValue('')
    expect(document.title).toBe('New squad · Spring Open · Tournament Director')
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/squads`,
    )
  })

  it('limits the date box to the tournament days and says so (D-169, SQD-03)', async () => {
    signIn()
    serve()

    await openForm()

    expect(date()).toHaveAttribute('type', 'datetime-local')
    expect(date()).toHaveAttribute('min', '2026-10-24T00:00')
    expect(date()).toHaveAttribute('max', '2026-10-25T23:59')
    expect(date()).toHaveAccessibleDescription(
      'Within the tournament dates: Oct 24 to Oct 25, 2026.',
    )
  })

  it('shows the tournament values under the blank override boxes (D-170, TRN-12)', async () => {
    signIn()
    serve()

    await openForm()

    expect(screen.getByLabelText('Entry fee')).toHaveAccessibleDescription(
      '0 to 999.99. Tournament: $50.00.',
    )
    expect(screen.getByLabelText('Finals ratio')).toHaveAccessibleDescription(
      '1.1 to 99.9, one decimal. Tournament: 1 in 6.0.',
    )
    expect(screen.getByLabelText('Cash ratio')).toHaveAccessibleDescription(
      '1.1 to 99.9, one decimal. Tournament: 1 in 4.0.',
    )
    expect(screen.getByText("Leave a box blank to use the tournament's value.")).toBeVisible()
    expect(screen.getByRole('group', { name: 'Lanes' })).toBeVisible()
    expect(screen.getByRole('group', { name: 'Fee and ratios' })).toBeVisible()
  })

  it('starts blank for the first squad (D-172)', async () => {
    signIn()
    serve({ squads: [] })

    await openForm()

    expect(screen.getByLabelText('Starting lane (required)')).toHaveValue('')
    expect(screen.getByLabelText('Number of lanes (required)')).toHaveValue('')
    expect(screen.getByLabelText('Bowlers per pair (required)')).toHaveValue('')
  })

  it('starts blank when the list cannot be read, and still saves (D-172)', async () => {
    signIn()
    const served = serve()
    server.use(
      http.get('/v1/tournaments/:id/squads', () => new HttpResponse(null, { status: 500 })),
    )
    const user = userEvent.setup()
    await openForm()

    expect(screen.getByLabelText('Starting lane (required)')).toHaveValue('')
    pickDate('2026-10-24T09:00')
    await user.type(screen.getByLabelText('Starting lane (required)'), '1')
    await user.type(screen.getByLabelText('Number of lanes (required)'), '24')
    await user.type(screen.getByLabelText('Bowlers per pair (required)'), '4')
    await user.click(add())

    await waitFor(() => {
      expect(served.posted).toHaveLength(1)
    })
  })

  it('lists every missing field and focuses the first (SQD-03 to SQD-06)', async () => {
    signIn()
    const served = serve({ squads: [] })
    const user = userEvent.setup()
    await openForm()

    await user.click(add())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Fix 4 fields to save.')
    for (const message of [
      'Date and time is required',
      'Starting lane is required',
      'Number of lanes is required',
      'Max per pair is required',
    ]) {
      expect(within(alert).getByRole('link', { name: message })).toBeVisible()
    }
    expect(date()).toHaveFocus()
    expect(date()).toHaveAccessibleDescription(/Date and time is required/)
    expect(served.posted).toEqual([])
  })

  it('shows each rule under its box (SQD-02, SQD-04, SQD-05, SQD-06, SQD-08)', async () => {
    signIn()
    const served = serve({ squads: [] })
    const user = userEvent.setup()
    await openForm()

    pickDate('2026-10-24T09:00')
    await user.type(screen.getByLabelText('Starting lane (required)'), '2')
    await user.type(screen.getByLabelText('Number of lanes (required)'), '23')
    await user.type(screen.getByLabelText('Bowlers per pair (required)'), '6')
    await user.type(screen.getByLabelText('Entry fee'), '1000')
    await user.type(screen.getByLabelText('Finals ratio'), '6.25')
    await user.type(screen.getByLabelText('Cash ratio'), '1')
    await user.click(add())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Fix 6 fields to save.')
    for (const message of [
      'Starting lane must be odd',
      'Number of lanes must be even',
      'Max per pair must be between 2 and 5',
      'Entry fee must be between $0 and $999.99',
      'Use at most one decimal place',
      'Cash ratio must be greater than 1',
    ]) {
      expect(within(alert).getByText(message)).toBeVisible()
    }
    expect(screen.getByLabelText('Starting lane (required)')).toHaveFocus()
    expect(served.posted).toEqual([])
  })

  it('refuses a date outside the tournament before it sends (SQD-03)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await openForm()

    pickDate('2026-10-26T09:00')
    await user.click(add())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Squad date must be before tournament end',
    )
    expect(served.posted).toEqual([])
  })

  it('checks a box when the director leaves it, not before (SQD-06)', async () => {
    signIn()
    serve({ squads: [] })
    const user = userEvent.setup()
    await openForm()

    await user.click(screen.getByLabelText('Starting lane (required)'))
    await user.tab()
    expect(screen.queryByText('Starting lane is required')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Starting lane (required)'), '2')
    await user.tab()
    expect(await screen.findByText('Starting lane must be odd')).toBeVisible()
  })

  it('clears a message when the director types again (SQD-06)', async () => {
    signIn()
    serve({ squads: [] })
    const user = userEvent.setup()
    await openForm()
    await user.type(screen.getByLabelText('Starting lane (required)'), '2')
    await user.tab()
    await screen.findByText('Starting lane must be odd')

    await user.type(screen.getByLabelText('Starting lane (required)'), '1')

    expect(screen.queryByText('Starting lane must be odd')).not.toBeInTheDocument()
  })

  it('says what each lane box takes, and which boxes take decimals (SQD-04 to SQD-06, D-168)', async () => {
    signIn()
    serve({ squads: [] })

    await openForm()

    const lane = screen.getByLabelText('Starting lane (required)')
    expect(lane).toHaveAccessibleDescription('An odd number, 1 to 199.')
    expect(screen.getByLabelText('Number of lanes (required)')).toHaveAccessibleDescription(
      'An even number, 2 to 200.',
    )
    expect(screen.getByLabelText('Bowlers per pair (required)')).toHaveAccessibleDescription(
      '2 to 5. Matches the lane page.',
    )
    for (const label of ['Starting lane (required)', 'Number of lanes (required)']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('inputmode', 'numeric')
    }
    expect(screen.getByLabelText('Bowlers per pair (required)')).toHaveAttribute(
      'inputmode',
      'numeric',
    )
    for (const label of ['Entry fee', 'Finals ratio', 'Cash ratio']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('inputmode', 'decimal')
    }
  })

  it('puts a $ before the fee box and nowhere else (D-170)', async () => {
    signIn()
    serve({ squads: [] })

    await openForm()

    expect(screen.getAllByText('$')).toHaveLength(1)
  })

  it('marks each wrong box invalid, the date included (SQD-03, SQD-06)', async () => {
    signIn()
    serve({ squads: [] })
    const user = userEvent.setup()
    await openForm()

    await user.click(add())

    expect(date()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Starting lane (required)')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByLabelText('Entry fee')).not.toHaveAttribute('aria-invalid')
  })

  it('keeps the other messages when the director fixes one box (SQD-03, SQD-06)', async () => {
    signIn()
    serve({ squads: [] })
    const user = userEvent.setup()
    await openForm()
    await user.click(add())
    await screen.findByRole('alert')

    pickDate('2026-10-24T09:00')

    expect(
      screen.queryByText('Date and time is required', { selector: 'p' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Starting lane is required', { selector: 'p' })).toBeVisible()
  })

  it('drops the summary once every box is fixed (SQD-03 to SQD-06)', async () => {
    signIn()
    serve({ squads: [] })
    const user = userEvent.setup()
    await openForm()
    await user.click(add())
    await screen.findByRole('alert')

    pickDate('2026-10-24T09:00')
    await user.type(screen.getByLabelText('Starting lane (required)'), '1')
    await user.type(screen.getByLabelText('Number of lanes (required)'), '2')
    await user.type(screen.getByLabelText('Bowlers per pair (required)'), '4')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('moves focus to a box when its message in the summary is followed (SQD-06)', async () => {
    signIn()
    serve({ squads: [] })
    const user = userEvent.setup()
    await openForm()
    await user.click(add())
    const alert = await screen.findByRole('alert')

    const link = within(alert).getByRole('link', { name: 'Number of lanes is required' })
    const notPrevented = fireEvent.click(link)

    expect(notPrevented).toBe(false)
    expect(screen.getByLabelText('Number of lanes (required)')).toHaveFocus()
  })

  it('keeps focus in the box when Add or Cancel is pressed with the mouse (D-172)', async () => {
    signIn()
    serve()
    await openForm()

    // A cancelled mousedown is how a page keeps the focus where it was.
    expect(fireEvent.mouseDown(add())).toBe(false)
    expect(fireEvent.mouseDown(screen.getByRole('link', { name: 'Cancel' }))).toBe(false)
  })

  it('stops the browser from sending the form itself (SQD-01)', async () => {
    signIn()
    serve()
    await openForm()

    const form = add().closest('form')
    if (!form) throw new Error('No form')

    expect(fireEvent.submit(form)).toBe(false)
  })

  it('lets the director dismiss the toast on the list (D-172)', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await openForm()
    pickDate('2026-10-24T09:00')
    await user.click(add())
    await screen.findByRole('status')

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('status', { name: /Squad created/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Squad created')).not.toBeInTheDocument()
  })

  it('sends the typed values, goes to the list, and shows the toast (SQD-01 to SQD-08, D-172)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await openForm()

    pickDate('2026-10-25T09:30')
    await user.clear(screen.getByLabelText('Starting lane (required)'))
    await user.type(screen.getByLabelText('Starting lane (required)'), '7')
    await user.type(screen.getByLabelText('Entry fee'), '60')
    await user.type(screen.getByLabelText('Finals ratio'), '5.5')
    await user.click(add())

    expect(await screen.findByRole('heading', { name: 'Squads', level: 1 })).toBeVisible()
    expect(await screen.findByRole('status')).toHaveTextContent('Squad created')
    expect(served.posted).toEqual([
      {
        date: '2026-10-25T09:30',
        startingLane: 7,
        numberOfLanes: 12,
        maxPerPair: 3,
        entryFee: 60,
        finalsRatio: 5.5,
        cashRatio: null,
      },
    ])
  })

  it('disables the button and says Saving… while it saves', async () => {
    signIn()
    let release: () => void = () => undefined
    serve({
      post: () =>
        new Promise<Response>((resolve) => {
          release = () => {
            resolve(HttpResponse.json({ squad: createSquad() }, { status: 201 }))
          }
        }),
    })
    const user = userEvent.setup()
    await openForm()
    pickDate('2026-10-24T09:00')

    await user.click(add())

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    release()
    await screen.findByRole('heading', { name: 'Squads', level: 1 })
  })

  it('shows the API date refusal under the date and focuses it (SQD-03)', async () => {
    signIn()
    const message = 'Squad date must be after tournament start'
    serve({
      post: () => HttpResponse.json({ message, errors: { date: message } }, { status: 409 }),
    })
    const user = userEvent.setup()
    await openForm()
    pickDate('2026-10-24T09:00')

    await user.click(add())

    expect(await screen.findByRole('alert')).toHaveTextContent('Fix 1 field to save.')
    expect(date()).toHaveAccessibleDescription(new RegExp(message))
    expect(date()).toHaveFocus()
  })

  describe('failures that are not about a field', () => {
    it('shows an outage as an error toast that stays, and keeps the typing', async () => {
      signIn()
      serve({ post: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()
      pickDate('2026-10-24T09:00')

      await user.click(add())

      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save the squad (503)')
      expect(screen.getByLabelText('Starting lane (required)')).toHaveValue('5')

      await user.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('drops the old toast as soon as the director presses Add again, even when a check fails', async () => {
      signIn()
      serve({ post: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()
      pickDate('2026-10-24T09:00')
      await user.click(add())
      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save the squad (503)')

      pickDate('')
      await user.click(add())

      expect(screen.queryByText('Failed to save the squad (503)')).not.toBeInTheDocument()
      expect(await screen.findByRole('alert')).toHaveTextContent('Fix 1 field to save.')
    })

    it('shows the API message when a 400 names no field', async () => {
      signIn()
      serve({
        post: () =>
          HttpResponse.json(
            { message: 'Send the squad as a JSON object.', errors: {} },
            { status: 400 },
          ),
      })
      const user = userEvent.setup()
      await openForm()
      pickDate('2026-10-24T09:00')

      await user.click(add())

      expect(await screen.findByRole('alert')).toHaveTextContent('Send the squad as a JSON object.')
    })

    it('shows the complete-tournament refusal as a toast, not under a box (D-171)', async () => {
      signIn()
      const reason = 'This tournament is complete and cannot be changed'
      serve({
        post: () =>
          HttpResponse.json({ message: reason, errors: { tournament: reason } }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()
      pickDate('2026-10-24T09:00')

      await user.click(add())

      expect(await screen.findByRole('alert')).toHaveTextContent(reason)
      expect(screen.queryByText('Fix 1 field to save.')).not.toBeInTheDocument()
    })
  })

  it('shows a notice in place of the form for a complete tournament (D-171)', async () => {
    signIn()
    serve({ completed: true })

    renderApp(url)

    expect(await screen.findByText('This tournament is complete')).toBeVisible()
    expect(screen.queryByLabelText('Date and time (required)')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to squads' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/squads`,
    )
  })

  it('shows loading, then an error with Try again when the settings fail', async () => {
    signIn()
    serve()
    let fail = true
    server.use(
      http.get('/v1/tournaments/:id/settings', () =>
        fail
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ settings: createSettings() }),
      ),
    )
    const user = userEvent.setup()
    renderApp(url)

    // The built-in retry waits about a second before the error shows.
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toBeVisible()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByLabelText('Date and time (required)')).toBeVisible()
  })

  describe('who may see it (D-102, D-167)', () => {
    it('tells a score keeper they lack permission, with no form', async () => {
      signIn('scoreKeeper')
      serve()

      renderApp(url)

      expect(await screen.findByText(/You do not have permission/)).toBeVisible()
      expect(screen.queryByLabelText('Date and time (required)')).not.toBeInTheDocument()
    })

    it('sends a signed-out visitor to sign in', async () => {
      serve()

      renderApp(url)

      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible()
    })
  })
})
