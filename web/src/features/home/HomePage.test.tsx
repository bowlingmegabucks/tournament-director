import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createTournament } from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import { useFixedToday } from '../../test/fixedToday'
import type { Tournament } from '../tournaments/types'

function serve(tournaments: Tournament[]) {
  server.use(http.get('/v1/tournaments', () => HttpResponse.json({ tournaments })))
}

const lastYear = () =>
  createTournament({ name: 'Last Year', startDate: '2025-10-10', endDate: '2025-10-12' })

describe('HomePage', () => {
  useFixedToday(2026, 9, 21)

  it('shows the tournament in progress with a badge (TRN-14)', async () => {
    serve([
      lastYear(),
      createTournament({ name: 'Running Open', startDate: '2026-10-20', endDate: '2026-10-22' }),
    ])

    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Running Open', level: 2 })).toBeVisible()
    expect(screen.getByText('In progress')).toBeVisible()
    expect(screen.queryByText('Last Year')).not.toBeInTheDocument()
  })

  it('shows the next upcoming tournament with a badge (TRN-14)', async () => {
    serve([
      createTournament({ name: 'Later Open', startDate: '2027-02-01', endDate: '2027-02-03' }),
      createTournament({ name: 'Next Open', startDate: '2026-10-23', endDate: '2026-10-25' }),
    ])

    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Next Open' })).toBeVisible()
    expect(screen.getByText('Upcoming')).toBeVisible()
    expect(screen.queryByText('Later Open')).not.toBeInTheDocument()
  })

  it('prefers the one in progress over one that is upcoming (TRN-14)', async () => {
    serve([
      createTournament({ name: 'Next Open', startDate: '2026-10-23', endDate: '2026-10-25' }),
      createTournament({ name: 'Running Open', startDate: '2026-10-20', endDate: '2026-10-22' }),
    ])

    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Running Open' })).toBeVisible()
  })

  it('links the card to the tournament and offers all tournaments (TRN-14)', async () => {
    const tournament = createTournament({
      name: 'Next Open',
      startDate: '2026-10-23',
      endDate: '2026-10-25',
    })
    serve([tournament])

    renderApp('/')

    expect(await screen.findByRole('link', { name: 'Next Open' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}`,
    )
    expect(screen.getByRole('link', { name: 'All tournaments' })).toHaveAttribute(
      'href',
      '/tournaments',
    )
  })

  it('says nothing is current when every tournament is past (TRN-14)', async () => {
    serve([lastYear()])

    renderApp('/')

    expect(await screen.findByText('No tournament is current or upcoming.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'All tournaments' })).toBeVisible()
  })

  it('says there are none, with no link to an empty list (TRN-14)', async () => {
    serve([])

    renderApp('/')

    expect(await screen.findByText('No tournaments yet.')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'All tournaments' })).not.toBeInTheDocument()
  })

  it('shows an error when the API fails, and recovers on retry', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments', () =>
        ++calls === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({
              tournaments: [
                createTournament({
                  name: 'Next Open',
                  startDate: '2026-10-23',
                  endDate: '2026-10-25',
                }),
              ],
            }),
      ),
    )

    renderApp('/')
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load tournaments (503)')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Next Open' })).toBeVisible()
  })

  it('announces loading', async () => {
    renderApp('/')

    expect(screen.getByRole('status')).toHaveTextContent('Loading tournaments')
    expect(await screen.findByRole('link', { name: 'All tournaments' })).toBeVisible()
  })

  it('has no Check API button now that the API reads the database (D-29)', async () => {
    serve([])

    renderApp('/')

    await screen.findByText('No tournaments yet.')
    expect(screen.queryByRole('button', { name: 'Check API' })).not.toBeInTheDocument()
  })
})
