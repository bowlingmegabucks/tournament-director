import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createTournament } from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import { useFixedToday } from '../../test/fixedToday'
import type { Tournament } from './types'

function serve(tournaments: Tournament[]) {
  server.use(http.get('/v1/tournaments', () => HttpResponse.json({ tournaments })))
}

const running = () =>
  createTournament({ name: 'Running Open', startDate: '2026-10-20', endDate: '2026-10-22' })
const upcoming = () =>
  createTournament({ name: 'Upcoming Open', startDate: '2026-11-05', endDate: '2026-11-07' })
const past = (name: string, startDate: string, endDate: string) =>
  createTournament({ name, startDate, endDate })

describe('TournamentsPage', () => {
  useFixedToday(2026, 9, 21)

  it('lists current and upcoming over past, each soonest or newest first (TRN-11, TRN-13)', async () => {
    serve([
      past('Old Classic', '2024-10-11', '2024-10-13'),
      upcoming(),
      past('Last Year', '2025-10-10', '2025-10-12'),
      running(),
    ])

    renderApp('/tournaments')

    expect(
      await screen.findByRole('heading', { name: 'Current and upcoming', level: 2 }),
    ).toBeVisible()
    const names = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(names).toEqual(['Running Open', 'Upcoming Open', 'Last Year', 'Old Classic'])
    expect(screen.getByRole('heading', { name: 'Past', level: 2 })).toBeVisible()
  })

  it('shows the dates, center, and fee of each row (D-24)', async () => {
    serve([
      createTournament({
        name: 'Spring Open',
        startDate: '2026-10-23',
        endDate: '2026-10-25',
        bowlingCenter: 'Spare Time Lanes, Worcester MA',
        entryFee: 50,
      }),
    ])

    renderApp('/tournaments')

    expect(await screen.findByText(/Oct 23 to Oct 25, 2026/)).toHaveTextContent(
      'Oct 23 to Oct 25, 2026 · Spare Time Lanes, Worcester MA · Entry fee $50.00',
    )
  })

  it('marks in progress and upcoming, and leaves past plain (TRN-13)', async () => {
    serve([running(), upcoming(), past('Last Year', '2025-10-10', '2025-10-12')])

    renderApp('/tournaments')

    const rows = await screen.findAllByRole('article')
    expect(within(rows[0] as HTMLElement).getByText('In progress')).toBeVisible()
    expect(within(rows[1] as HTMLElement).getByText('Upcoming')).toBeVisible()
    expect(within(rows[2] as HTMLElement).queryByText(/In progress|Upcoming/)).toBeNull()
  })

  it('links each name to its tournament (TRN-15)', async () => {
    const tournament = running()
    serve([tournament])

    renderApp('/tournaments')

    expect(await screen.findByRole('link', { name: 'Running Open' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}`,
    )
  })

  it('says none right now when everything is past (TRN-13)', async () => {
    serve([past('Last Year', '2025-10-10', '2025-10-12')])

    renderApp('/tournaments')

    expect(await screen.findByText('None right now.')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Past' })).toBeVisible()
  })

  it('leaves out the Past group when there is none (TRN-13)', async () => {
    serve([running()])

    renderApp('/tournaments')

    await screen.findByText('Running Open')
    expect(screen.queryByRole('heading', { name: 'Past' })).not.toBeInTheDocument()
  })

  it('keeps a tournament that ends today under current (TRN-13)', async () => {
    serve([
      createTournament({ name: 'Ends Today', startDate: '2026-10-19', endDate: '2026-10-21' }),
    ])

    renderApp('/tournaments')

    expect(await screen.findByText('Ends Today')).toBeVisible()
    expect(screen.queryByText('None right now.')).not.toBeInTheDocument()
  })

  it('shows a message when there are no tournaments (TRN-11)', async () => {
    serve([])

    renderApp('/tournaments')

    expect(await screen.findByText('No tournaments yet.')).toBeVisible()
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it('shows an error when the API fails', async () => {
    server.use(http.get('/v1/tournaments', () => new HttpResponse(null, { status: 500 })))

    renderApp('/tournaments')

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load tournaments (500)')
  })

  it('shows an error when the response is not a tournament list', async () => {
    server.use(http.get('/v1/tournaments', () => HttpResponse.json([])))

    renderApp('/tournaments')

    expect(await screen.findByRole('alert')).toHaveTextContent('unexpected response')
  })

  it('announces loading', async () => {
    renderApp('/tournaments')

    expect(screen.getByRole('status')).toHaveTextContent('Loading tournaments')
    // Let the request finish so it cannot leak into the next test.
    expect(await screen.findByRole('heading', { name: 'Current and upcoming' })).toBeVisible()
  })

  it('retries after an error', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments', () =>
        ++calls === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ tournaments: [running()] }),
      ),
    )

    renderApp('/tournaments')
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Running Open')).toBeVisible()
  })
})
