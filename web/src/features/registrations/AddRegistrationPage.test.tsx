import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import {
  createDivision,
  createSettings,
  createSignedInUser,
  createSquad,
  createSweeper,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type {
  BowlerRegistration,
  BowlerResponse,
  BowlerSearch,
  BowlerSearchResult,
  DeskRegistrationRequest,
} from './types'

const tournament = createTournament({ name: 'Spring Open' })
const scratch = createDivision({ number: 1, name: 'Scratch' })
const handicap = createDivision({ number: 2, name: 'Handicap', handicapPercentage: 90 })
const morning = createSquad({ date: '2026-10-24T09:00:00', entryFee: 50 })
const afternoon = createSquad({ date: '2026-10-24T13:00:00', entryFee: 60 })
const finished = createSquad({ date: '2026-10-23T09:00:00', complete: true })
const sweeper = createSweeper({ date: '2026-10-24T12:00:00', entryFee: 25 })
const url = `/tournaments/${tournament.id}/registrations/new`

const maria: BowlerResponse['bowler'] = {
  id: '00000000-0000-4000-8000-0000000000aa',
  firstName: 'Maria',
  middleInitial: '',
  lastName: 'Gonzalez',
  suffix: '',
  street: '14 Elm Street',
  city: 'Worcester',
  state: 'MA',
  zipCode: '01604',
  email: 'maria@example.com',
  phoneNumber: '5085550142',
  usbcId: '1234-56789',
  dateOfBirth: '1984-03-09',
  gender: 'Female',
}

function result(overrides: Partial<BowlerSearchResult> = {}): BowlerSearchResult {
  return {
    id: maria.id,
    name: 'Maria Gonzalez',
    firstName: 'Maria',
    lastName: 'Gonzalez',
    usbcId: '1234-56789',
    city: 'Worcester',
    state: 'MA',
    registered: null,
    ...overrides,
  }
}

interface Options {
  completed?: boolean
  search?: () => Response | Promise<Response>
  searches?: BowlerSearch
  bowler?: BowlerResponse
  /** Answers each POST in turn; the last one repeats. */
  posts?: (() => Response)[]
}

interface Served {
  posted: DeskRegistrationRequest[]
  queries: string[]
}

function serve(options: Options = {}): Served {
  const served: Served = { posted: [], queries: [] }
  const answers = options.posts ?? [
    () =>
      HttpResponse.json({ registrationId: crypto.randomUUID(), mode: 'created' }, { status: 201 }),
  ]
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/settings', () =>
      HttpResponse.json({ settings: createSettings({ completed: options.completed === true }) }),
    ),
    http.get('/v1/tournaments/:id/divisions', () =>
      HttpResponse.json({ divisions: [handicap, scratch] }),
    ),
    http.get('/v1/tournaments/:id/squads', () =>
      HttpResponse.json({ squads: [morning, afternoon, finished] }),
    ),
    http.get('/v1/tournaments/:id/sweepers', () => HttpResponse.json({ sweepers: [sweeper] })),
    http.get('/v1/tournaments/:id/registrations', () =>
      HttpResponse.json({
        registrations: [],
        summary: { registrations: 0, superSweepers: 0, divisions: [], squads: [], sweepers: [] },
      }),
    ),
    http.get('/v1/bowlers', ({ request }) => {
      served.queries.push(new URL(request.url).search)
      if (options.search) return options.search()
      return HttpResponse.json(options.searches ?? { bowlers: [result()], more: false })
    }),
    http.get('/v1/bowlers/:id', () =>
      HttpResponse.json(options.bowler ?? { bowler: maria, registration: null }),
    ),
    http.post('/v1/tournaments/:id/registrations', async ({ request }) => {
      served.posted.push((await request.json()) as DeskRegistrationRequest)
      const answer = answers[Math.min(served.posted.length, answers.length) - 1]
      return answer ? answer() : new HttpResponse(null, { status: 500 })
    }),
  )
  return served
}

const signIn = (role: 'director' | 'scoreKeeper' = 'director') => {
  setMockUser(createSignedInUser({ roles: [role] }))
}

async function open(route = url) {
  renderApp(route)
  await screen.findByRole('heading', { name: 'Add registration', level: 1 })
  await screen.findByRole('form', { name: 'Find a bowler' })
}

async function pickMaria(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Last name starts with'), 'Gon')
  await user.click(screen.getByRole('button', { name: 'Search' }))
  await user.click(await screen.findByRole('button', { name: /^Pick Maria Gonzalez/ }))
}

const next = (user: ReturnType<typeof userEvent.setup>, name: RegExp) =>
  user.click(screen.getByRole('button', { name }))

