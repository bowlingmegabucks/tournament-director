import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import {
  createDivision,
  createEditInfo,
  createSettings,
  createSignedInUser,
  createSquad,
  createSweeper,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { EditInfo, EditRegistrationRequest } from './types'

const tournament = createTournament({ name: 'Spring Open' })
const scratch = createDivision({ number: 1, name: 'Scratch' })
const handicap = createDivision({ number: 2, name: 'Handicap', handicapPercentage: 90 })
const morning = createSquad({ date: '2026-10-24T09:00:00', entryFee: 75 })
const afternoon = createSquad({ date: '2026-10-24T13:00:00', entryFee: 80 })
const finished = createSquad({ date: '2026-10-23T18:00:00', complete: true })
const noon = createSweeper({ date: '2026-10-24T12:00:00', entryFee: 20 })
const early = createSweeper({ date: '2026-10-25T08:00:00', entryFee: 25 })
const registrationId = '00000000-0000-4000-8000-0000000000bb'
const url = `/tournaments/${tournament.id}/registrations/${registrationId}/edit`

function info(overrides: Parameters<typeof createEditInfo>[0] = {}): EditInfo {
  return createEditInfo({
    ...overrides,
    registration: {
      id: registrationId,
      divisionId: handicap.id,
      average: 182,
      squadIds: [morning.id],
      sweeperIds: [noon.id],
      ...overrides.registration,
    },
  })
}

interface Options {
  completed?: boolean
  info?: EditInfo
  /** Answers each PATCH in turn; the last one repeats. */
  patches?: (() => Response)[]
  /** Answers each read of the registration in turn; the last one repeats. */
  reads?: EditInfo[]
  readStatus?: number
}

interface Served {
  patched: EditRegistrationRequest[]
  reads: number
}

function serve(options: Options = {}): Served {
  const served: Served = { patched: [], reads: 0 }
  const answers = options.patches ?? [
    () => HttpResponse.json({ registrationId, added: 0, removed: 0 }),
  ]
  const reads = options.reads ?? [options.info ?? info()]
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
    http.get('/v1/tournaments/:id/sweepers', () => HttpResponse.json({ sweepers: [noon, early] })),
    http.get('/v1/tournaments/:id/registrations', () =>
      HttpResponse.json({
        registrations: [],
        summary: { registrations: 0, superSweepers: 0, divisions: [], squads: [], sweepers: [] },
      }),
    ),
    http.get('/v1/tournaments/:id/registrations/:registrationId/edit-info', () => {
      served.reads += 1
      if (options.readStatus) return new HttpResponse(null, { status: options.readStatus })
      return HttpResponse.json(reads[Math.min(served.reads, reads.length) - 1])
    }),
    http.patch('/v1/tournaments/:id/registrations/:registrationId', async ({ request }) => {
      served.patched.push((await request.json()) as EditRegistrationRequest)
      const answer = answers[Math.min(served.patched.length, answers.length) - 1]
      return answer ? answer() : new HttpResponse(null, { status: 500 })
    }),
  )
  return served
}

const signIn = (role: 'director' | 'scoreKeeper' = 'director') => {
  setMockUser(createSignedInUser({ roles: [role] }))
}

async function open() {
  renderApp(url)
  await screen.findByRole('heading', { name: 'Edit registration', level: 1 })
  await screen.findByRole('group', { name: 'Registration' })
}

const box = (name: RegExp) => screen.getByRole('checkbox', { name })
const press = (user: ReturnType<typeof userEvent.setup>, name: string | RegExp) =>
  user.click(screen.getByRole('button', { name }))

