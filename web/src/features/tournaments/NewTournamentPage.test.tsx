import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSignedInUser, createTournament } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'
import type { NewTournament } from './types'

const filled: Record<string, string> = {
  'Name (required)': 'Spring Classic',
  'Start date (required)': '2027-03-12',
  'End date (required)': '2027-03-14',
  'Bowling center (required)': 'Bowl-O-Rama',
  'Entry fee in dollars (required)': '60',
  'Games per squad (required)': '5',
  'Finals ratio (required)': '8',
  'Cash ratio (required)': '5',
  'Super sweeper cash ratio (required)': '4',
}

/** `2027-03-12` as typed into a date box: `03/12/2027`. Other text stays. */
const usDate = (value: string) => value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3/$1')

async function fillIn(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Record<string, string> = {},
) {
  for (const [label, value] of Object.entries({ ...filled, ...overrides })) {
    const input = screen.getByLabelText(label)
    await user.clear(input)
    if (value !== '') await user.type(input, usDate(value))
  }
}

function signInAs(role: 'director' | 'scoreKeeper') {
  setMockUser(createSignedInUser({ roles: [role] }))
}

const save = () => screen.getByRole('button', { name: /Save tournament|Saving/ })

describe('NewTournamentPage', () => {
  it('shows the empty form with no super sweeper default (TRN-22, D-122)', async () => {
    signInAs('director')
    renderApp('/tournaments/new')

    expect(await screen.findByRole('heading', { name: 'New tournament', level: 1 })).toBeVisible()
    expect(document.title).toBe('New tournament · Tournament Director')
    expect(screen.getByLabelText('Super sweeper cash ratio (required)')).toHaveValue('')
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/tournaments')
  })

  it('lists every missing field and focuses the first (TRN-01, TRN-07, TRN-22)', async () => {
    signInAs('director')
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })

    await user.click(save())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Fix 9 fields to save.')
    expect(alert).toHaveTextContent('Name is required')
    expect(alert).toHaveTextContent('Super sweeper cash ratio is required')
    expect(screen.getByLabelText('Name (required)')).toHaveFocus()
    expect(screen.getByLabelText('Name (required)')).toBeInvalid()
    expect(screen.getByLabelText('Name (required)')).toHaveAccessibleDescription('Name is required')
  })

  it('says "field" for one problem and moves focus from the summary link', async () => {
    signInAs('director')
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user, { 'Games per squad (required)': '0' })

    await user.click(save())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Fix 1 field to save.')
    await user.click(screen.getByLabelText('Name (required)'))
    await user.click(screen.getByRole('link', { name: 'Must have at least one game' }))
    expect(screen.getByLabelText('Games per squad (required)')).toHaveFocus()
  })

  it.each([
    ['End date (required)', '2027-03-01', 'End date must be on or after start date (TRN-02)'],
    ['Entry fee in dollars (required)', '0', 'Entry fee must be greater than $0 (TRN-03)'],
    ['Games per squad (required)', '0', 'Must have at least one game (TRN-04)'],
    ['Finals ratio (required)', '1', 'Finals ratio must be greater than 1 (TRN-05)'],
    ['Cash ratio (required)', '1', 'Cash ratio must be greater than 1 (TRN-06)'],
    [
      'Super sweeper cash ratio (required)',
      '0',
      'Super sweeper cash ratio must be at least 1 (TRN-09)',
    ],
  ])('shows the message under %s as the director leaves it', async (label, value, expected) => {
    signInAs('director')
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user)

    const input = screen.getByLabelText(label)
    await user.clear(input)
    await user.type(input, usDate(value))
    await user.tab()

    expect(input).toHaveAccessibleDescription(
      expect.stringContaining(expected.replace(/ \(TRN-\d+\)$/, '')),
    )
  })

  it('clears a message when the text changes', async () => {
    signInAs('director')
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    const name = screen.getByLabelText('Name (required)')
    await user.type(name, 'S')
    await user.clear(name)
    await user.tab()
    expect(name).toBeInvalid()

    await user.type(name, 'S')

    expect(name).toBeValid()
  })

  it('sends the typed values, goes to the overview, and shows the toast (TRN-19, TRN-22, D-120)', async () => {
    signInAs('director')
    const stored = createTournament({ name: 'Spring Classic', entryFee: 60 })
    let sent: NewTournament | undefined
    server.use(
      http.post('/v1/tournaments', async ({ request }) => {
        sent = (await request.json()) as NewTournament
        return HttpResponse.json({ tournament: stored }, { status: 201 })
      }),
      http.get(`/v1/tournaments/${stored.id}`, () => HttpResponse.json({ tournament: stored })),
    )
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user, {
      'Name (required)': '  Spring Classic ',
      'Entry fee in dollars (required)': '60.00',
    })

    await user.click(save())

    expect(await screen.findByRole('heading', { name: 'Spring Classic', level: 1 })).toBeVisible()
    expect(await screen.findByText('Tournament created')).toBeVisible()
    expect(sent).toEqual({
      name: 'Spring Classic',
      startDate: '2027-03-12',
      endDate: '2027-03-14',
      bowlingCenter: 'Bowl-O-Rama',
      entryFee: 60,
      games: 5,
      finalsRatio: 8,
      cashRatio: 5,
      superSweeperCashRatio: 4,
    })
  })

  it('disables Save and says Saving while the request runs', async () => {
    signInAs('director')
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const stored = createTournament()
    server.use(
      http.post('/v1/tournaments', async () => {
        await gate
        return HttpResponse.json({ tournament: stored }, { status: 201 })
      }),
      http.get(`/v1/tournaments/${stored.id}`, () => HttpResponse.json({ tournament: stored })),
    )
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user)

    await user.click(save())

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    release()
    await screen.findByRole('heading', { name: stored.name, level: 1 })
  })

  it('shows a duplicate under Name and keeps what was typed (TRN-20, D-123)', async () => {
    signInAs('director')
    const message = 'A tournament with this name and start date already exists'
    server.use(
      http.post('/v1/tournaments', () =>
        HttpResponse.json({ message, errors: { name: message } }, { status: 409 }),
      ),
    )
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user)

    await user.click(save())

    expect(await screen.findByLabelText('Name (required)')).toHaveAccessibleDescription(message)
    expect(screen.getByLabelText('Name (required)')).toHaveValue('Spring Classic')
    expect(screen.getByLabelText('Name (required)')).toHaveFocus()
    expect(save()).toBeEnabled()
  })

  it('shows a server field error under its field (D-121)', async () => {
    signInAs('director')
    server.use(
      http.post('/v1/tournaments', () =>
        HttpResponse.json(
          {
            message: 'Check the highlighted fields.',
            errors: { cashRatio: 'Cash ratio must be greater than 1' },
          },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user)

    await user.click(save())

    expect(await screen.findByLabelText('Cash ratio (required)')).toHaveAccessibleDescription(
      expect.stringContaining('Cash ratio must be greater than 1'),
    )
  })

  it('keeps an error toast until dismissed when the save fails for another reason', async () => {
    signInAs('director')
    server.use(http.post('/v1/tournaments', () => new HttpResponse(null, { status: 503 })))
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user)

    await user.click(save())

    const toast = await screen.findByRole('alert')
    expect(toast).toHaveTextContent('Failed to save the tournament (503)')
    expect(screen.getByLabelText('Name (required)')).toHaveValue('Spring Classic')
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Failed to save the tournament (503)')).not.toBeInTheDocument()
  })

  it('tells a signed-in user without the permission (D-102)', async () => {
    signInAs('scoreKeeper')
    renderApp('/tournaments/new')

    expect(await screen.findByText('You do not have permission to view this page.')).toBeVisible()
    expect(screen.queryByLabelText('Name (required)')).not.toBeInTheDocument()
  })

  it('sends a signed-out visitor to sign in (D-102)', async () => {
    renderApp('/tournaments/new')

    expect(await screen.findByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
  })

  it('gives each field its hint and input mode (TRN-22)', async () => {
    signInAs('director')
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })

    expect(screen.getByLabelText('Start date (required)')).toHaveAttribute(
      'placeholder',
      'mm/dd/yyyy',
    )
    expect(screen.getByLabelText('End date (required)')).toHaveAttribute(
      'placeholder',
      'mm/dd/yyyy',
    )
    expect(screen.getByLabelText('Name (required)')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Name (required)')).not.toHaveAttribute('inputmode')
    expect(screen.getByLabelText('Name (required)')).not.toHaveAccessibleDescription()
    const games = screen.getByLabelText('Games per squad (required)')
    expect(games).toHaveAttribute('inputmode', 'numeric')
    expect(games).toHaveAccessibleDescription('1 to 99.')
    for (const label of [
      'Entry fee in dollars',
      'Finals ratio',
      'Cash ratio',
      'Super sweeper cash ratio',
    ]) {
      expect(screen.getByLabelText(`${label} (required)`)).toHaveAttribute('inputmode', 'decimal')
    }
    expect(screen.getByLabelText('Entry fee in dollars (required)')).toHaveAccessibleDescription(
      'Per squad entry. A squad can set its own later. Up to 999.99.',
    )
    expect(screen.getByLabelText('Finals ratio (required)')).toHaveAccessibleDescription(
      '1 in N advance. Greater than 1. Example: 8.',
    )
    expect(screen.getByLabelText('Cash ratio (required)')).toHaveAccessibleDescription(
      '1 in N cash. Greater than 1. Example: 5.',
    )
    expect(
      screen.getByLabelText('Super sweeper cash ratio (required)'),
    ).toHaveAccessibleDescription('1 in N super sweeper bowlers cash. At least 1.')
  })

  it('reads the hint and the message together when a field is wrong', async () => {
    signInAs('director')
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    const games = screen.getByLabelText('Games per squad (required)')

    await user.type(games, '0')
    await user.tab()

    expect(games).toHaveAccessibleDescription('1 to 99. Must have at least one game')
  })

  it('hides the summary once every message is fixed', async () => {
    signInAs('director')
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user, { 'Games per squad (required)': '0' })
    await user.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Fix 1 field to save.')

    await user.type(screen.getByLabelText('Games per squad (required)'), '5')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears the summary when the next save goes out', async () => {
    signInAs('director')
    server.use(http.post('/v1/tournaments', () => new HttpResponse(null, { status: 503 })))
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user, { 'Games per squad (required)': '0' })
    await user.click(save())
    await screen.findByText('Fix 1 field to save.')
    await user.clear(screen.getByLabelText('Games per squad (required)'))
    await user.type(screen.getByLabelText('Games per squad (required)'), '5')
    server.use(http.post('/v1/tournaments', () => new HttpResponse(null, { status: 503 })))

    await user.click(save())

    expect(await screen.findByText('Failed to save the tournament (503)')).toBeVisible()
    expect(screen.queryByText(/Fix \d+ field/)).not.toBeInTheDocument()
  })

  it('shows the message as a toast when the API refuses without naming a field (D-121)', async () => {
    signInAs('director')
    server.use(
      http.post('/v1/tournaments', () =>
        HttpResponse.json(
          { message: 'The request body is too large.', errors: {} },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user)

    await user.click(save())

    expect(await screen.findByRole('alert')).toHaveTextContent('The request body is too large.')
    expect(screen.queryByText(/Fix \d+ field/)).not.toBeInTheDocument()
  })

  it('removes an old toast when the director saves again', async () => {
    signInAs('director')
    server.use(http.post('/v1/tournaments', () => new HttpResponse(null, { status: 503 })))
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user)
    await user.click(save())
    await screen.findByText('Failed to save the tournament (503)')

    await user.clear(screen.getByLabelText('Name (required)'))
    await user.click(save())

    expect(screen.queryByText('Failed to save the tournament (503)')).not.toBeInTheDocument()
  })

  it('keeps focus in the field when the mouse presses Save or Cancel (TRN-22)', async () => {
    signInAs('director')
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })

    // A message appearing under the field would move the buttons and lose the click.
    expect(fireEvent.mouseDown(save())).toBe(false)
    expect(fireEvent.mouseDown(screen.getByRole('link', { name: 'Cancel' }))).toBe(false)
  })

  it('says nothing about a field the director only tabbed through (TRN-22)', async () => {
    signInAs('director')
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })

    await user.click(screen.getByLabelText('Name (required)'))
    for (let field = 0; field < 9; field += 1) await user.tab()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    for (const label of Object.keys(filled)) expect(screen.getByLabelText(label)).toBeValid()
  })

  it('checks a field the director left empty once a save has failed (TRN-22)', async () => {
    signInAs('director')
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await user.click(save())
    await screen.findByRole('alert')
    const center = screen.getByLabelText('Bowling center (required)')

    await user.click(center)
    await user.tab()

    expect(center).toHaveAccessibleDescription('Bowling center is required')
  })

  it('drops the end date message when the start date moves back before it (TRN-02)', async () => {
    signInAs('director')
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user, {
      'Start date (required)': '2027-03-14',
      'End date (required)': '2027-03-12',
    })
    await user.tab()
    expect(screen.getByLabelText('End date (required)')).toBeInvalid()

    await user.clear(screen.getByLabelText('Start date (required)'))
    await user.type(screen.getByLabelText('Start date (required)'), '03/10/2027')

    expect(screen.getByLabelText('End date (required)')).toBeValid()
  })

  it('keeps the end date message while the start date is still after it (TRN-02)', async () => {
    signInAs('director')
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user, {
      'Start date (required)': '2027-03-14',
      'End date (required)': '2027-03-12',
    })
    await user.tab()

    await user.clear(screen.getByLabelText('Start date (required)'))
    await user.type(screen.getByLabelText('Start date (required)'), '03/13/2027')

    expect(screen.getByLabelText('End date (required)')).toHaveAccessibleDescription(
      'End date must be on or after start date',
    )
  })

  it('flags the end date when the start date moves past it (TRN-02)', async () => {
    signInAs('director')
    const user = userEvent.setup()
    renderApp('/tournaments/new')
    await screen.findByRole('heading', { name: 'New tournament' })
    await fillIn(user, {
      'Start date (required)': '2027-03-10',
      'End date (required)': '2027-03-12',
    })
    expect(screen.getByLabelText('End date (required)')).toBeValid()

    const start = screen.getByLabelText('Start date (required)')
    await user.clear(start)
    await user.type(start, '2027-03-20')
    await user.tab()

    expect(screen.getByLabelText('End date (required)')).toHaveAccessibleDescription(
      'End date must be on or after start date',
    )
  })
})
