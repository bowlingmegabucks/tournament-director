import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import App from '../../App'
import { server } from '../../mocks/server'
import { createSettings, createTournament } from '../../mocks/data'
import { renderApp } from '../../test/renderApp'

const tournament = createTournament({ name: 'Spring Open' })

function serve(settings = createSettings()) {
  server.use(
    http.get(`/v1/tournaments/${tournament.id}`, () => HttpResponse.json({ tournament })),
    http.get(`/v1/tournaments/${tournament.id}/settings`, () => HttpResponse.json({ settings })),
  )
}

describe('TournamentOverview format (TRN-23, D-126)', () => {
  it('shows games and the three ratios', async () => {
    serve(createSettings({ games: 4, finalsRatio: 7.5, cashRatio: 5, superSweeperCashRatio: 3 }))

    renderApp(`/tournaments/${tournament.id}`)

    expect(await screen.findByRole('heading', { name: 'Format', level: 2 })).toBeVisible()
    expect(await screen.findByText('Games per squad')).toBeVisible()
    expect(screen.getByText('Games per squad').nextElementSibling).toHaveTextContent('4')
    expect(screen.getByText('Finals ratio').nextElementSibling).toHaveTextContent('1 in 7.5')
    expect(screen.getByText('Cash ratio').nextElementSibling).toHaveTextContent('1 in 5')
    expect(screen.getByText('Super sweeper cash ratio').nextElementSibling).toHaveTextContent(
      '1 in 3',
    )
  })

  it('shows a stored super sweeper ratio of 0 as not set (D-17)', async () => {
    serve(createSettings({ superSweeperCashRatio: 0 }))

    renderApp(`/tournaments/${tournament.id}`)

    expect(await screen.findByText('0 (not set)')).toBeVisible()
  })

  it('shows loading while the format loads, with the summary already there', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(`/v1/tournaments/${tournament.id}`, () => HttpResponse.json({ tournament })),
      http.get(`/v1/tournaments/${tournament.id}/settings`, async () => {
        await gate
        return HttpResponse.json({ settings: createSettings() })
      }),
    )

    renderApp(`/tournaments/${tournament.id}`)

    expect(await screen.findByText('Loading format…')).toBeVisible()
    expect(screen.getByText('Bowling center')).toBeVisible()
    release()
    expect(await screen.findByText('Games per squad')).toBeVisible()
  })

  it('shows an error with Try again, and recovers', async () => {
    let calls = 0
    server.use(
      http.get(`/v1/tournaments/${tournament.id}`, () => HttpResponse.json({ tournament })),
      http.get(`/v1/tournaments/${tournament.id}/settings`, () => {
        calls += 1
        // The query retries a failure once (retryUnlessNotFound), so fail twice.
        return calls <= 2
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ settings: createSettings({ games: 6 }) })
      }),
    )
    const user = userEvent.setup()
    renderApp(`/tournaments/${tournament.id}`)

    expect(
      await screen.findByText('Failed to load the tournament format (503)', {}, { timeout: 4000 }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Games per squad')).toBeVisible()
    expect(screen.getByText('Games per squad').nextElementSibling).toHaveTextContent('6')
  })
})

describe('TournamentOverview created toast (TRN-22, D-120)', () => {
  function renderCreated() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[{ pathname: `/tournaments/${tournament.id}`, state: { created: true } }]}
        >
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('shows "Tournament created" once and lets the director dismiss it', async () => {
    serve()
    const user = userEvent.setup()
    renderCreated()

    expect(await screen.findByText('Tournament created')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText('Tournament created')).not.toBeInTheDocument()
  })

  it('shows no toast on an ordinary visit', async () => {
    serve()

    renderApp(`/tournaments/${tournament.id}`)

    await screen.findByText('Games per squad')
    expect(screen.queryByText('Tournament created')).not.toBeInTheDocument()
  })
})
