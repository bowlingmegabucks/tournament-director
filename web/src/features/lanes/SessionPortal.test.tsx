import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createLanePage,
  createScorePage,
  createSquad,
  createSweeper,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'

const tournament = createTournament({ name: 'Spring Open' })
const squad = createSquad({ date: '2026-10-24T09:00:00' })
const sweeper = createSweeper({ date: '2026-10-24T18:00:00', complete: true })

function serve() {
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/squads', () => HttpResponse.json({ squads: [squad] })),
    http.get('/v1/tournaments/:id/sweepers', () => HttpResponse.json({ sweepers: [sweeper] })),
    http.get('/v1/tournaments/:id/squads/:sessionId/lanes', () =>
      HttpResponse.json(createLanePage({ session: { ...createLanePage().session, id: squad.id } })),
    ),
    http.get('/v1/tournaments/:id/sweepers/:sessionId/lanes', () =>
      HttpResponse.json(
        createLanePage({
          session: { ...createLanePage().session, id: sweeper.id, kind: 'sweeper' },
        }),
      ),
    ),
  )
}

const base = `/tournaments/${tournament.id}`

describe('SessionPortal', () => {
  it('shows the squad date, its status, a breadcrumb, and the Lane assignments tab (D-22, D-60)', async () => {
    serve()

    renderApp(`${base}/squads/${squad.id}/lanes`)

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: /Sat 10\/24\/2026 9:00 AM/ },
        { timeout: 3000 },
      ),
    ).toHaveTextContent('Open')
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Spring Open' })).toHaveAttribute('href', base)
    expect(within(crumbs).getByRole('link', { name: 'Squads' })).toHaveAttribute(
      'href',
      `${base}/squads`,
    )
    expect(within(crumbs).getByText('Sat 10/24/2026 9:00 AM')).toHaveAttribute(
      'aria-current',
      'page',
    )
    const tabs = screen.getByRole('navigation', { name: 'Squad pages' })
    expect(within(tabs).getByRole('link', { name: 'Lane assignments' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Lane assignments', 'Scores'])
    expect(within(tabs).getByRole('link', { name: 'Scores' })).not.toHaveAttribute('aria-current')
  })

  it.each([
    ['squads', 'Squad pages', () => squad.id],
    ['sweepers', 'Sweeper pages', () => sweeper.id],
  ])('has a Scores tab that opens the %s scores page (SCR-17, D-60)', async (kind, nav, id) => {
    serve()
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/scores', () =>
        HttpResponse.json(
          createScorePage({ session: { ...createScorePage().session, id: squad.id } }),
        ),
      ),
      http.get('/v1/tournaments/:id/sweepers/:sessionId/scores', () =>
        HttpResponse.json(
          createScorePage({
            session: { ...createScorePage().session, id: sweeper.id, kind: 'sweeper' },
          }),
        ),
      ),
    )
    renderApp(`${base}/${kind}/${id()}/lanes`)
    const tabs = await screen.findByRole('navigation', { name: nav }, { timeout: 3000 })

    await userEvent.click(within(tabs).getByRole('link', { name: 'Scores' }))

    expect(await screen.findByText(/No bowlers have entered/, {}, { timeout: 3000 })).toBeVisible()
    expect(within(tabs).getByRole('link', { name: 'Scores' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(tabs).getByRole('link', { name: 'Lane assignments' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('shows a sweeper the same way, with Complete (D-60)', async () => {
    serve()

    renderApp(`${base}/sweepers/${sweeper.id}/lanes`)

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: /Sat 10\/24\/2026 6:00 PM/ },
        { timeout: 3000 },
      ),
    ).toHaveTextContent('Complete')
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', {
        name: 'Sweepers',
      }),
    ).toHaveAttribute('href', `${base}/sweepers`)
    expect(screen.getByRole('navigation', { name: 'Sweeper pages' })).toBeVisible()
  })

  it.each([
    ['squads', () => squad.id],
    ['sweepers', () => sweeper.id],
  ])('opens the lanes tab from the %s page root (D-60)', async (kind, id) => {
    serve()

    renderApp(`${base}/${kind}/${id()}`)

    expect(
      await screen
        .findByRole(
          'heading',
          { name: /No bowlers have entered|Lanes|Unassigned/ },
          { timeout: 3000 },
        )
        .catch(() => screen.findByText(/No bowlers have entered/)),
    ).toBeDefined()
    expect(screen.getByRole('link', { name: 'Lane assignments' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('says the squad is not found for an unknown id (D-60)', async () => {
    serve()

    renderApp(`${base}/squads/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/lanes`)

    expect(
      await screen.findByRole('heading', { name: 'Squad not found' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'All squads' })).toHaveAttribute(
      'href',
      `${base}/squads`,
    )
  })

  it('says the sweeper is not found for a squad id under sweepers (D-60)', async () => {
    serve()

    renderApp(`${base}/sweepers/${squad.id}/lanes`)

    expect(
      await screen.findByRole('heading', { name: 'Sweeper not found' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'All sweepers' })).toBeVisible()
  })

  it('shows an error with Try again when the session list fails', async () => {
    serve()
    server.use(
      http.get('/v1/tournaments/:id/squads', () => new HttpResponse(null, { status: 503 })),
    )

    renderApp(`${base}/squads/${squad.id}/lanes`)

    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Failed to load squads (503)',
    )
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  it('opens the page from the squad card link (D-60)', async () => {
    serve()
    const user = userEvent.setup()
    renderApp(`${base}/squads`)

    await user.click(
      await screen.findByRole('link', { name: /Sat 10\/24\/2026 9:00 AM/ }, { timeout: 3000 }),
    )

    expect(
      await screen.findByRole('navigation', { name: 'Squad pages' }, { timeout: 3000 }),
    ).toBeVisible()
  })
})
