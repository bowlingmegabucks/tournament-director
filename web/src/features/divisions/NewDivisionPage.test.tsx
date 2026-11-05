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
import type { NewDivision, Division } from './types'

const tournament = createTournament({ name: 'Spring Open' })
const url = `/tournaments/${tournament.id}/divisions/new`

interface Served {
  posted: (NewDivision & { confirmWarnings?: boolean })[]
}

/** The reads the page needs, and a POST that stores what it is given the way the API would. */
function serve(
  options: {
    divisions?: Division[]
    completed?: boolean
    post?: () => Response | Promise<Response>
  } = {},
): Served {
  const served: Served = { posted: [] }
  const divisions = options.divisions ?? [
    createDivision({ number: 1, name: 'Open' }),
    createDivision({ number: 3, name: 'Women' }),
  ]
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/settings', () =>
      HttpResponse.json({ settings: createSettings({ completed: options.completed === true }) }),
    ),
    http.get('/v1/tournaments/:id/divisions', () => HttpResponse.json({ divisions })),
    http.post('/v1/tournaments/:id/divisions', async ({ request }) => {
      served.posted.push((await request.json()) as Served['posted'][number])
      if (options.post) return options.post()
      return HttpResponse.json(
        { division: createDivision({ number: 4, name: 'Juniors' }) },
        { status: 201 },
      )
    }),
  )
  return served
}

const signIn = (role: 'director' | 'scoreKeeper' = 'director') => {
  setMockUser(createSignedInUser({ roles: [role] }))
}
const add = () => screen.getByRole('button', { name: /Add division|Saving/ })
const openForm = async () => {
  renderApp(url)
  await screen.findByRole('heading', { name: 'New division', level: 1 })
  // The form appears once the tournament's settings say it is not complete.
  await screen.findByLabelText('Name (required)')
}

