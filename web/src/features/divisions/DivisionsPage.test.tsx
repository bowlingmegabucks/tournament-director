import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import App from '../../App'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import {
  createDivision,
  createSettings,
  createSignedInUser,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { Division } from './types'

const tournament = createTournament({ name: 'Spring Open' })

function serve(divisions: Division[]) {
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/divisions', () => HttpResponse.json({ divisions })),
  )
}

const open = () => renderApp(`/tournaments/${tournament.id}/divisions`)

/** The cells of one division's row: number, gender, ages, averages, handicap. */
async function cellsOf(name: string): Promise<(string | null)[]> {
  const row = (await screen.findByRole('rowheader', { name })).closest('tr')
  if (!row) throw new Error(`No row for ${name}`)
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
}

describe('DivisionsPage', () => {
  it('lists the divisions in the order the API sends, one row each (DIV-12, DIV-13)', async () => {
    serve([
      createDivision({ number: 1, name: 'Open' }),
      createDivision({ number: 2, name: 'Women' }),
      createDivision({ number: 10, name: 'Last' }),
    ])

    open()

    const table = await screen.findByRole('table', { name: 'Divisions in Spring Open' })
    expect(screen.queryByText('No divisions yet.')).not.toBeInTheDocument()
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'Open',
      'Women',
      'Last',
    ])
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      '1',
      '2',
      '10',
    ])
  })

  it('has labelled columns (DIV-12)', async () => {
    serve([createDivision()])

    open()

    const headers = await screen.findAllByRole('columnheader')
    expect(headers.map((header) => header.textContent)).toEqual([
      '#',
      'Name',
      'Gender',
      'Ages',
      'Averages',
      'Handicap',
    ])
  })

  it('shows gender, age and average limits, and handicap on each row (DIV-12)', async () => {
    serve([
      createDivision({ number: 1, name: 'Open', handicapPercentage: 90, handicapBase: 220 }),
      createDivision({
        number: 2,
        name: 'Women',
        gender: 'Female',
        maximumAverage: 199,
        handicapPercentage: 90,
        handicapBase: 220,
        maximumHandicapPerGame: 40,
      }),
      createDivision({
        number: 3,
        name: 'Seniors',
        minimumAge: 50,
        minimumAverage: 150,
        maximumAverage: 189,
      }),
      createDivision({ number: 4, name: 'Young', minimumAge: 18, maximumAge: 39 }),
    ])

    open()

    expect(await cellsOf('Open')).toEqual(['1', 'Any', 'Any', 'Any', '90% of 220'])
    expect(await cellsOf('Women')).toEqual([
      '2',
      'Female',
      'Any',
      'Up to 199',
      '90% of 220, max 40 a game',
    ])
    expect(await cellsOf('Seniors')).toEqual(['3', 'Any', '50 and up', '150 to 189', 'Scratch'])
    expect(await cellsOf('Young')).toEqual(['4', 'Any', '18 to 39', 'Any', 'Scratch'])
  })

  it('names the page and the tournament in the title', async () => {
    serve([createDivision()])

    open()

    await screen.findByRole('table')
    expect(document.title).toBe('Divisions · Spring Open · Tournament Director')
  })

  it('says there are no divisions when the tournament has none (DIV-12, D-40)', async () => {
    serve([])

    open()

    expect(await screen.findByText('No divisions yet.')).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('announces loading', async () => {
    serve([createDivision()])

    open()
    await screen.findByRole('heading', { name: 'Divisions', level: 1 })

    expect(screen.getByRole('status')).toHaveTextContent('Loading divisions')
    await screen.findByRole('table')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an error and recovers on retry (D-40)', async () => {
    // The query retries a failure once by itself, so the first two calls fail.
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/divisions', () =>
        ++calls <= 2
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ divisions: [createDivision({ name: 'Open' })] }),
      ),
    )

    open()
    // The built-in retry waits about a second before the error shows.
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Failed to load divisions (503)',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('rowheader', { name: 'Open' })).toBeVisible()
  })

  it('shows a not-found error without retrying when the API says the tournament is gone (D-40)', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/divisions', () => {
        calls++
        return new HttpResponse(null, { status: 404 })
      }),
    )

    open()

    expect(await screen.findByRole('alert')).toHaveTextContent('Tournament not found')
    expect(calls).toBe(1)
  })

  it('has no edit or delete button (D-40)', async () => {
    serve([createDivision()])

    open()

    await screen.findByRole('table')
    expect(within(screen.getByRole('main')).queryByRole('button')).not.toBeInTheDocument()
  })

  describe('the New division link (DIV-12, D-19, D-138, D-143)', () => {
    const settings = (completed: boolean) =>
      http.get('/v1/tournaments/:id/settings', () =>
        HttpResponse.json({ settings: createSettings({ completed }) }),
      )
    const link = () => screen.queryByRole('link', { name: 'New division' })

    it('shows a director a link to the form for an open tournament', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([createDivision()])
      server.use(settings(false))

      open()

      expect(await screen.findByRole('link', { name: 'New division' })).toHaveAttribute(
        'href',
        `/tournaments/${tournament.id}/divisions/new`,
      )
    })

    it('hides it for a complete tournament', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([createDivision()])
      server.use(settings(true))

      open()

      await screen.findByRole('table')
      await waitFor(() => {
        expect(link()).not.toBeInTheDocument()
      })
    })

    it('hides it from a score keeper, who never reads the settings', async () => {
      setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
      serve([createDivision()])

      open()

      await screen.findByRole('table')
      expect(link()).not.toBeInTheDocument()
    })

    it('hides it from a signed-out visitor', async () => {
      serve([createDivision()])

      open()

      await screen.findByRole('table')
      expect(link()).not.toBeInTheDocument()
    })

    it('keeps the table and still shows the link when the settings cannot be read', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([createDivision({ name: 'Open' })])
      server.use(
        http.get('/v1/tournaments/:id/settings', () => new HttpResponse(null, { status: 500 })),
      )

      open()

      expect(await screen.findByRole('rowheader', { name: 'Open' })).toBeVisible()
      expect(await screen.findByRole('link', { name: 'New division' })).toBeVisible()
    })
  })

  describe('the toast after an add (D-144)', () => {
    function openAfterAdd() {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter
            initialEntries={[
              { pathname: `/tournaments/${tournament.id}/divisions`, state: { created: true } },
            ]}
          >
            <App />
          </MemoryRouter>
        </QueryClientProvider>,
      )
    }

    it('says "Division created" and goes away when dismissed', async () => {
      serve([createDivision()])
      const user = userEvent.setup()

      openAfterAdd()

      expect(await screen.findByText('Division created')).toBeVisible()
      await user.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByText('Division created')).not.toBeInTheDocument()
    })

    it('is not there on an ordinary visit', async () => {
      serve([createDivision()])

      open()

      await screen.findByRole('table')
      expect(screen.queryByText('Division created')).not.toBeInTheDocument()
    })
  })
})