describe('searching for a bowler (BWL-14, D-157)', () => {
  it('asks for at least one field before it searches', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open()

    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter at least one search field.')
    expect(served.queries).toHaveLength(0)
  })

  it('sends the filled fields and this tournament, and lists the results with the Registered badge (REG-01, D-159)', async () => {
    signIn()
    const served = serve({
      searches: {
        bowlers: [
          result({ registered: { divisionName: 'Handicap' } }),
          result({ id: crypto.randomUUID(), name: 'Maria Gonzales', usbcId: '', city: 'Quincy' }),
        ],
        more: false,
      },
    })
    const user = userEvent.setup()
    await open()

    await user.type(screen.getByLabelText('Last name starts with'), ' Gon ')
    await user.type(screen.getByLabelText('USBC ID'), '1234-56789')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByRole('heading', { name: '2 bowlers found' })).toBeVisible()
    const params = new URLSearchParams(served.queries[0])
    expect(params.get('lastName')).toBe('Gon')
    expect(params.get('usbcId')).toBe('1234-56789')
    expect(params.get('tournamentId')).toBe(tournament.id)
    expect(params.has('firstName')).toBe(false)
    expect(screen.getByText('✓ Registered: Handicap')).toBeVisible()
    expect(screen.getByText('No USBC ID · Quincy, MA')).toBeVisible()
  })

  it('says when nobody matches, and offers New bowler', async () => {
    signIn()
    serve({ searches: { bowlers: [], more: false } })
    const user = userEvent.setup()
    await open()

    await user.type(screen.getByLabelText('Last name starts with'), 'Nobody')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText(/No bowler matches/)).toBeVisible()
  })

  it('says when the list was cut at 25', async () => {
    signIn()
    serve({ searches: { bowlers: [result()], more: true } })
    const user = userEvent.setup()
    await open()

    await user.type(screen.getByLabelText('Last name starts with'), 'G')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText(/Showing the first 25/)).toBeVisible()
  })

  it('shows a failed search with Try again, and recovers', async () => {
    signIn()
    let failing = true
    serve({
      search: () =>
        failing
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ bowlers: [result()], more: false }),
    })
    const user = userEvent.setup()
    await open()

    await user.type(screen.getByLabelText('Last name starts with'), 'Gon')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('Could not search for bowlers.')).toBeVisible()

    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: '1 bowler found' })).toBeVisible()
  })
})