describe('NewDivisionPage', () => {
  it('shows the empty form with the number as text, one more than the highest (DIV-01, D-139, D-144)', async () => {
    signIn()
    serve()

    await openForm()

    expect(await screen.findByText('Number:')).toBeVisible()
    expect(screen.getByText('4')).toBeVisible()
    expect(screen.queryByRole('textbox', { name: /Number/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Name (required)')).toHaveValue('')
    expect(screen.getByLabelText('Gender')).toHaveValue('')
    expect(document.title).toBe('New division · Spring Open · Tournament Director')
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/divisions`,
    )
  })

  it('numbers the first division 1 (DIV-01, D-139)', async () => {
    signIn()
    serve({ divisions: [] })

    await openForm()

    expect(await screen.findByText('1')).toBeVisible()
  })

  it('shows no number when the list cannot be read, and still saves (D-139)', async () => {
    signIn()
    const served = serve()
    server.use(
      http.get('/v1/tournaments/:id/divisions', () => new HttpResponse(null, { status: 500 })),
    )
    const user = userEvent.setup()
    await openForm()

    expect(await screen.findByText('Assigned when you save.')).toBeVisible()
    await user.type(screen.getByLabelText('Name (required)'), 'Juniors')
    await user.click(add())

    await waitFor(() => {
      expect(served.posted).toHaveLength(1)
    })
  })

  it('puts a % sign after the percent box and groups the handicap boxes (D-144)', async () => {
    signIn()
    serve()

    await openForm()

    const group = screen.getByRole('group', { name: 'Handicap' })
    expect(within(group).getByLabelText('Handicap percent')).toBeVisible()
    expect(within(group).getByText('%')).toBeVisible()
    expect(screen.getByRole('group', { name: 'Age limits' })).toBeVisible()
    expect(screen.getByRole('group', { name: 'Average limits' })).toBeVisible()
  })

  it('lists the missing name and focuses it (DIV-02)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await openForm()

    await user.click(add())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Fix 1 field to save.')
    expect(within(alert).getByRole('link', { name: 'Name is required' })).toBeVisible()
    expect(screen.getByLabelText('Name (required)')).toHaveFocus()
    expect(screen.getByLabelText('Name (required)')).toHaveAccessibleDescription(/Name is required/)
    expect(served.posted).toEqual([])
  })

  it('shows each cross-field message under its box (DIV-05, DIV-07, DIV-09, DIV-11)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await openForm()

    await user.type(screen.getByLabelText('Name (required)'), 'Odd')
    await user.type(screen.getByLabelText('Minimum age'), '60')
    await user.type(screen.getByLabelText('Maximum age'), '40')
    await user.type(screen.getByLabelText('Minimum average'), '200')
    await user.type(screen.getByLabelText('Maximum average'), '150')
    await user.type(screen.getByLabelText('Handicap percent'), '90')
    await user.type(screen.getByLabelText('Maximum handicap per game'), '40')
    await user.click(add())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Fix 4 fields to save.')
    for (const message of [
      'Minimum age must be less than or equal to maximum age',
      'Minimum average must be less than or equal to maximum average',
      'Handicap base is required with a handicap percentage',
    ]) {
      expect(within(alert).getByText(message)).toBeVisible()
    }
    expect(served.posted).toEqual([])
  })

  it('checks a box when the director leaves it, not before (DIV-04)', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await openForm()

    await user.click(screen.getByLabelText('Minimum age'))
    await user.tab()
    expect(screen.queryByText('Minimum age must be between 1 and 120')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Minimum age'), '0')
    await user.tab()
    expect(await screen.findByText('Minimum age must be between 1 and 120')).toBeVisible()
  })

  it('clears a message when the director types again (DIV-04)', async () => {
    signIn()
    serve()
    const user = userEvent.setup()
    await openForm()
    await user.type(screen.getByLabelText('Minimum age'), '0')
    await user.tab()
    await screen.findByText('Minimum age must be between 1 and 120')

    await user.type(screen.getByLabelText('Minimum age'), '5')

    expect(screen.queryByText('Minimum age must be between 1 and 120')).not.toBeInTheDocument()
  })

  it('sends the typed values, goes to the list, and shows the toast (DIV-12, D-144)', async () => {
    signIn()
    const served = serve()
    const user = userEvent.setup()
    await openForm()

    await user.type(screen.getByLabelText('Name (required)'), '  Seniors 50+ ')
    await user.selectOptions(screen.getByLabelText('Gender'), 'Female')
    await user.type(screen.getByLabelText('Minimum age'), '50')
    await user.type(screen.getByLabelText('Maximum average'), '220')
    await user.type(screen.getByLabelText('Handicap percent'), '90')
    await user.type(screen.getByLabelText('Handicap base'), '220')
    await user.type(screen.getByLabelText('Maximum handicap per game'), '40')
    await user.click(add())

    expect(await screen.findByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
    expect(await screen.findByRole('status')).toHaveTextContent('Division created')
    expect(served.posted).toEqual([
      {
        name: 'Seniors 50+',
        gender: 'Female',
        minimumAge: 50,
        maximumAge: null,
        minimumAverage: null,
        maximumAverage: 220,
        handicapPercentage: 90,
        handicapBase: 220,
        maximumHandicapPerGame: 40,
      },
    ])
  })

  it('disables the button and says Saving… while it saves (DIV-12)', async () => {
    signIn()
    let release: () => void = () => undefined
    serve({
      post: () =>
        new Promise<Response>((resolve) => {
          release = () => {
            resolve(HttpResponse.json({ division: createDivision() }, { status: 201 }))
          }
        }),
    })
    const user = userEvent.setup()
    await openForm()
    await user.type(screen.getByLabelText('Name (required)'), 'Juniors')

    await user.click(add())

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    release()
    await screen.findByRole('heading', { name: 'Divisions' })
  })

  it('shows the API message under the name for a name already used (DIV-02, D-140)', async () => {
    signIn()
    const message = 'A division with this name already exists in this tournament'
    serve({
      post: () => HttpResponse.json({ message, errors: { name: message } }, { status: 409 }),
    })
    const user = userEvent.setup()
    await openForm()
    await user.type(screen.getByLabelText('Name (required)'), 'Open')

    await user.click(add())

    expect(await screen.findByRole('alert')).toHaveTextContent('Fix 1 field to save.')
    expect(screen.getByLabelText('Name (required)')).toHaveAccessibleDescription(
      new RegExp(message),
    )
    expect(screen.getByLabelText('Name (required)')).toHaveFocus()
  })

  describe('a percent over 100 (DIV-08, D-142)', () => {
    const warning = {
      message: 'Confirm to add this division.',
      warnings: [
        {
          field: 'handicapPercentage',
          message: 'A handicap percentage above 100 is unusual. Check that it is right.',
        },
      ],
    }

    async function typeUnusual(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText('Name (required)'), 'Bonus')
      await user.type(screen.getByLabelText('Handicap percent'), '110')
      await user.type(screen.getByLabelText('Handicap base'), '220')
    }

    it('opens the confirm dialog with the warning and the typed percent', async () => {
      signIn()
      const served = serve({ post: () => HttpResponse.json(warning, { status: 409 }) })
      const user = userEvent.setup()
      await openForm()
      await typeUnusual(user)

      await user.click(add())

      const dialog = await screen.findByRole('dialog', { name: 'Add this division?' })
      expect(within(dialog).getByText(warning.warnings[0]?.message ?? '')).toBeVisible()
      expect(within(dialog).getByText('Handicap percent: 110%')).toBeVisible()
      expect(served.posted[0]).not.toHaveProperty('confirmWarnings')
    })

    it('Go back closes it, keeps the typing, and sends nothing more', async () => {
      signIn()
      const served = serve({ post: () => HttpResponse.json(warning, { status: 409 }) })
      const user = userEvent.setup()
      await openForm()
      await typeUnusual(user)
      await user.click(add())
      await screen.findByRole('dialog')

      await user.click(screen.getByRole('button', { name: 'Go back' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Handicap percent')).toHaveValue('110')
      expect(served.posted).toHaveLength(1)
    })

    it('sends the same values again with confirmWarnings and goes to the list', async () => {
      signIn()
      let calls = 0
      const served = serve({
        post: () => {
          calls += 1
          return calls === 1
            ? HttpResponse.json(warning, { status: 409 })
            : HttpResponse.json({ division: createDivision() }, { status: 201 })
        },
      })
      const user = userEvent.setup()
      await openForm()
      await typeUnusual(user)
      await user.click(add())
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Add division' }))

      expect(await screen.findByRole('status')).toHaveTextContent('Division created')
      expect(served.posted).toHaveLength(2)
      expect(served.posted[1]).toEqual({ ...served.posted[0], confirmWarnings: true })
    })

    it('shows a refusal that comes after the confirm inside the dialog (D-129)', async () => {
      signIn()
      let calls = 0
      serve({
        post: () => {
          calls += 1
          return calls === 1
            ? HttpResponse.json(warning, { status: 409 })
            : new HttpResponse(null, { status: 500 })
        },
      })
      const user = userEvent.setup()
      await openForm()
      await typeUnusual(user)
      await user.click(add())
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Add division' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Failed to save the division (500)',
      )
    })
  })

  describe('failures that are not about a field', () => {
    it('shows an outage as an error toast that stays, and keeps the typing (DIV-12)', async () => {
      signIn()
      serve({ post: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()
      await user.type(screen.getByLabelText('Name (required)'), 'Juniors')

      await user.click(add())

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Failed to save the division (503)',
      )
      expect(screen.getByLabelText('Name (required)')).toHaveValue('Juniors')

      await user.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('drops the old toast when the director tries again (DIV-12)', async () => {
      signIn()
      let calls = 0
      serve({
        post: () => {
          calls += 1
          return calls === 1
            ? new HttpResponse(null, { status: 503 })
            : HttpResponse.json({ division: createDivision() }, { status: 201 })
        },
      })
      const user = userEvent.setup()
      await openForm()
      await user.type(screen.getByLabelText('Name (required)'), 'Juniors')
      await user.click(add())
      await screen.findByRole('alert')

      await user.click(add())

      await screen.findByRole('heading', { name: 'Divisions' })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('drops the old toast as soon as the director presses Add again, even when a check fails (DIV-02)', async () => {
      signIn()
      serve({ post: () => new HttpResponse(null, { status: 503 }) })
      const user = userEvent.setup()
      await openForm()
      await user.type(screen.getByLabelText('Name (required)'), 'Juniors')
      await user.click(add())
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Failed to save the division (503)',
      )

      await user.clear(screen.getByLabelText('Name (required)'))
      await user.click(add())

      expect(screen.queryByText('Failed to save the division (503)')).not.toBeInTheDocument()
      expect(await screen.findByRole('alert')).toHaveTextContent('Fix 1 field to save.')
    })

    it('shows the API message when a 400 names no field (DIV-12)', async () => {
      signIn()
      serve({
        post: () =>
          HttpResponse.json(
            { message: 'Send the division as a JSON object.', errors: {} },
            { status: 400 },
          ),
      })
      const user = userEvent.setup()
      await openForm()
      await user.type(screen.getByLabelText('Name (required)'), 'Juniors')

      await user.click(add())

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Send the division as a JSON object.',
      )
    })

    it('shows the complete-tournament refusal as a toast, not under a box (D-143)', async () => {
      signIn()
      const reason = 'This tournament is complete and cannot be changed'
      serve({
        post: () =>
          HttpResponse.json({ message: reason, errors: { tournament: reason } }, { status: 409 }),
      })
      const user = userEvent.setup()
      await openForm()
      await user.type(screen.getByLabelText('Name (required)'), 'Juniors')

      await user.click(add())

      expect(await screen.findByRole('alert')).toHaveTextContent(reason)
      expect(screen.queryByText('Fix 1 field to save.')).not.toBeInTheDocument()
    })
  })

  it('shows a notice in place of the form for a complete tournament (D-143)', async () => {
    signIn()
    serve({ completed: true })

    renderApp(url)

    expect(await screen.findByText('This tournament is complete')).toBeVisible()
    expect(screen.queryByLabelText('Name (required)')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to divisions' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/divisions`,
    )
  })

  it('shows loading, then an error with Try again when the settings fail (D-143)', async () => {
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

    expect(await screen.findByLabelText('Name (required)')).toBeVisible()
  })

  describe('who may see it (DIV-12, D-102, D-138)', () => {
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