describe('the edit page opens (REG-25, D-197, D-198)', () => {
  it('starts on Registration with what is stored, and marks the entered sessions (REG-21)', async () => {
    signIn()
    serve()
    await open()

    expect(screen.getByRole('heading', { name: 'Registration', level: 2 })).toBeVisible()
    expect(screen.getByLabelText('Division (required)')).toHaveValue(handicap.id)
    expect(screen.getByLabelText('Average')).toHaveValue('182')
    expect(box(/9:00 AM/)).toBeChecked()
    expect(box(/9:00 AM/)).toBeEnabled()
    expect(box(/1:00 PM/)).not.toBeChecked()
    expect(box(/12:00 PM/)).toBeChecked()
    expect(screen.getAllByText('Entered')).toHaveLength(2)
    expect(screen.getByText(/Editing/)).toHaveTextContent('Maria Gonzalez')
  })

  it('shows a complete squad the bowler is not in as closed (REG-33)', async () => {
    signIn()
    serve()
    await open()

    expect(box(/6:00 PM/)).toBeDisabled()
    expect(screen.getByText('Complete')).toBeVisible()
  })

  it('refuses a score keeper (D-198)', async () => {
    signIn('scoreKeeper')
    serve()

    renderApp(url)

    expect(await screen.findByText(/permission/i)).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Edit registration' })).not.toBeInTheDocument()
  })

  it('shows a notice for a complete tournament and no form (D-130)', async () => {
    signIn()
    serve({ completed: true })

    renderApp(url)

    expect(await screen.findByText('This tournament is complete')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to registrations' })).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Registration' })).not.toBeInTheDocument()
  })

  it('says so when the registration is not found (REG-30)', async () => {
    signIn()
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/settings', () =>
        HttpResponse.json({ settings: createSettings() }),
      ),
      http.get('/v1/tournaments/:id/registrations/:registrationId/edit-info', () =>
        HttpResponse.json({ message: 'Registration not found' }, { status: 404 }),
      ),
      http.get('/v1/tournaments/:id/divisions', () => HttpResponse.json({ divisions: [] })),
      http.get('/v1/tournaments/:id/squads', () => HttpResponse.json({ squads: [] })),
      http.get('/v1/tournaments/:id/sweepers', () => HttpResponse.json({ sweepers: [] })),
    )

    renderApp(url)

    expect(await screen.findByRole('alert')).toHaveTextContent('Registration not found')
    expect(screen.getByRole('link', { name: 'Back to registrations' })).toBeVisible()
  })

  it('shows an error with a retry when the read fails, and recovers', async () => {
    signIn()
    const reads = [info()]
    // The read tries twice before it gives up, so the first two answers fail.
    let failures = 2
    serve({ reads })
    server.use(
      http.get('/v1/tournaments/:id/registrations/:registrationId/edit-info', () => {
        if (failures > 0) {
          failures -= 1
          return new HttpResponse(null, { status: 500 })
        }
        return HttpResponse.json(reads[0])
      }),
    )
    const user = userEvent.setup()

    renderApp(url)
    // The read waits a moment before its one retry, so the error takes a little longer to show.
    await user.click(await screen.findByRole('button', { name: 'Try again' }, { timeout: 4000 }))

    expect(await screen.findByRole('group', { name: 'Registration' })).toBeVisible()
  })
})

describe('what is locked and why (REG-34, REG-15, REG-18, D-10, D-110, D-205)', () => {
  it('disables a session with scores and says why', async () => {
    signIn()
    serve({ info: info({ locks: { scoredSessionIds: [morning.id], hasScores: true } }) })
    await open()

    expect(box(/9:00 AM/)).toBeDisabled()
    expect(box(/9:00 AM/)).toBeChecked()
    expect(box(/9:00 AM/)).toHaveAccessibleDescription(
      'Cannot remove: this bowler has scores here.',
    )
    expect(box(/1:00 PM/)).toBeEnabled()
  })

  it('locks the division once any score exists (REG-15)', async () => {
    signIn()
    serve({ info: info({ locks: { hasScores: true } }) })
    await open()

    expect(screen.getByLabelText('Division (required)')).toBeDisabled()
    expect(screen.getByLabelText('Division (required)')).toHaveAccessibleDescription(
      'Cannot change after scores have been recorded.',
    )
  })

  it('locks super sweeper after a sweeper score (REG-18, D-110)', async () => {
    signIn()
    serve({
      info: info({ registration: { superSweeper: true }, locks: { hasSweeperScores: true } }),
    })
    await open()

    const superSweeper = screen.getByRole('checkbox', { name: /Super sweeper/ })
    expect(superSweeper).toBeChecked()
    expect(superSweeper).toBeDisabled()
    expect(superSweeper).toHaveAccessibleDescription(
      'Cannot change: this bowler has sweeper scores.',
    )
  })

  it('locks a complete squad the bowler holds (D-10)', async () => {
    signIn()
    serve({ info: info({ registration: { squadIds: [morning.id, finished.id] } }) })
    await open()

    expect(box(/6:00 PM/)).toBeDisabled()
    expect(box(/6:00 PM/)).toBeChecked()
    expect(box(/6:00 PM/)).toHaveAccessibleDescription('Cannot remove: this one is complete.')
  })
})

