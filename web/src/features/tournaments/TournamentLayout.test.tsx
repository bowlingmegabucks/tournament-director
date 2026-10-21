import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createTournament } from '../../mocks/data'
import { renderApp } from '../../test/renderApp'

const tournament = createTournament({
  name: 'Spring Open',
  startDate: '2026-10-23',
  endDate: '2026-10-25',
  bowlingCenter: 'Spare Time Lanes, Worcester MA',
  entryFee: 50,
})

function serveTournament() {
  server.use(
    http.get('/v1/tournaments/:id', ({ params }) =>
      params.id === tournament.id
        ? HttpResponse.json({ tournament })
        : HttpResponse.json({ message: 'Tournament not found' }, { status: 404 }),
    ),
  )
}

const sidebar = () => screen.getByRole('navigation', { name: 'Spring Open' })

describe('tournament pages', () => {
  it('shows the tournament overview (TRN-15)', async () => {
    serveTournament()

    renderApp(`/tournaments/${tournament.id}`)

    expect(await screen.findByRole('heading', { name: 'Spring Open', level: 1 })).toBeVisible()
    expect(document.title).toBe('Spring Open · Tournament Director')
    expect(screen.getByText('Oct 23 to Oct 25, 2026', { selector: 'dd' })).toBeVisible()
    expect(screen.getByText('Spare Time Lanes, Worcester MA')).toBeVisible()
    expect(screen.getByText('$50.00')).toBeVisible()
  })

  it('shows the tournament sidebar with the name, dates, and a way out (NAV-02)', async () => {
    serveTournament()

    renderApp(`/tournaments/${tournament.id}`)

    await screen.findByRole('heading', { name: 'Spring Open', level: 1 })
    expect(within(sidebar()).getByRole('heading', { name: 'Spring Open' })).toBeVisible()
    expect(within(sidebar()).getByText('Oct 23 to Oct 25, 2026')).toBeVisible()
    expect(within(sidebar()).getByRole('link', { name: 'Change tournament' })).toHaveAttribute(
      'href',
      '/tournaments',
    )
  })

  it('keeps the main menu next to the sidebar, with Tournaments marked (NAV-01, NAV-02)', async () => {
    serveTournament()

    renderApp(`/tournaments/${tournament.id}`)

    await screen.findByRole('heading', { name: 'Spring Open', level: 1 })
    const main = screen.getByRole('navigation', { name: 'Main' })
    expect(within(main).getByRole('link', { name: 'Tournaments' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(main).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it.each(['/', '/tournaments', '/nowhere'])(
    'shows no tournament sidebar at %s (NAV-02)',
    async (path) => {
      server.use(http.get('/v1/tournaments', () => HttpResponse.json({ tournaments: [] })))

      renderApp(path)

      await screen.findByRole('heading', { level: 1 })
      expect(
        screen.getAllByRole('navigation').map((nav) => nav.getAttribute('aria-label')),
      ).toEqual(['Main'])
    },
  )

  it('goes back to the list from Change tournament (NAV-02)', async () => {
    serveTournament()
    server.use(http.get('/v1/tournaments', () => HttpResponse.json({ tournaments: [tournament] })))

    renderApp(`/tournaments/${tournament.id}`)
    await userEvent.click(await screen.findByRole('link', { name: 'Change tournament' }))

    expect(await screen.findByRole('heading', { name: 'Tournaments', level: 1 })).toBeVisible()
    expect(screen.queryByRole('navigation', { name: 'Spring Open' })).not.toBeInTheDocument()
  })

  it('says the tournament is not found, without a sidebar (NAV-03)', async () => {
    serveTournament()

    renderApp('/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01')

    expect(await screen.findByRole('heading', { name: 'Tournament not found' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'All tournaments' })).toHaveAttribute(
      'href',
      '/tournaments',
    )
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
  })

  it('says not found for an id the API rejects as invalid (NAV-03)', async () => {
    server.use(http.get('/v1/tournaments/:id', () => new HttpResponse(null, { status: 400 })))

    renderApp('/tournaments/not-a-uuid')

    expect(await screen.findByRole('heading', { name: 'Tournament not found' })).toBeVisible()
  })

  it('shows an error for any other failure, and recovers on retry', async () => {
    // The query retries a failure once by itself, so the first two calls fail.
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id', () =>
        ++calls <= 2 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({ tournament }),
      ),
    )

    renderApp(`/tournaments/${tournament.id}`)
    // The built-in retry waits about a second before the error shows.
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Failed to load tournament (500)',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Spring Open', level: 1 })).toBeVisible()
  })

  it('announces loading', async () => {
    serveTournament()

    renderApp(`/tournaments/${tournament.id}`)

    expect(screen.getByRole('status')).toHaveTextContent('Loading tournament')
    expect(await screen.findByRole('heading', { name: 'Spring Open', level: 1 })).toBeVisible()
  })
})
