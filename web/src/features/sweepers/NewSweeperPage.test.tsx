import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createDivision,
  createSettings,
  createSignedInUser,
  createSweeper,
  createTournament,
} from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'
import type { Division } from '../divisions/types'
import type { NewSweeper, Sweeper } from './types'

const tournament = createTournament({
  name: 'Spring Open',
  startDate: '2026-10-24',
  endDate: '2026-10-25',
})
const url = `/tournaments/${tournament.id}/sweepers/new`

const open = createDivision({ id: 'd-open', number: 1, name: 'Open' })
const women = createDivision({ id: 'd-women', number: 2, name: 'Women' })

interface Served {
  posted: NewSweeper[]
}

/** The reads the page needs, and a POST that answers the way the API would. */
function serve(
  options: {
    sweepers?: Sweeper[]
    divisions?: Division[]
    completed?: boolean
    post?: () => Response | Promise<Response>
  } = {},
): Served {
  const served: Served = { posted: [] }
  const sweepers = options.sweepers ?? [
    createSweeper({
      date: '2026-10-24T18:00:00',
      startingLane: 1,
      numberOfLanes: 24,
      maxPerPair: 4,
    }),
    createSweeper({
      date: '2026-10-25T18:00:00',
      startingLane: 5,
      numberOfLanes: 12,
      maxPerPair: 3,
    }),
  ]
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/settings', () =>
      HttpResponse.json({ settings: createSettings({ completed: options.completed === true }) }),
    ),
    http.get('/v1/tournaments/:id/sweepers', () => HttpResponse.json({ sweepers })),
    http.get('/v1/tournaments/:id/divisions', () =>
      HttpResponse.json({ divisions: options.divisions ?? [open, women] }),
    ),
    http.post('/v1/tournaments/:id/sweepers', async ({ request }) => {
      served.posted.push((await request.json()) as NewSweeper)
      if (options.post) return options.post()
      return HttpResponse.json({ sweeper: createSweeper() }, { status: 201 })
    }),
  )
  return served
}