describe('adding a squad or sweeper (REG-21, D-199, D-200)', () => {
  it('sends only the addition, shows the fee to collect, and returns to the list with a toast', async () => {
    signIn()
    const served = serve({
      patches: [() => HttpResponse.json({ registrationId, added: 1, removed: 0 })],
    })
    const user = userEvent.setup()
    await open()

    await user.click(box(/1:00 PM/))
    await press(user, /Next: review/)

    expect(
      screen.getByRole('table', { name: 'What to collect for the added entries' }),
    ).toBeVisible()
    expect(screen.getByText('Net: collect $80.00.')).toBeVisible()
    expect(screen.queryByRole('checkbox', { name: /I understand/ })).not.toBeInTheDocument()
    await press(user, 'Save changes')

    expect(await screen.findByText('Maria Gonzalez: Registration updated. Added 1.')).toBeVisible()
    expect(served.patched).toEqual([{ addSquadIds: [afternoon.id] }])
    expect(screen.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
  })

  it('adds a sweeper and turns on super sweeper in one save (REG-17)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open()

    await user.click(box(/8:00 AM/))
    await user.click(screen.getByRole('checkbox', { name: /Super sweeper/ }))
    await press(user, /Next: review/)

    expect(screen.getByText('Super sweeper: turned on.')).toBeVisible()
    await press(user, 'Save changes')

    await waitFor(() => {
      expect(served.patched).toEqual([{ addSweeperIds: [early.id], superSweeper: true }])
    })
  })
})

