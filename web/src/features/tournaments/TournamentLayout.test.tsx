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
  it('has a menu button that shows whether the links are open, and closes after a link is followed (phone menu)', async () => {
    serveTournament()
    const user = userEvent.setup()
    renderApp(`/tournaments/${tournament.id}`)

    const button = await screen.findByRole('button', { name: 'Tournament menu' })
    expect(button).toHaveAttribute('aria-expanded', 'false')

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')

    await user.click(within(sidebar()).getByRole('link', { name: 'Divisions' }))
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveFocus()
  })

  it('closes the phone menu on Escape and returns focus to the button', async () => {
    serveTournament()
    const user = userEvent.setup()
    renderApp(`/tournaments/${tournament.id}`)

    const button = await screen.findByRole('button', { name: 'Tournament menu' })
    await user.click(button)
    await user.click(within(sidebar()).getByRole('link', { name: 'Squads' }))
    await user.click(button)
    within(sidebar()).getByRole('link', { name: 'Divisions' }).focus()
    await user.keyboard('{Escape}')

    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveFocus()
  })

  it('ignores Escape while the phone menu is closed', async () => {
    serveTournament()
    const user = userEvent.setup()
    renderApp(`/tournaments/${tournament.id}`)

    const button = await screen.findByRole('button', { name: 'Tournament menu' })
    within(sidebar()).getByRole('link', { name: 'Divisions' }).focus()
    await user.keyboard('{Escape}')

    expect(button).not.toHaveFocus()
  })

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

  it('links to Divisions in the sidebar and marks it on its own page (D-40)', async () => {
    serveTournament()
    server.use(
      http.get('/v1/tournaments/:id/divisions', () => HttpResponse.json({ divisions: [] })),
    )

    renderApp(`/tournaments/${tournament.id}`)
    const link = await within(
      await screen.findByRole('navigation', { name: 'Spring Open' }),
    ).findByRole('link', { name: 'Divisions' })
    expect(link).toHaveAttribute('href', `/tournaments/${tournament.id}/divisions`)
    expect(link).not.toHaveAttribute('aria-current')

    await userEvent.click(link)

    expect(await screen.findByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
    expect(within(sidebar()).getByRole('link', { name: 'Divisions' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it.each([
    ['Squads', 'squads'],
    ['Sweepers', 'sweepers'],
    ['Registrations', 'registrations'],
  ])(
    'links to %s in the sidebar and marks it on its own page (D-44, D-47)',
    async (name, segment) => {
      serveTournament()
      server.use(
        http.get('/v1/tournaments/:id/squads', () => HttpResponse.json({ squads: [] })),
        http.get('/v1/tournaments/:id/sweepers', () => HttpResponse.json({ sweepers: [] })),
        http.get('/v1/tournaments/:id/registrations', () =>
          HttpResponse.json({
            registrations: [],
            summary: {
              registrations: 0,
              superSweepers: 0,
              divisions: [],
              squads: [],
              sweepers: [],
            },
          }),
        ),
      )

      renderApp(`/tournaments/${tournament.id}`)
      const link = await within(
        await screen.findByRole('navigation', { name: 'Spring Open' }),
      ).findByRole('link', { name })
      expect(link).toHaveAttribute('href', `/tournaments/${tournament.id}/${segment}`)
      expect(link).not.toHaveAttribute('aria-current')

      await userEvent.click(link)

      expect(await screen.findByRole('heading', { name, level: 1 })).toBeVisible()
      expect(within(sidebar()).getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
    },
  )

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

  it('links to At-large and Seeding after Registrations, and marks each on its own page (D-87)', async () => {
    serveTournament()
    server.use(
      http.get('/v1/tournaments/:id/at-large', () =>
        HttpResponse.json({ complete: true, finalsRatio: 8, divisions: [] }),
      ),
      http.get('/v1/tournaments/:id/seeding', () =>
        HttpResponse.json({ complete: true, finalsRatio: 8, divisions: [] }),
      ),
    )

    renderApp(`/tournaments/${tournament.id}`)
    const nav = within(await screen.findByRole('navigation', { name: 'Spring Open' }))
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Divisions',
      'Squads',
      'Sweepers',
      'Registrations',
      'At-large',
      'Seeding',
      'Change tournament',
    ])
    expect(nav.getByRole('link', { name: 'At-large' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/at-large`,
    )
    expect(nav.getByRole('link', { name: 'Seeding' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/seeding`,
    )

    await userEvent.click(nav.getByRole('link', { name: 'Seeding' }))

    expect(await screen.findByRole('heading', { name: 'Finals seeding', level: 1 })).toBeVisible()
    expect(within(sidebar()).getByRole('link', { name: 'Seeding' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

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