const signIn = (role: 'director' | 'scoreKeeper' = 'director') => {
  setMockUser(createSignedInUser({ roles: [role] }))
}
const add = () => screen.getByRole('button', { name: /Add sweeper|Saving/ })
const date = () => screen.getByLabelText('Date and time (required)')
const box = (name: string) => screen.getByLabelText(name)
const openForm = async () => {
  renderApp(url)
  await screen.findByRole('heading', { name: 'New sweeper', level: 1 })
  // The form appears once the settings, the list, and the divisions have answered. A failed read retries once, so wait longer than the default second.
  await screen.findByLabelText('Date and time (required)', {}, { timeout: 3000 })
}
/** A date-time box takes a whole value at once. */
const pickDate = (value: string) => {
  fireEvent.change(date(), { target: { value } })
}
/** The boxes every sweeper needs, filled. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  pickDate('2026-10-25T19:00')
  await user.type(box('Entry fee (required)'), '20')
  await user.type(box('Games (required)'), '3')
  await user.type(box('Cash ratio (required)'), '5')
}

describe('NewSweeperPage', () => {
  it('starts with the lanes and bowlers per pair of the latest sweeper, and the rest blank (D-178)', async () => {
    signIn()
    serve()

    await openForm()

    expect(date()).toHaveValue('')
    expect(box('Starting lane (required)')).toHaveValue('5')
    expect(box('Number of lanes (required)')).toHaveValue('12')
    expect(box('Bowlers per pair (required)')).toHaveValue('3')
    expect(box('Entry fee (required)')).toHaveValue('')
    expect(box('Games (required)')).toHaveValue('')
    expect(box('Cash ratio (required)')).toHaveValue('')
    expect(box('Open')).toHaveValue('')
    expect(document.title).toBe('New sweeper · Spring Open · Tournament Director')
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/sweepers`,
    )
  })

  it('waits for a fresh division list, so a deleted division has no box (D-177)', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    renderApp(`/tournaments/${tournament.id}/divisions`)
    await screen.findByText('Women')
    // The division is deleted elsewhere; the Divisions page left the old list in the cache.
    serve({ divisions: [open] })

    await user.click(screen.getByRole('link', { name: 'Sweepers' }))
    await user.click(await screen.findByRole('link', { name: 'New sweeper' }))
    await screen.findByLabelText('Date and time (required)', {}, { timeout: 3000 })

    expect(box('Open')).toBeInTheDocument()
    expect(screen.queryByLabelText('Women')).not.toBeInTheDocument()
  })

  it('starts blank for the first sweeper, and when the list cannot be read (D-178)', async () => {
    signIn()
    serve({ sweepers: [] })

    await openForm()
    expect(box('Starting lane (required)')).toHaveValue('')
    expect(box('Number of lanes (required)')).toHaveValue('')
    expect(box('Bowlers per pair (required)')).toHaveValue('')
  })

  it('still saves when the sweepers list cannot be read (D-178)', async () => {
    signIn()
    const served = serve()
    server.use(
      http.get('/v1/tournaments/:id/sweepers', () => new HttpResponse(null, { status: 500 })),
    )
    const user = userEvent.setup()
    await openForm()

    expect(box('Starting lane (required)')).toHaveValue('')
    await fillRequired(user)
    await user.type(box('Starting lane (required)'), '1')
    await user.type(box('Number of lanes (required)'), '24')
    await user.type(box('Bowlers per pair (required)'), '4')
    await user.click(add())

    await waitFor(() => {
      expect(served.posted).toHaveLength(1)
    })
  })

  it('limits the date box to the tournament days and says so (D-169, SQD-10)', async () => {
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

  it('groups the boxes and says what each takes (SQD-11, SQD-12, D-175)', async () => {
    signIn()
    serve()

    await openForm()

    expect(screen.getByRole('group', { name: 'Lanes' })).toBeVisible()
    expect(screen.getByRole('group', { name: 'Entry and payout' })).toBeVisible()
    expect(screen.getByRole('group', { name: 'Bonus pins per game' })).toBeVisible()
    expect(box('Entry fee (required)')).toHaveAccessibleDescription('Above 0, up to 999.99.')
    expect(box('Games (required)')).toHaveAccessibleDescription('1 to 99.')
    expect(box('Cash ratio (required)')).toHaveAccessibleDescription('1.1 to 99.9, one decimal.')
    expect(screen.getByText('$')).toBeVisible()
    expect(box('Games (required)')).toHaveAttribute('inputmode', 'numeric')
    expect(box('Entry fee (required)')).toHaveAttribute('inputmode', 'decimal')
    expect(box('Cash ratio (required)')).toHaveAttribute('inputmode', 'decimal')
    expect(box('Open')).toHaveAccessibleDescription('0 to 99. Leave blank for none.')
    // No empty paragraph waits for a message.
    for (const paragraph of within(
      screen.getByRole('group', { name: 'Bonus pins per game' }),
    ).getAllByRole('paragraph')) {
      expect(paragraph).not.toBeEmptyDOMElement()
    }
    expect(box('Starting lane (required)')).toHaveAccessibleDescription('An odd number, 1 to 199.')
    expect(box('Number of lanes (required)')).toHaveAccessibleDescription(
      'An even number, 2 to 200.',
    )
    expect(box('Bowlers per pair (required)')).toHaveAccessibleDescription(
      '2 to 5. Matches the lane page.',
    )
  })

  it('shows a bonus-pins box for each division, in the order sent (SQD-13, DIV-14)', async () => {
    signIn()
    serve()

    await openForm()

    const group = screen.getByRole('group', { name: 'Bonus pins per game' })
    expect(
      within(group)
        .getAllByRole('textbox')
        .map((input) => input.getAttribute('name')),
    ).toEqual(['bonusPins.d-open', 'bonusPins.d-women'])
    expect(within(group).getByLabelText('Women')).toBeVisible()
  })

  it('says so, with a link to add a division, when the tournament has none (D-177)', async () => {
    signIn()
    const served = serve({ divisions: [] })
    const user = userEvent.setup()
    await openForm()

    expect(screen.getByText(/This tournament has no divisions yet/)).toHaveTextContent(
      'This tournament has no divisions yet, so no bonus pins apply. Add a division first if you want them.',
    )
    expect(screen.getByRole('link', { name: 'Add a division' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/divisions/new`,
    )
    await fillRequired(user)
    await user.click(add())

    await waitFor(() => {
      expect(served.posted).toHaveLength(1)
    })
    expect(served.posted[0]?.bonusPins).toEqual({})
  })

  it('lists every missing field and focuses the first (SQD-10 to SQD-12)', async () => {
    signIn()
    const served = serve({ sweepers: [] })
    const user = userEvent.setup()
    await openForm()

    await user.click(add())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Fix 7 fields to save.')
    for (const message of [
      'Date and time is required',
      'Starting lane is required',
      'Number of lanes is required',
      'Max per pair is required',
      'Entry fee is required',
      'Games is required',
      'Cash ratio is required',
    ]) {
      expect(within(alert).getByRole('link', { name: message })).toBeVisible()
    }
    expect(date()).toHaveFocus()
    expect(date()).toHaveAccessibleDescription(/Date and time is required/)
    expect(served.posted).toEqual([])
  })

  it('shows each rule under its box (SQD-11, SQD-12, SQD-13, D-175, D-176)', async () => {
    signIn()
    const served = serve({ sweepers: [] })
    const user = userEvent.setup()
    await openForm()

    pickDate('2026-10-24T18:00')
    await user.type(box('Starting lane (required)'), '1')
    await user.type(box('Number of lanes (required)'), '24')
    await user.type(box('Bowlers per pair (required)'), '4')
    await user.type(box('Entry fee (required)'), '0')
    await user.type(box('Games (required)'), '100')
    await user.type(box('Cash ratio (required)'), '1')
    await user.type(box('Open'), '100')
    await user.type(box('Women'), '1.5')
    await user.click(add())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Fix 5 fields to save.')
    for (const message of [
      'Entry fee must be greater than $0',
      'Games must be between 1 and 99',
      'Cash ratio must be greater than 1',
      'Bonus pins must be between 0 and 99',
      'Enter a whole number',
    ]) {
      expect(within(alert).getByText(message)).toBeVisible()
    }
    expect(box('Open')).toHaveAccessibleDescription(/Bonus pins must be between 0 and 99/)
    expect(box('Open')).toHaveAttribute('aria-invalid', 'true')
    expect(box('Entry fee (required)')).toHaveFocus()
    expect(served.posted).toEqual([])
  })

  it('refuses a date outside the tournament before it sends, saying "Sweeper" (SQD-10)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await openForm()
    await fillRequired(user)
    pickDate('2026-10-26T09:00')

    await user.click(add())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sweeper date must be before tournament end',
    )
    expect(served.posted).toEqual([])
  })

  it('checks a box when the director leaves it, not before, and clears it on typing (SQD-12)', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await openForm()

    await user.click(box('Games (required)'))
    await user.tab()
    expect(screen.queryByText('Games is required')).not.toBeInTheDocument()

    await user.type(box('Games (required)'), '0')
    await user.tab()
    expect(await screen.findByText('Games must be between 1 and 99')).toBeVisible()

    await user.type(box('Games (required)'), '3')
    expect(screen.queryByText('Games must be between 1 and 99')).not.toBeInTheDocument()
  })

  it('moves focus to a box when its message in the summary is followed (SQD-13)', async () => {
    signIn()
    const user = userEvent.setup()
    serve()
    await openForm()
    await fillRequired(user)
    await user.type(box('Women'), 'abc')
    await user.click(add())

    await user.click(
      within(await screen.findByRole('alert')).getByRole('link', { name: 'Enter a number' }),
    )

    expect(box('Women')).toHaveFocus()
  })

  it('sends the typed values, one pins entry per division, goes to the list, and shows the toast (SQD-10 to SQD-13, D-178)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await openForm()

    pickDate('2026-10-25T19:00')
    await user.clear(box('Starting lane (required)'))
    await user.type(box('Starting lane (required)'), '7')
    await user.type(box('Entry fee (required)'), '20.50')
    await user.type(box('Games (required)'), '3')
    await user.type(box('Cash ratio (required)'), '5.5')
    await user.type(box('Open'), '10')
    await user.click(add())

    expect(await screen.findByRole('heading', { name: 'Sweepers', level: 1 })).toBeVisible()
    expect(await screen.findByRole('status')).toHaveTextContent('Sweeper created')
    expect(served.posted).toEqual([
      {
        date: '2026-10-25T19:00',
        startingLane: 7,
        numberOfLanes: 12,
        maxPerPair: 3,
        entryFee: 20.5,
        games: 3,
        cashRatio: 5.5,
        bonusPins: { 'd-open': 10, 'd-women': null },
      },
    ])
  })

  it('lets the director dismiss the toast on the list (D-178)', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await openForm()
    await fillRequired(user)
    await user.click(add())
    await screen.findByRole('status')

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText('Sweeper created')).not.toBeInTheDocument()
  })

  it('moves focus to a box when its message in the summary is followed, and stops the link jumping (SQD-12)', async () => {
    signIn()
    serve({ sweepers: [] })
    const user = userEvent.setup()
    await openForm()
    await user.click(add())
    const alert = await screen.findByRole('alert')

    const link = within(alert).getByRole('link', { name: 'Games is required' })

    expect(fireEvent.click(link)).toBe(false)
    expect(box('Games (required)')).toHaveFocus()
  })

  it('keeps focus in the box when Add or Cancel is pressed with the mouse (D-178)', async () => {
    signIn()
    serve()
    await openForm()

    // A cancelled mousedown is how a page keeps the focus where it was.
    expect(fireEvent.mouseDown(add())).toBe(false)
    expect(fireEvent.mouseDown(screen.getByRole('link', { name: 'Cancel' }))).toBe(false)
  })

  it('stops the browser from sending the form itself (SQD-10)', async () => {
    signIn()
    serve()
    await openForm()

    const form = add().closest('form')
    if (!form) throw new Error('No form')

    expect(fireEvent.submit(form)).toBe(false)
  })

  it('marks each wrong box invalid, the date and a pins box included (SQD-10, SQD-13)', async () => {
    signIn()
    serve({ sweepers: [] })
    const user = userEvent.setup()
    await openForm()
    pickDate('2026-10-26T09:00')
    await user.type(box('Open'), '100')
    await user.click(add())

    await screen.findByRole('alert')

    expect(date()).toHaveAttribute('aria-invalid', 'true')
    expect(box('Open')).toHaveAttribute('aria-invalid', 'true')
    expect(box('Entry fee (required)')).toHaveAttribute('aria-invalid', 'true')
    expect(box('Games (required)')).toHaveAttribute('aria-invalid', 'true')
    expect(box('Women')).not.toHaveAttribute('aria-invalid')
  })

  it('checks the date when the director leaves it (SQD-10)', async () => {
    signIn()
    serve()
    await openForm()

    pickDate('2026-10-26T09:00')
    fireEvent.blur(date())

    expect(await screen.findByText('Sweeper date must be before tournament end')).toBeVisible()
    pickDate('2026-10-25T09:00')
    expect(screen.queryByText('Sweeper date must be before tournament end')).not.toBeInTheDocument()
  })

  it('drops the summary once every box is fixed (SQD-10 to SQD-13)', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await openForm()
    await user.click(add())
    expect(await screen.findByRole('alert')).toHaveTextContent('Fix 4 fields to save.')

    await fillRequired(user)

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('sends a typed 0 as 0 (D-176)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await openForm()
    await fillRequired(user)
    await user.type(box('Women'), '0')

    await user.click(add())

    await waitFor(() => {
      expect(served.posted[0]?.bonusPins).toEqual({ 'd-open': null, 'd-women': 0 })
    })
  })

  it('disables the button and says Saving… while it saves', async () => {
    signIn()
    let release: () => void = () => undefined
    serve({
      post: () =>
        new Promise<Response>((resolve) => {
          release = () => {
            resolve(HttpResponse.json({ sweeper: createSweeper() }, { status: 201 }))
          }
        }),
    })
    const user = userEvent.setup()
    await openForm()
    await fillRequired(user)

    await user.click(add())

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    release()
    await screen.findByRole('heading', { name: 'Sweepers', level: 1 })
  })

  it('shows the API refusal of a gone division under the pins and focuses the first pins box (D-177)', async () => {
    signIn()
    const message = 'A division no longer exists. Reload the page'
    serve({
      post: () => HttpResponse.json({ message, errors: { bonusPins: message } }, { status: 409 }),
    })
    const user = userEvent.setup()
    await openForm()
    await fillRequired(user)

    await user.click(add())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Fix 1 field to save.')
    expect(
      within(screen.getByRole('group', { name: 'Bonus pins per game' })).getByText(message),
    ).toBeVisible()
    expect(box('Open')).toHaveFocus()
  })

  it('shows the API date refusal under the date and focuses it (SQD-10)', async () => {
    signIn()
    const message = 'Sweeper date must be after tournament start'
    serve({
      post: () => HttpResponse.json({ message, errors: { date: message } }, { status: 409 }),
    })
    const user = userEvent.setup()
    await openForm()
    await fillRequired(user)

    await user.click(add())

    expect(await screen.findByRole('alert')).toHaveTextContent('Fix 1 field to save.')
    expect(date()).toHaveAccessibleDescription(new RegExp(message))
    expect(date()).toHaveFocus()
  })

  it('shows an API message for one pins box under that box (SQD-13)', async () => {
    signIn()
    const message = 'Bonus pins must be between 0 and 99'
    serve({
      post: () =>
        HttpResponse.json({ message, errors: { 'bonusPins.d-women': message } }, { status: 400 }),
    })
    const user = userEvent.setup()
    await openForm()
    await fillRequired(user)

    await user.click(add())

    await waitFor(() => {
      expect(box('Women')).toHaveAccessibleDescription(new RegExp(message))
    })
    expect(box('Women')).toHaveFocus()
  })

  describe('failures that are not about a field', () => {
    it('shows an outage as an error toast that stays, and keeps the typing', async () => {
      signIn()
      serve({ post: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()
      await fillRequired(user)

      await user.click(add())

      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save the sweeper (503)')
      expect(box('Games (required)')).toHaveValue('3')

      await user.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('drops the old toast as soon as the director presses Add again', async () => {
      signIn()
      serve({ post: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()
      await fillRequired(user)
      await user.click(add())
      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save the sweeper (503)')

      await user.clear(box('Games (required)'))
      await user.click(add())

      expect(screen.queryByText('Failed to save the sweeper (503)')).not.toBeInTheDocument()
      expect(await screen.findByRole('alert')).toHaveTextContent('Fix 1 field to save.')
    })

    it('shows the API message when a 400 names no field', async () => {
      signIn()
      serve({
        post: () =>
          HttpResponse.json(
            { message: 'Send the sweeper as a JSON object.', errors: {} },
            { status: 400 },
          ),
      })
      const user = userEvent.setup()
      await openForm()
      await fillRequired(user)

      await user.click(add())

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Send the sweeper as a JSON object.',
      )
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
      await fillRequired(user)

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
    expect(screen.getByRole('link', { name: 'Back to sweepers' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/sweepers`,
    )
  })

  it.each(['settings', 'divisions'])(
    'shows an error with Try again when the %s cannot be read',
    async (which) => {
      signIn()
      serve()
      let fail = true
      const path = `/v1/tournaments/:id/${which}`
      server.use(
        http.get(path, () =>
          fail
            ? new HttpResponse(null, { status: 500 })
            : HttpResponse.json(
                which === 'settings' ? { settings: createSettings() } : { divisions: [open] },
              ),
        ),
      )
      const user = userEvent.setup()
      renderApp(url)

      // The built-in retry waits about a second before the error shows.
      expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toBeVisible()
      fail = false
      await user.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByLabelText('Date and time (required)')).toBeVisible()
    },
  )

  describe('who may see it (D-102, D-174)', () => {
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