describe('removing and switching (REG-20, D-203, D-207)', () => {
  it('needs a tick before it saves a removal, then sends only the removal (D-207)', async () => {
    signIn()
    const served = serve({
      info: info({ registration: { squadIds: [morning.id, afternoon.id] } }),
      patches: [() => HttpResponse.json({ registrationId, added: 0, removed: 1 })],
    })
    const user = userEvent.setup()
    await open()

    await user.click(box(/1:00 PM/))
    await press(user, /Next: review/)

    expect(screen.getByRole('table', { name: /Refund may be due/ })).toBeVisible()
    expect(screen.getByText('Net: refund $80.00.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /I understand/ }))
    await press(user, 'Save changes')

    expect(
      await screen.findByText('Maria Gonzalez: Registration updated. Removed 1.'),
    ).toBeVisible()
    expect(served.patched).toEqual([{ removeSquadIds: [afternoon.id] }])
  })

  it('switches a squad: both lines, a net, one save with both lists (D-202)', async () => {
    signIn()
    const served = serve({
      patches: [() => HttpResponse.json({ registrationId, added: 1, removed: 1 })],
    })
    const user = userEvent.setup()
    await open()

    await user.click(box(/9:00 AM/))
    await user.click(box(/1:00 PM/))
    await press(user, /Next: review/)

    expect(screen.getByText('Net: collect $5.00.')).toBeVisible()
    await user.click(screen.getByRole('checkbox', { name: /I understand/ }))
    await press(user, 'Save changes')

    expect(
      await screen.findByText('Maria Gonzalez: Registration updated. Added 1, removed 1.'),
    ).toBeVisible()
    expect(served.patched).toEqual([{ addSquadIds: [afternoon.id], removeSquadIds: [morning.id] }])
  })

  it('takes the tick away when the choice changes', async () => {
    signIn()
    serve({ info: info({ registration: { squadIds: [morning.id, afternoon.id] } }) })
    const user = userEvent.setup()
    await open()
    await user.click(box(/1:00 PM/))
    await press(user, /Next: review/)
    await user.click(screen.getByRole('checkbox', { name: /I understand/ }))
    await press(user, 'Back')

    await user.click(box(/1:00 PM/))
    await user.click(box(/1:00 PM/))
    await press(user, /Next: review/)

    expect(screen.getByRole('checkbox', { name: /I understand/ })).not.toBeChecked()
  })

  it('refuses to leave no squad before it asks the server (REG-03, D-04)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open()

    await user.click(box(/9:00 AM/))
    await press(user, /Next: review/)

    expect(screen.getByRole('alert')).toHaveTextContent('Bowler must enter at least one squad')
    expect(screen.getByRole('heading', { name: 'Registration', level: 2 })).toBeVisible()
    expect(served.patched).toHaveLength(0)
  })
})

describe('division and average (REG-15, REG-16, D-201, D-205)', () => {
  it('sends a new division and says it moves', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open()

    await user.selectOptions(screen.getByLabelText('Division (required)'), scratch.id)
    await press(user, /Next: review/)

    expect(screen.getByText('Moves the registration from Handicap to Scratch.')).toBeVisible()
    await press(user, 'Save changes')

    await waitFor(() => {
      expect(served.patched).toEqual([{ divisionId: scratch.id }])
    })
  })

  it('clears the average with a blank box (REG-16)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open()

    await user.clear(screen.getByLabelText('Average'))
    await press(user, /Next: review/)

    expect(screen.getByText('Average: 182 → (cleared)')).toBeVisible()
    await press(user, 'Save changes')

    await waitFor(() => {
      expect(served.patched).toEqual([{ average: null }])
    })
  })

  it('checks the average range before it asks the server (REG-16)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open()

    await user.clear(screen.getByLabelText('Average'))
    await user.type(screen.getByLabelText('Average'), '301')
    await press(user, /Next: review/)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Average must be less than or equal to 300.',
    )
    expect(served.patched).toHaveLength(0)
  })

  it('asks the director to confirm a new average once scores exist, then resends with the flag (D-201)', async () => {
    signIn()
    const served = serve({
      info: info({ locks: { hasScores: true } }),
      patches: [
        () =>
          HttpResponse.json(
            {
              message: 'Confirm these changes to save them.',
              warnings: [
                {
                  field: 'average',
                  message: 'This bowler has scores. Handicap and results will change.',
                },
              ],
            },
            { status: 409 },
          ),
        () => HttpResponse.json({ registrationId, added: 0, removed: 0 }),
      ],
    })
    const user = userEvent.setup()
    await open()

    await user.clear(screen.getByLabelText('Average'))
    await user.type(screen.getByLabelText('Average'), '175')
    await press(user, /Next: review/)
    await press(user, 'Save changes')

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Handicap and results will change/)).toBeVisible()
    expect(within(dialog).getByText('Average: 182 → 175')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))

    expect(await screen.findByText('Maria Gonzalez: Registration updated.')).toBeVisible()
    expect(served.patched).toEqual([{ average: 175 }, { average: 175, confirmWarnings: true }])
  })
})

describe('the bowler (BWL-16, D-206)', () => {
  it('shows an emptied box as cleared and sends it as an empty string', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open()

    await press(user, 'Back to bowler details')
    await user.clear(screen.getByLabelText('Phone'))
    await press(user, /Next: registration/)
    await press(user, /Next: review/)

    expect(screen.getByText('Phone: 5085550142 → (cleared)')).toBeVisible()
    await press(user, 'Save changes')

    await waitFor(() => {
      expect(served.patched).toEqual([{ bowler: { phoneNumber: '' } }])
    })
  })

  it('does not accept an empty name (BWL-01)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open()

    await press(user, 'Back to bowler details')
    await user.clear(screen.getByLabelText('First name (required)'))
    await press(user, /Next: registration/)

    expect(screen.getByRole('alert')).toHaveTextContent('First Name is Required')
    expect(served.patched).toHaveLength(0)
  })
})