describe('a new bowler (REG-02, REG-03, D-162)', () => {
  async function startNew(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'New bowler' }))
    await screen.findByRole('heading', { name: 'Bowler', level: 2 })
  }

  it('needs both names before step 2, with the legacy words', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await startNew(user)

    await next(user, /Next: registration/)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Fix 2 things to save.')
    expect(alert).toHaveTextContent('First Name is Required')
    expect(alert).toHaveTextContent('Last Name is Required')
    expect(screen.getByLabelText('First name (required)')).toHaveAccessibleDescription(
      'First Name is Required',
    )
    expect(screen.getByRole('heading', { name: 'Bowler', level: 2 })).toBeVisible()
  })

  it('needs a division and a squad before Review (REG-03)', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await startNew(user)
    await user.type(screen.getByLabelText('First name (required)'), 'Ann')
    await user.type(screen.getByLabelText('Last name (required)'), 'Lee')
    await next(user, /Next: registration/)

    await next(user, /Next: review/)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Pick a division')
    expect(alert).toHaveTextContent('Bowler must enter at least one squad')
  })

  it('refuses an average outside 1 to 300 on the page (REG-16)', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await startNew(user)
    await user.type(screen.getByLabelText('First name (required)'), 'Ann')
    await user.type(screen.getByLabelText('Last name (required)'), 'Lee')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))
    await user.type(screen.getByLabelText('Average'), '301')

    await next(user, /Next: review/)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Average must be less than or equal to 300.',
    )
  })

  it('saves a name-only bowler with one squad and goes to the list with a toast (REG-08, D-162)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open()
    await startNew(user)
    await user.type(screen.getByLabelText('First name (required)'), ' Ann ')
    await user.type(screen.getByLabelText('Last name (required)'), 'Lee')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 12:00 PM/))
    await next(user, /Next: review/)

    expect(screen.getByText('New registration in Scratch.')).toBeVisible()
    expect(screen.getByText(/Squads: Sat 10\/24\/2026 9:00 AM\./)).toBeVisible()
    expect(screen.getByText(/records a \$0 desk entry/)).toBeVisible()
    expect(screen.getByRole('row', { name: 'Squad Sat 10/24/2026 9:00 AM $50.00' })).toBeVisible()
    expect(
      screen.getByRole('row', { name: 'Sweeper Sat 10/24/2026 12:00 PM $25.00' }),
    ).toBeVisible()
    expect(screen.getByRole('row', { name: 'Total to collect $75.00' })).toBeVisible()
    await next(user, /^Add registration$/)

    expect(await screen.findByText('Registration added for Ann Lee')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
    expect(served.posted).toEqual([
      {
        divisionId: scratch.id,
        average: null,
        squadIds: [morning.id],
        sweeperIds: [sweeper.id],
        superSweeper: false,
        bowler: { firstName: 'Ann', lastName: 'Lee' },
      },
    ])
  })

  it('greys out a complete squad so it cannot be picked (REG-33)', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await startNew(user)
    await user.type(screen.getByLabelText('First name (required)'), 'Ann')
    await user.type(screen.getByLabelText('Last name (required)'), 'Lee')

    await next(user, /Next: registration/)

    const box = screen.getByLabelText(/Fri 10\/23\/2026 9:00 AM/)
    expect(box).toBeDisabled()
    expect(box).not.toBeChecked()
    expect(screen.getByText('Complete')).toBeVisible()
  })

  it('keeps what was typed when the desk goes back and forward again', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await startNew(user)
    await user.type(screen.getByLabelText('First name (required)'), 'Ann')
    await user.type(screen.getByLabelText('Last name (required)'), 'Lee')
    await user.type(screen.getByLabelText('Email'), 'ann@example.com')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Handicap')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))

    await user.click(screen.getByRole('button', { name: '1. Bowler' }))
    expect(screen.getByLabelText('Email')).toHaveValue('ann@example.com')
    await next(user, /Next: registration/)

    expect(screen.getByLabelText('Division (required)')).toHaveValue(handicap.id)
    expect(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/)).toBeChecked()
  })

  it('returns to the Bowler step with the field named when the API refuses a field (REG-05)', async () => {
    signIn()
    serve({
      posts: [
        () =>
          HttpResponse.json(
            {
              message: 'USBC Id is required for Handicap Divisions',
              errors: { 'bowler.usbcId': 'USBC Id is required for Handicap Divisions' },
            },
            { status: 400 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await startNew(user)
    await user.type(screen.getByLabelText('First name (required)'), 'Ann')
    await user.type(screen.getByLabelText('Last name (required)'), 'Lee')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Handicap')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))
    await next(user, /Next: review/)

    await next(user, /^Add registration$/)

    expect(await screen.findByRole('heading', { name: 'Bowler', level: 2 })).toBeVisible()
    expect(screen.getByLabelText('USBC ID')).toHaveAccessibleDescription(
      /USBC Id is required for Handicap Divisions/,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'USBC Id is required for Handicap Divisions',
    )
  })

  it('shows a failed save as a toast and lets the desk try again', async () => {
    signIn()
    const served = serve({
      posts: [
        () => new HttpResponse(null, { status: 500 }),
        () =>
          HttpResponse.json(
            { registrationId: crypto.randomUUID(), mode: 'created' },
            { status: 201 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await startNew(user)
    await user.type(screen.getByLabelText('First name (required)'), 'Ann')
    await user.type(screen.getByLabelText('Last name (required)'), 'Lee')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))
    await next(user, /Next: review/)

    await next(user, /^Add registration$/)
    expect(await screen.findByText('Failed to save the registration (500)')).toBeVisible()
    await next(user, /^Add registration$/)

    expect(await screen.findByText('Registration added for Ann Lee')).toBeVisible()
    expect(served.posted).toHaveLength(2)
  })
})

describe('a stored bowler who is not registered here (BWL-15, REG-07, D-05, D-158)', () => {
  it('fills the form from the record, shows the change on Review, and sends only the change', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open()
    await pickMaria(user)

    expect(await screen.findByLabelText('Street')).toHaveValue('14 Elm Street')
    expect(screen.getByLabelText('USBC ID')).toHaveValue('1234-56789')
    expect(screen.getByText(/Using the bowler on file/)).toBeVisible()
    await user.clear(screen.getByLabelText('Street'))
    await user.type(screen.getByLabelText('Street'), '88 Pine Road')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Handicap')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))
    await next(user, /Next: review/)

    expect(screen.getByText('Street: 14 Elm Street → 88 Pine Road')).toBeVisible()
    await next(user, /^Add registration$/)

    await screen.findByText('Registration added for Maria Gonzalez')
    expect(served.posted[0]).toMatchObject({
      bowlerId: maria.id,
      bowler: { street: '88 Pine Road' },
      divisionId: handicap.id,
      squadIds: [morning.id],
    })
    expect(served.posted[0]).not.toHaveProperty('appendToExisting')
  })

  it('treats a cleared box as no change, never a clear (D-05)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open()
    await pickMaria(user)
    await user.clear(await screen.findByLabelText('Email'))
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))
    await next(user, /Next: review/)

    expect(screen.queryByText(/Changes to the bowler/)).not.toBeInTheDocument()
    await next(user, /^Add registration$/)

    await screen.findByText('Registration added for Maria Gonzalez')
    expect(served.posted[0]?.bowler).toEqual({})
  })

  it('goes back to the search with Pick someone else', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await pickMaria(user)

    await user.click(await screen.findByRole('button', { name: 'Pick someone else' }))

    expect(screen.getByRole('form', { name: 'Find a bowler' })).toBeVisible()
  })

  it('says so when the bowler is gone', async () => {
    signIn()
    serve()
    server.use(
      http.get('/v1/bowlers/:id', () =>
        HttpResponse.json({ message: 'Bowler not found' }, { status: 404 }),
      ),
    )
    const user = userEvent.setup()
    await open()
    await pickMaria(user)

    expect(await screen.findByText('That bowler is no longer on file.')).toBeVisible()
  })
})

describe('a bowler already registered here (REG-01, REG-10 to REG-14, D-159, D-160, D-165)', () => {
  const held: BowlerRegistration = {
    id: '00000000-0000-4000-8000-0000000000bb',
    divisionId: handicap.id,
    divisionName: 'Handicap',
    average: 182,
    superSweeper: false,
    squadIds: [morning.id],
    sweeperIds: [sweeper.id],
    hasScores: false,
  }
  const registered: BowlerResponse = { bowler: maria, registration: held }

  it('starts on Registration with the held squads locked, and sends only what is new (D-165, REG-11)', async () => {
    signIn()
    const served = serve({ bowler: registered })
    const user = userEvent.setup()
    await open()
    await pickMaria(user)

    expect(await screen.findByRole('heading', { name: 'Registration', level: 2 })).toBeVisible()
    expect(screen.getByText(/Maria Gonzalez is already registered/)).toBeVisible()
    const held = screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/)
    expect(held).toBeChecked()
    expect(held).toBeDisabled()
    expect(screen.getAllByText('Already entered')).toHaveLength(2)
    expect(screen.getByLabelText('Division (required)')).toHaveValue(handicap.id)
    expect(screen.getByLabelText('Average')).toHaveValue('182')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
    await next(user, /Next: review/)

    expect(
      screen.getByText(/Adds to the existing registration in Handicap, average 182\./),
    ).toBeVisible()
    expect(screen.getByText(/Squads: Sat 10\/24\/2026 1:00 PM\./)).toBeVisible()
    await next(user, /^Add to registration$/)

    await screen.findByText('Registration added for Maria Gonzalez')
    expect(served.posted).toEqual([
      {
        bowlerId: maria.id,
        divisionId: handicap.id,
        average: 182,
        squadIds: [afternoon.id],
        sweeperIds: [],
        superSweeper: false,
        bowler: {},
        appendToExisting: true,
      },
    ])
  })

  it('says a different division moves the registration, on Review (D-160)', async () => {
    signIn()
    serve({ bowler: registered })
    const user = userEvent.setup()
    await open()
    await pickMaria(user)
    await screen.findByRole('heading', { name: 'Registration', level: 2 })

    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
    await next(user, /Next: review/)

    expect(screen.getByText('Moves the registration from Handicap to Scratch.')).toBeVisible()
  })

  it('shows the API refusal of a move after scores, on the Registration step (REG-15, D-160)', async () => {
    signIn()
    serve({
      bowler: { ...registered, registration: { ...held, hasScores: true } },
      posts: [
        () =>
          HttpResponse.json(
            {
              message: 'Cannot change bowler division after scores have been recorded.',
              errors: {
                divisionId: 'Cannot change bowler division after scores have been recorded.',
              },
            },
            { status: 400 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await pickMaria(user)
    await screen.findByRole('heading', { name: 'Registration', level: 2 })
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
    await next(user, /Next: review/)

    await next(user, /^Add to registration$/)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot change bowler division after scores have been recorded.',
    )
    expect(screen.getByLabelText('Division (required)')).toHaveAccessibleDescription(
      /Cannot change bowler division/,
    )
  })

  it('lets the desk go back to the bowler details and send a change with the append (D-165)', async () => {
    signIn()
    const served = serve({ bowler: registered })
    const user = userEvent.setup()
    await open()
    await pickMaria(user)
    await screen.findByRole('heading', { name: 'Registration', level: 2 })
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))

    await user.click(screen.getByRole('button', { name: /Back to bowler details/ }))
    await user.clear(screen.getByLabelText('City'))
    await user.type(screen.getByLabelText('City'), 'Auburn')
    await next(user, /Next: registration/)
    expect(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/)).toBeChecked()
    await next(user, /Next: review/)
    expect(screen.getByText('City: Worcester → Auburn')).toBeVisible()
    await next(user, /^Add to registration$/)

    await screen.findByText('Registration added for Maria Gonzalez')
    expect(served.posted[0]).toMatchObject({ bowler: { city: 'Auburn' }, appendToExisting: true })
  })

  it('asks before it appends when the server finds a registration the desk did not see (D-159)', async () => {
    signIn()
    const served = serve({
      posts: [
        () =>
          HttpResponse.json(
            {
              message: 'Bowler is already registered for this tournament.',
              conflict: 'alreadyRegistered',
              existing: {
                registrationId: '00000000-0000-4000-8000-0000000000bb',
                divisionId: handicap.id,
                divisionName: 'Handicap',
                squadIds: [morning.id],
                sweeperIds: [],
              },
            },
            { status: 409 },
          ),
        () =>
          HttpResponse.json(
            { registrationId: crypto.randomUUID(), mode: 'appended' },
            { status: 201 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await pickMaria(user)
    await screen.findByLabelText('Street')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Handicap')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
    await next(user, /Next: review/)
    await next(user, /^Add registration$/)

    const dialog = await screen.findByRole('dialog', { name: 'Already registered' })
    expect(
      within(dialog).getByText(/already registered for this tournament in Handicap/),
    ).toBeVisible()
    expect(within(dialog).getByText('Squad: Sat 10/24/2026 1:00 PM')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Yes, add to registration' }))

    await screen.findByText('Registration added for Maria Gonzalez')
    expect(served.posted).toHaveLength(2)
    expect(served.posted[0]).not.toHaveProperty('appendToExisting')
    expect(served.posted[1]).toMatchObject({ appendToExisting: true, bowlerId: maria.id })
  })

  it('saves nothing when the desk says no at the fallback dialog (D-159)', async () => {
    signIn()
    const served = serve({
      posts: [
        () =>
          HttpResponse.json(
            {
              message: 'Bowler is already registered for this tournament.',
              conflict: 'alreadyRegistered',
              existing: {
                registrationId: '00000000-0000-4000-8000-0000000000bb',
                divisionId: handicap.id,
                divisionName: 'Handicap',
                squadIds: [],
                sweeperIds: [],
              },
            },
            { status: 409 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await pickMaria(user)
    await screen.findByLabelText('Street')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Handicap')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
    await next(user, /Next: review/)
    await next(user, /^Add registration$/)
    const dialog = await screen.findByRole('dialog', { name: 'Already registered' })

    await user.click(within(dialog).getByRole('button', { name: 'No, go back' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Already registered' })).not.toBeInTheDocument()
    })
    expect(served.posted).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Review', level: 2 })).toBeVisible()
  })
})

describe('a new bowler whose USBC ID is on file (BWL-15, D-161)', () => {
  it('offers the stored bowler, and Yes carries what was typed onto that bowler', async () => {
    signIn()
    const served = serve({
      posts: [
        () =>
          HttpResponse.json(
            {
              message: 'A bowler with this USBC ID is on file.',
              conflict: 'usbcIdOnFile',
              bowler: { id: maria.id, name: 'Maria Gonzalez' },
            },
            { status: 409 },
          ),
        () =>
          HttpResponse.json(
            { registrationId: crypto.randomUUID(), mode: 'created' },
            { status: 201 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'New bowler' }))
    await user.type(await screen.findByLabelText('First name (required)'), 'Mary')
    await user.type(screen.getByLabelText('Last name (required)'), 'Gonzalez')
    await user.type(screen.getByLabelText('Street'), '88 Pine Road')
    await user.type(screen.getByLabelText('USBC ID'), '1234-56789')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))
    await next(user, /Next: review/)
    await next(user, /^Add registration$/)

    const dialog = await screen.findByRole('dialog', {
      name: 'A bowler with this USBC ID is on file',
    })
    expect(within(dialog).getByText('Maria Gonzalez')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Yes, use this bowler' }))

    // The desk lands on Review with the typed street shown as a change to the stored bowler.
    expect(await screen.findByText('Street: 14 Elm Street → 88 Pine Road')).toBeVisible()
    expect(screen.getByText('First name: Maria → Mary')).toBeVisible()
    await next(user, /^Add registration$/)

    await screen.findByText('Registration added for Mary Gonzalez')
    expect(served.posted[1]).toMatchObject({
      bowlerId: maria.id,
      bowler: { firstName: 'Mary', street: '88 Pine Road' },
      divisionId: scratch.id,
      squadIds: [morning.id],
    })
  })

  it('returns to the Bowler step with a message on the USBC ID when the desk says no', async () => {
    signIn()
    serve({
      posts: [
        () =>
          HttpResponse.json(
            {
              message: 'A bowler with this USBC ID is on file.',
              conflict: 'usbcIdOnFile',
              bowler: { id: maria.id, name: 'Maria Gonzalez' },
            },
            { status: 409 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'New bowler' }))
    await user.type(await screen.findByLabelText('First name (required)'), 'Mary')
    await user.type(screen.getByLabelText('Last name (required)'), 'Gonzalez')
    await user.type(screen.getByLabelText('USBC ID'), '1234-56789')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))
    await next(user, /Next: review/)
    await next(user, /^Add registration$/)
    const dialog = await screen.findByRole('dialog', {
      name: 'A bowler with this USBC ID is on file',
    })

    await user.click(within(dialog).getByRole('button', { name: 'No, change the USBC ID' }))

    expect(await screen.findByRole('heading', { name: 'Bowler', level: 2 })).toBeVisible()
    expect(screen.getByLabelText('USBC ID')).toHaveAccessibleDescription(
      /belongs to another bowler/,
    )
  })
})

describe('opened from a lane page (REG-22, D-164)', () => {
  it('checks the squad and locks it, and still sends it', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open(`${url}?squad=${afternoon.id}`)
    await pickMaria(user)
    await screen.findByLabelText('Street')
    await next(user, /Next: registration/)

    const box = screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/)
    expect(box).toBeChecked()
    expect(box).toBeDisabled()
    expect(screen.getByText('Added from the lane page')).toBeVisible()
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await next(user, /Next: review/)
    await next(user, /^Add registration$/)

    await screen.findByText('Registration added for Maria Gonzalez')
    expect(served.posted[0]?.squadIds).toEqual([afternoon.id])
  })

  it('locks a sweeper the same way', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open(`${url}?sweeper=${sweeper.id}`)
    await user.click(screen.getByRole('button', { name: 'New bowler' }))
    await user.type(await screen.findByLabelText('First name (required)'), 'Ann')
    await user.type(screen.getByLabelText('Last name (required)'), 'Lee')
    await next(user, /Next: registration/)

    const box = screen.getByLabelText(/Sat 10\/24\/2026 12:00 PM/)
    expect(box).toBeChecked()
    expect(box).toBeDisabled()
  })
})

describe('a link that names a squad or sweeper this tournament lacks (REG-22)', () => {
  it('drops the unknown squad, so the desk must still pick a visible one', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open(`${url}?squad=${crypto.randomUUID()}`)
    await user.click(screen.getByRole('button', { name: 'New bowler' }))
    await user.type(await screen.findByLabelText('First name (required)'), 'Ann')
    await user.type(screen.getByLabelText('Last name (required)'), 'Lee')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')

    await next(user, /Next: review/)
    expect(screen.getByRole('alert')).toHaveTextContent('Bowler must enter at least one squad')

    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
    await next(user, /Next: review/)
    await next(user, /^Add registration$/)
    await screen.findByText('Registration added for Ann Lee')
    expect(served.posted[0]?.squadIds).toEqual([afternoon.id])
  })
})

describe('a stored bowler removed before the save (D-157)', () => {
  it('says the bowler is no longer on file, not that the tournament is missing', async () => {
    signIn()
    serve({
      posts: [() => HttpResponse.json({ message: 'Bowler not found' }, { status: 404 })],
    })
    const user = userEvent.setup()
    await open()
    await pickMaria(user)
    await screen.findByLabelText('Street')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
    await next(user, /Next: review/)
    await next(user, /^Add registration$/)

    expect(await screen.findByText(/That bowler is no longer on file/)).toBeVisible()
    expect(screen.queryByText('Tournament not found')).not.toBeInTheDocument()
  })
})

describe('who can reach it (D-157, D-130)', () => {
  it('shows a complete tournament a notice in place of the form', async () => {
    signIn()
    serve({ completed: true })
    renderApp(url)

    expect(await screen.findByText('This tournament is complete')).toBeVisible()
    expect(screen.queryByRole('form', { name: 'Find a bowler' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to registrations' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/registrations`,
    )
  })

  it('keeps a score keeper out', async () => {
    signIn('scoreKeeper')
    serve()
    renderApp(url)

    expect(await screen.findByText(/do not have access|not have permission/i)).toBeVisible()
    expect(screen.queryByRole('form', { name: 'Find a bowler' })).not.toBeInTheDocument()
  })
})

describe('the Add registration links (D-157, D-164)', () => {
  it('shows the link on the Registrations page to a director, and not to a score keeper', async () => {
    signIn()
    serve()
    const { unmount } = renderApp(`/tournaments/${tournament.id}/registrations`)

    expect(await screen.findByRole('link', { name: 'Add registration' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/registrations/new`,
    )
    unmount()

    signIn('scoreKeeper')
    renderApp(`/tournaments/${tournament.id}/registrations`)
    await screen.findByRole('heading', { name: 'Registrations', level: 1 })
    expect(screen.queryByRole('link', { name: 'Add registration' })).not.toBeInTheDocument()
  })

  it('hides the link on a complete tournament', async () => {
    signIn()
    serve({ completed: true })
    renderApp(`/tournaments/${tournament.id}/registrations`)

    await screen.findByRole('heading', { name: 'Registrations', level: 1 })
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Add registration' })).not.toBeInTheDocument()
    })
  })
})

async function startNewBowler(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'New bowler' }))
  await screen.findByRole('heading', { name: 'Bowler', level: 2 })
}

async function reachReview(user: ReturnType<typeof userEvent.setup>, first = 'Ann', last = 'Lee') {
  await startNewBowler(user)
  await user.type(screen.getByLabelText('First name (required)'), first)
  await user.type(screen.getByLabelText('Last name (required)'), last)
  await next(user, /Next: registration/)
  await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
  await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
  await next(user, /Next: review/)
}

describe('the page itself (D-164)', () => {
  it('titles the page with the tournament', async () => {
    signIn()
    serve()
    await open()

    expect(document.title).toBe('Add registration · Spring Open · Tournament Director')
  })

  it('shows a failed settings read with Try again, and recovers', async () => {
    signIn()
    serve()
    let failing = true
    server.use(
      http.get('/v1/tournaments/:id/settings', () =>
        failing
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ settings: createSettings() }),
      ),
    )
    const user = userEvent.setup()
    renderApp(url)
    await screen.findByRole('button', { name: 'Try again' }, { timeout: 4000 })

    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('form', { name: 'Find a bowler' })).toBeVisible()
  })

  it('shows a failed bowler read with Try again, and recovers', async () => {
    signIn()
    serve()
    let failing = true
    server.use(
      http.get('/v1/bowlers/:id', () =>
        failing
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ bowler: maria, registration: null }),
      ),
    )
    const user = userEvent.setup()
    await open()
    await user.type(screen.getByLabelText('Last name starts with'), 'Gon')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await user.click(await screen.findByRole('button', { name: /^Pick Maria Gonzalez/ }))
    const retry = await screen.findByRole('button', { name: 'Try again' }, { timeout: 4000 })

    failing = false
    await user.click(retry)

    expect(await screen.findByLabelText('Street')).toHaveValue('14 Elm Street')
  })

  it('offers Search again when the bowler is gone', async () => {
    signIn()
    serve()
    server.use(
      http.get('/v1/bowlers/:id', () =>
        HttpResponse.json({ message: 'Bowler not found' }, { status: 404 }),
      ),
    )
    const user = userEvent.setup()
    await open()
    await pickMaria(user)

    await user.click(await screen.findByRole('button', { name: 'Search again' }))

    expect(screen.getByRole('form', { name: 'Find a bowler' })).toBeVisible()
  })

  it('shows a failed squad list with Try again, and recovers', async () => {
    signIn()
    serve()
    let failing = true
    server.use(
      http.get('/v1/tournaments/:id/squads', () =>
        failing
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ squads: [morning, afternoon, finished] }),
      ),
    )
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'New bowler' }))
    const retry = await screen.findByRole('button', { name: 'Try again' }, { timeout: 4000 })

    failing = false
    await user.click(retry)

    expect(await screen.findByLabelText('First name (required)')).toBeVisible()
  })
})

describe('typing clears what was wrong (D-157)', () => {
  it('clears a bowler error from the box that was typed in, and keeps the others', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await startNewBowler(user)
    await next(user, /Next: registration/)
    expect(screen.getByLabelText('First name (required)')).toHaveAttribute('aria-invalid', 'true')

    await user.type(screen.getByLabelText('First name (required)'), 'A')

    expect(screen.getByLabelText('First name (required)')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Last name (required)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('clears the registration errors when the registration changes', async () => {
    signIn()
    serve({
      posts: [
        () =>
          HttpResponse.json(
            { message: 'x', errors: { squadIds: 'Invalid squad IDs' } },
            { status: 400 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await reachReview(user)
    await next(user, /^Add registration$/)
    await screen.findByRole('heading', { name: 'Registration', level: 2 })
    expect(
      screen.getByRole('group', { name: 'Squads (pick at least one)' }),
    ).toHaveAccessibleDescription('Invalid squad IDs')

    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))

    expect(screen.queryByText('Invalid squad IDs')).not.toBeInTheDocument()
  })

  it('moves focus to the box when its message in the summary is followed', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await startNewBowler(user)
    await next(user, /Next: registration/)

    await user.click(screen.getByRole('link', { name: 'Last Name is Required' }))

    expect(screen.getByLabelText('Last name (required)')).toHaveFocus()
  })

  it('counts one thing in the summary with the singular word', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await startNewBowler(user)
    await user.type(screen.getByLabelText('First name (required)'), 'Ann')

    await next(user, /Next: registration/)

    expect(screen.getByRole('alert')).toHaveTextContent('Fix 1 thing to save.')
  })
})

describe('saving (D-157, D-159)', () => {
  it('names a bowler with a suffix in the toast', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await startNewBowler(user)
    await user.type(screen.getByLabelText('First name (required)'), 'Ann')
    await user.type(screen.getByLabelText('Last name (required)'), 'Lee')
    await user.type(screen.getByLabelText('Suffix'), 'Jr')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
    await next(user, /Next: review/)
    await next(user, /^Add registration$/)

    expect(await screen.findByText('Registration added for Ann Lee, Jr')).toBeVisible()
  })

  it('says Saving… and disables the buttons while the save runs', async () => {
    signIn()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    serve()
    server.use(
      http.post('/v1/tournaments/:id/registrations', async () => {
        await gate
        return HttpResponse.json(
          { registrationId: crypto.randomUUID(), mode: 'created' },
          { status: 201 },
        )
      }),
    )
    const user = userEvent.setup()
    await open()
    await reachReview(user)

    await next(user, /^Add registration$/)

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    release()
    await screen.findByText('Registration added for Ann Lee')
  })

  it('goes back from Review to Registration with Back', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await reachReview(user)

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByRole('heading', { name: 'Registration', level: 2 })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('dismisses the failure toast', async () => {
    signIn()
    serve({ posts: [() => new HttpResponse(null, { status: 500 })] })
    const user = userEvent.setup()
    await open()
    await reachReview(user)
    await next(user, /^Add registration$/)
    const toast = await screen.findByRole('alert')

    await user.click(within(toast).getByRole('button'))

    await waitFor(() => {
      expect(screen.queryByText('Failed to save the registration (500)')).not.toBeInTheDocument()
    })
  })

  it('shows a refusal with no field named as a message on the form (D-130)', async () => {
    signIn()
    serve({
      posts: [
        () =>
          HttpResponse.json(
            { message: 'This tournament is complete.', errors: {} },
            { status: 409 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await reachReview(user)

    await next(user, /^Add registration$/)

    expect(await screen.findByRole('alert')).toHaveTextContent('This tournament is complete.')
    expect(screen.getByRole('heading', { name: 'Review', level: 2 })).toBeVisible()
  })

  it('sends a refusal with a field on the form back to the step that holds it (REG-04)', async () => {
    signIn()
    serve({
      posts: [
        () =>
          HttpResponse.json(
            {
              message: 'x',
              errors: { average: 'Minimum average requirement for division not met' },
            },
            { status: 400 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await reachReview(user)

    await next(user, /^Add registration$/)

    expect(await screen.findByRole('heading', { name: 'Registration', level: 2 })).toBeVisible()
    expect(screen.getByLabelText('Average')).toHaveAccessibleDescription(
      'Minimum average requirement for division not met',
    )
  })

  it('shows a failure inside the already-registered dialog when the confirmed save fails (D-159)', async () => {
    signIn()
    const conflict = () =>
      HttpResponse.json(
        {
          message: 'Bowler is already registered for this tournament.',
          conflict: 'alreadyRegistered',
          existing: {
            registrationId: '00000000-0000-4000-8000-0000000000bb',
            divisionId: handicap.id,
            divisionName: 'Handicap',
            squadIds: [],
            sweeperIds: [],
          },
        },
        { status: 409 },
      )
    serve({
      posts: [
        conflict,
        () => new HttpResponse(null, { status: 500 }),
        conflict,
        () => new HttpResponse(null, { status: 500 }),
      ],
    })
    const user = userEvent.setup()
    await open()
    await pickMaria(user)
    await screen.findByLabelText('Street')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Handicap')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
    await next(user, /Next: review/)
    await next(user, /^Add registration$/)
    const dialog = await screen.findByRole('dialog', { name: 'Already registered' })

    await user.click(within(dialog).getByRole('button', { name: 'Yes, add to registration' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Failed to save the registration (500)',
    )
    expect(within(dialog).getByRole('button', { name: 'Yes, add to registration' })).toBeEnabled()
  })

  it('lists the new sweepers too in the already-registered dialog (D-159)', async () => {
    signIn()
    serve({
      posts: [
        () =>
          HttpResponse.json(
            {
              message: 'x',
              conflict: 'alreadyRegistered',
              existing: {
                registrationId: '00000000-0000-4000-8000-0000000000bb',
                divisionId: handicap.id,
                divisionName: 'Handicap',
                squadIds: [],
                sweeperIds: [],
              },
            },
            { status: 409 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await pickMaria(user)
    await screen.findByLabelText('Street')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Handicap')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 12:00 PM/))
    await next(user, /Next: review/)
    await next(user, /^Add registration$/)

    const dialog = await screen.findByRole('dialog', { name: 'Already registered' })

    expect(within(dialog).getByText('Sweeper: Sat 10/24/2026 12:00 PM')).toBeVisible()
  })
})

describe('keeping what the desk typed when the bowler is switched (D-161)', () => {
  it('carries the division, the average, and the super sweeper onto the stored bowler', async () => {
    signIn()
    const served = serve({
      posts: [
        () =>
          HttpResponse.json(
            {
              message: 'on file',
              conflict: 'usbcIdOnFile',
              bowler: { id: maria.id, name: 'Maria Gonzalez' },
            },
            { status: 409 },
          ),
        () =>
          HttpResponse.json(
            { registrationId: crypto.randomUUID(), mode: 'created' },
            { status: 201 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await startNewBowler(user)
    await user.type(screen.getByLabelText('First name (required)'), 'Maria')
    await user.type(screen.getByLabelText('Last name (required)'), 'Gonzalez')
    await user.type(screen.getByLabelText('USBC ID'), '1234-56789')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await user.type(screen.getByLabelText('Average'), '201')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 12:00 PM/))
    await user.click(screen.getByLabelText('Super sweeper', { exact: false }))
    await next(user, /Next: review/)
    await next(user, /^Add registration$/)
    const dialog = await screen.findByRole('dialog', {
      name: 'A bowler with this USBC ID is on file',
    })

    await user.click(within(dialog).getByRole('button', { name: 'Yes, use this bowler' }))

    await screen.findByRole('heading', { name: 'Review', level: 2 })
    expect(screen.getByText(/in Scratch, average 201/)).toBeVisible()
    expect(screen.getByText(/Super sweeper\./)).toBeVisible()
    await next(user, /^Add registration$/)
    await screen.findByText('Registration added for Maria Gonzalez')
    expect(served.posted[1]).toMatchObject({
      bowlerId: maria.id,
      divisionId: scratch.id,
      average: 201,
      sweeperIds: [sweeper.id],
      superSweeper: true,
    })
  })

  it('keeps the held squads and the stored division of a registered bowler it switches to', async () => {
    signIn()
    const registeredMaria: BowlerResponse = {
      bowler: maria,
      registration: {
        id: '00000000-0000-4000-8000-0000000000bb',
        divisionId: handicap.id,
        divisionName: 'Handicap',
        average: 182,
        superSweeper: false,
        squadIds: [morning.id],
        sweeperIds: [],
        hasScores: false,
      },
    }
    const served = serve({
      bowler: registeredMaria,
      posts: [
        () =>
          HttpResponse.json(
            {
              message: 'on file',
              conflict: 'usbcIdOnFile',
              bowler: { id: maria.id, name: 'Maria Gonzalez' },
            },
            { status: 409 },
          ),
        () =>
          HttpResponse.json(
            { registrationId: crypto.randomUUID(), mode: 'appended' },
            { status: 201 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await startNewBowler(user)
    await user.type(screen.getByLabelText('First name (required)'), 'Maria')
    await user.type(screen.getByLabelText('Last name (required)'), 'Gonzalez')
    await user.type(screen.getByLabelText('USBC ID'), '1234-56789')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Handicap')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/))
    await next(user, /Next: review/)
    await next(user, /^Add registration$/)
    const dialog = await screen.findByRole('dialog', {
      name: 'A bowler with this USBC ID is on file',
    })

    await user.click(within(dialog).getByRole('button', { name: 'Yes, use this bowler' }))

    await screen.findByRole('heading', { name: 'Review', level: 2 })
    expect(
      screen.getByText(/Adds to the existing registration in Handicap, average 182/),
    ).toBeVisible()
    await next(user, /^Add to registration$/)
    await screen.findByText('Registration added for Maria Gonzalez')
    expect(served.posted[1]).toMatchObject({
      appendToExisting: true,
      squadIds: [afternoon.id],
    })
  })
})

describe('the steps of a bowler already registered (D-165)', () => {
  const heldRegistration: BowlerRegistration = {
    id: '00000000-0000-4000-8000-0000000000bb',
    divisionId: handicap.id,
    divisionName: 'Handicap',
    average: null,
    superSweeper: true,
    squadIds: [morning.id],
    sweeperIds: [sweeper.id],
    hasScores: false,
  }

  it('shows an empty average box when none is stored, and the super sweeper ticked', async () => {
    signIn()
    serve({ bowler: { bowler: maria, registration: heldRegistration } })
    const user = userEvent.setup()
    await open()
    await pickMaria(user)

    expect(await screen.findByLabelText('Average')).toHaveValue('')
    expect(screen.getByLabelText('Super sweeper', { exact: false })).toBeChecked()
  })

  it('has no progress button for a step that has not been reached', async () => {
    signIn()
    serve({ bowler: { bowler: maria, registration: heldRegistration } })
    const user = userEvent.setup()
    await open()
    await pickMaria(user)
    await screen.findByRole('heading', { name: 'Registration', level: 2 })

    expect(screen.getByRole('button', { name: '1. Bowler' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '3. Review' })).not.toBeInTheDocument()
    expect(screen.getByText('3. Review')).toBeVisible()
    expect(screen.getByText('2. Registration')).toHaveAttribute('aria-current', 'step')
  })

  it('keeps a squad from the lane page and a sweeper from it, with those held', async () => {
    signIn()
    serve({ bowler: { bowler: maria, registration: heldRegistration } })
    const user = userEvent.setup()
    await open(`${url}?squad=${afternoon.id}&sweeper=${sweeper.id}`)
    await pickMaria(user)
    await screen.findByRole('heading', { name: 'Registration', level: 2 })

    expect(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/)).toBeChecked()
    expect(screen.getByLabelText(/Sat 10\/24\/2026 12:00 PM/)).toBeDisabled()
  })
})

describe('what to collect, on every way in (D-166, D-164)', () => {
  it('shows the locked squad from the lane page with its fee in the total (REG-22)', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open(`${url}?squad=${afternoon.id}`)
    await pickMaria(user)
    await screen.findByLabelText('Street')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await next(user, /Next: review/)

    expect(screen.getByRole('table', { name: 'What to collect' })).toBeVisible()
    expect(screen.getByRole('row', { name: 'Squad Sat 10/24/2026 1:00 PM $60.00' })).toBeVisible()
    expect(screen.getByRole('row', { name: 'Total to collect $60.00' })).toBeVisible()
  })

  it('adds the picked squad to the lane-page squad for a new bowler', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open(`${url}?squad=${afternoon.id}`)
    await user.click(screen.getByRole('button', { name: 'New bowler' }))
    await user.type(await screen.findByLabelText('First name (required)'), 'Ann')
    await user.type(screen.getByLabelText('Last name (required)'), 'Lee')
    await next(user, /Next: registration/)
    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Scratch')
    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))
    await next(user, /Next: review/)

    expect(screen.getByRole('row', { name: 'Total to collect $110.00' })).toBeVisible()
  })

  it('collects only for what is added when a registered bowler adds a squad from the lane page (REG-21)', async () => {
    signIn()
    serve({
      bowler: {
        bowler: maria,
        registration: {
          id: '00000000-0000-4000-8000-0000000000bb',
          divisionId: handicap.id,
          divisionName: 'Handicap',
          average: 182,
          superSweeper: false,
          squadIds: [morning.id],
          sweeperIds: [],
          hasScores: false,
        },
      },
    })
    const user = userEvent.setup()
    await open(`${url}?squad=${afternoon.id}`)
    await pickMaria(user)
    await screen.findByRole('heading', { name: 'Registration', level: 2 })
    await next(user, /Next: review/)

    const table = screen.getByRole('table', { name: 'What to collect for these additions' })
    expect(within(table).queryByText(/9:00 AM/)).not.toBeInTheDocument()
    expect(within(table).getByRole('row', { name: 'Total to collect $60.00' })).toBeVisible()
  })
})

describe('leaving the add page with changes', () => {
  it('asks once a name is typed, and not for a form left as it started', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'New bowler' }))
    await screen.findByRole('heading', { name: 'Bowler', level: 2 })
    await user.click(screen.getByRole('link', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).not.toBeInTheDocument()
  })

  it('asks after a name is typed', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'New bowler' }))
    await user.type(await screen.findByLabelText('First name (required)'), 'Ann')

    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
  })

  it('asks after the stored email of a picked bowler is cleared', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await pickMaria(user)
    await user.clear(await screen.findByLabelText('Email'))

    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
  })
})