describe('what the server refuses (REG-34, REG-35, D-203)', () => {
  it('returns to the step that holds the field with the message', async () => {
    signIn()
    serve({
      patches: [
        () =>
          HttpResponse.json(
            {
              message: 'Remove the Super Sweeper first, then remove this sweeper.',
              errors: { superSweeper: 'Remove the Super Sweeper first, then remove this sweeper.' },
            },
            { status: 400 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await user.click(box(/12:00 PM/))
    await press(user, /Next: review/)
    await user.click(screen.getByRole('checkbox', { name: /I understand/ }))

    await press(user, 'Save changes')

    expect(await screen.findAllByText(/Remove the Super Sweeper first/)).not.toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Registration', level: 2 })).toBeVisible()
  })

  it('sends a bowler field error back to the Bowler step', async () => {
    signIn()
    serve({
      patches: [
        () =>
          HttpResponse.json(
            { message: 'Invalid Email', errors: { 'bowler.email': 'Invalid Email' } },
            { status: 400 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await press(user, 'Back to bowler details')
    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'nope')
    await press(user, /Next: registration/)
    await press(user, /Next: review/)

    await press(user, 'Save changes')

    expect(await screen.findByRole('heading', { name: 'Bowler', level: 2 })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid Email')
  })

  it('shows a toast for a failure with no field, such as a server error', async () => {
    signIn()
    serve({ patches: [() => new HttpResponse(null, { status: 500 })] })
    const user = userEvent.setup()
    await open()
    await user.click(box(/1:00 PM/))
    await press(user, /Next: review/)

    await press(user, 'Save changes')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to save the registration (500)',
    )
  })
})

describe('a record that changed since it was read (D-199)', () => {
  it('says so, shows what is entered now, and a reload starts the form over', async () => {
    signIn()
    const changed = info({ registration: { squadIds: [morning.id, afternoon.id] } })
    const served = serve({
      reads: [info(), changed],
      patches: [
        () =>
          HttpResponse.json(
            {
              message: 'This registration changed. Review and save again.',
              conflict: 'changed',
              existing: {
                registrationId,
                divisionId: handicap.id,
                divisionName: 'Handicap',
                squadIds: [morning.id, afternoon.id],
                sweeperIds: [noon.id],
              },
            },
            { status: 409 },
          ),
      ],
    })
    const user = userEvent.setup()
    await open()
    await user.click(box(/1:00 PM/))
    await press(user, /Next: review/)

    await press(user, 'Save changes')

    const notice = await screen.findByText('This registration changed.')
    expect(notice).toBeVisible()
    expect(screen.getByText(/Now entered: Squad .*9:00 AM.*Squad .*1:00 PM/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Reload registration' }))

    await waitFor(() => {
      expect(served.reads).toBe(2)
    })
    await screen.findByRole('group', { name: 'Registration' })
    expect(screen.queryByText('This registration changed.')).not.toBeInTheDocument()
    expect(box(/1:00 PM/)).toBeChecked()
  })
})

describe('nothing changed', () => {
  it('says so on Review and does not offer a save', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await open()

    await press(user, /Next: review/)

    expect(screen.getByText(/No changes yet/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(served.patched).toHaveLength(0)
  })
})

describe('the page frame (D-197)', () => {
  it('sets the page title, and the not-found page links back to the list', async () => {
    signIn()
    serve()
    await open()

    await waitFor(() => {
      expect(document.title).toBe('Edit registration · Spring Open · Tournament Director')
    })
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/registrations`,
    )
  })

  it('links the complete-tournament notice back to the list', async () => {
    signIn()
    serve({ completed: true })

    renderApp(url)

    expect(await screen.findByRole('link', { name: 'Back to registrations' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/registrations`,
    )
  })

  it('shows the bowler with a suffix, and trims the names', async () => {
    signIn()
    serve({
      info: info({ bowler: { firstName: ' Maria ', lastName: ' Gonzalez ', suffix: ' Jr ' } }),
    })
    await open()

    expect(screen.getByText(/Editing/)).toHaveTextContent('Editing Maria Gonzalez, Jr.')
  })
})

describe('what a failed save shows (D-197, D-201)', () => {
  const average = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.clear(screen.getByLabelText('Average'))
    await user.type(screen.getByLabelText('Average'), '175')
    await press(user, /Next: review/)
  }
  const warn = () =>
    HttpResponse.json(
      {
        message: 'Confirm these changes to save them.',
        warnings: [
          {
            field: 'average',
            message: 'This bowler has scores. Handicap and results will change.',
          },
          { field: 'other', message: 'Something else.' },
        ],
      },
      { status: 409 },
    )

  it('lets the director go back from the warnings, and shows a failed confirm inside the dialog', async () => {
    signIn()
    const served = serve({
      info: info({ locks: { hasScores: true } }),
      patches: [warn, () => new HttpResponse(null, { status: 500 })],
    })
    const user = userEvent.setup()
    await open()
    await average(user)
    await press(user, 'Save changes')

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Something else.')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Failed to save the registration (500)',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Go back' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Review', level: 2 })).toBeVisible()
    expect(served.patched).toHaveLength(2)
  })

  it.each([
    ['an average that was not set', null, '175', 'Average: not set → 175'],
    ['an average that is cleared', 182, '', 'Average: 182 → cleared'],
    ['an average with spaces around it', 182, ' 175 ', 'Average: 182 → 175'],
  ])('names the change in the warnings dialog for %s', async (_name, was, typed, text) => {
    signIn()
    serve({
      info: info({ registration: { average: was }, locks: { hasScores: true } }),
      patches: [warn],
    })
    const user = userEvent.setup()
    await open()
    await user.clear(screen.getByLabelText('Average'))
    if (typed !== '') await user.type(screen.getByLabelText('Average'), typed)
    await press(user, /Next: review/)
    await press(user, 'Save changes')

    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(text)).toBeVisible()
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2)
    expect(within(dialog).queryByText('Average: Something else.')).not.toBeInTheDocument()
  })

  it('clears the failure in the dialog when the director tries again', async () => {
    signIn()
    serve({
      info: info({ locks: { hasScores: true } }),
      patches: [
        warn,
        () => new HttpResponse(null, { status: 500 }),
        () => HttpResponse.json({ registrationId, added: 0, removed: 0 }),
      ],
    })
    const user = userEvent.setup()
    await open()
    await average(user)
    await press(user, 'Save changes')
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))
    await within(dialog).findByRole('alert')

    await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))

    expect(await screen.findByText('Maria Gonzalez: Registration updated.')).toBeVisible()
  })

  it('says the registration no longer exists, and the toast can be dismissed', async () => {
    signIn()
    serve({
      patches: [() => HttpResponse.json({ message: 'Registration not found' }, { status: 404 })],
    })
    const user = userEvent.setup()
    await open()
    await user.click(box(/1:00 PM/))
    await press(user, /Next: review/)

    await press(user, 'Save changes')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This registration no longer exists.',
    )
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('This registration no longer exists.')).not.toBeInTheDocument()
  })

  it('shows a refusal with no field on the Review step', async () => {
    signIn()
    serve({
      patches: [
        () => HttpResponse.json({ message: 'This tournament is complete.' }, { status: 409 }),
      ],
    })
    const user = userEvent.setup()
    await open()
    await user.click(box(/1:00 PM/))
    await press(user, /Next: review/)

    await press(user, 'Save changes')

    expect(await screen.findByRole('alert')).toHaveTextContent('Fix 1 thing to save.')
    expect(screen.getByRole('alert')).toHaveTextContent('This tournament is complete.')
    expect(screen.getByRole('heading', { name: 'Review', level: 2 })).toBeVisible()
  })

  it('says Saving… while the save is out, and disables Back', async () => {
    signIn()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.patch('/v1/tournaments/:id/registrations/:registrationId', async () => {
        await gate
        return HttpResponse.json({ registrationId, added: 1, removed: 0 })
      }),
    )
    serve()
    server.use(
      http.patch('/v1/tournaments/:id/registrations/:registrationId', async () => {
        await gate
        return HttpResponse.json({ registrationId, added: 1, removed: 0 })
      }),
    )
    const user = userEvent.setup()
    await open()
    await user.click(box(/1:00 PM/))
    await press(user, /Next: review/)

    await press(user, 'Save changes')

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    release()
    expect(await screen.findByText('Maria Gonzalez: Registration updated. Added 1.')).toBeVisible()
  })

  it('lists the sweepers now entered, and says nothing of them when the answer has no record', async () => {
    signIn()
    serve({
      reads: [info(), info()],
      patches: [
        () =>
          HttpResponse.json(
            {
              message: 'changed',
              conflict: 'changed',
              existing: {
                registrationId,
                divisionId: handicap.id,
                divisionName: 'Handicap',
                squadIds: [morning.id],
                sweeperIds: [noon.id, early.id, 'unknown'],
              },
            },
            { status: 409 },
          ),
        () => HttpResponse.json({ message: 'changed', conflict: 'changed' }, { status: 409 }),
      ],
    })
    const user = userEvent.setup()
    await open()
    await user.click(box(/1:00 PM/))
    await press(user, /Next: review/)

    await press(user, 'Save changes')

    expect(
      await screen.findByText(
        /Now entered: Squad .*9:00 AM, Sweeper .*12:00 PM, Sweeper .*8:00 AM\./,
      ),
    ).toBeVisible()
    await press(user, 'Save changes')
    await waitFor(() => {
      expect(screen.queryByText(/Now entered/)).not.toBeInTheDocument()
    })
    expect(screen.getByText('This registration changed.')).toBeVisible()
  })
})

describe('errors on the steps (D-197)', () => {
  it('clears the message for a bowler field when the desk types in it, and keeps the others', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await press(user, 'Back to bowler details')
    await user.clear(screen.getByLabelText('First name (required)'))
    await user.clear(screen.getByLabelText('Last name (required)'))
    await press(user, /Next: registration/)
    expect(screen.getByRole('alert')).toHaveTextContent('Fix 2 things to save.')

    await user.type(screen.getByLabelText('First name (required)'), 'M')

    expect(screen.getByRole('alert')).toHaveTextContent('Fix 1 thing to save.')
    expect(screen.getByRole('alert')).toHaveTextContent('Last Name is Required')
    expect(screen.getByRole('alert')).not.toHaveTextContent('First Name is Required')
  })

  it('drops the message for the registration step when the desk changes it', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await user.clear(screen.getByLabelText('Average'))
    await user.type(screen.getByLabelText('Average'), '301')
    await press(user, /Next: review/)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Average must be less than or equal to 300.',
    )

    await user.type(screen.getByLabelText('Average'), '0')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears every message when the desk moves to another step', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()
    await user.clear(screen.getByLabelText('Average'))
    await user.type(screen.getByLabelText('Average'), '301')
    await press(user, /Next: review/)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Average must be less than or equal to 300.',
    )

    await press(user, '1. Bowler')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('leaves the headings alone: one focused heading per step', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()

    await press(user, /Next: review/)

    expect(screen.getByRole('heading', { name: 'Review', level: 2 })).toHaveFocus()
    expect(
      screen.queryByRole('heading', { name: 'Registration', level: 2 }),
    ).not.toBeInTheDocument()
  })
})

describe('leaving the edit page with changes', () => {
  it('lets an unchanged form go', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()

    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).not.toBeInTheDocument()
  })

  it('asks once something changed', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await open()

    await user.clear(screen.getByLabelText('Average'))
    await user.type(screen.getByLabelText('Average'), '190')
    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
  })
})
