import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createTournament } from '../../mocks/data'
import { renderWithClient } from '../../test/renderWithClient'
import { TournamentList } from './TournamentList'

describe('TournamentList', () => {
  it('shows tournaments returned by the API', async () => {
    const tournament = createTournament({ name: 'Spring Open', entrants: 42 })
    server.use(http.get('/tournaments', () => HttpResponse.json([tournament])))

    renderWithClient(<TournamentList />)

    expect(await screen.findByText('Spring Open')).toBeInTheDocument()
    expect(screen.getByText(/42 entrants/)).toBeInTheDocument()
  })

  it('shows a message when there are no tournaments', async () => {
    server.use(http.get('/tournaments', () => HttpResponse.json([])))

    renderWithClient(<TournamentList />)

    expect(await screen.findByText('No tournaments yet.')).toBeInTheDocument()
  })

  it('shows an error when the API fails', async () => {
    server.use(http.get('/tournaments', () => new HttpResponse(null, { status: 500 })))

    renderWithClient(<TournamentList />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load tournaments (500)')
  })

  it('shows an error when the response is not a tournament list', async () => {
    server.use(http.get('/tournaments', () => new HttpResponse('<html></html>')))

    renderWithClient(<TournamentList />)

    expect(await screen.findByRole('alert')).toHaveTextContent('response is not JSON')
  })

  it('announces loading', async () => {
    renderWithClient(<TournamentList />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading tournaments')
    // Let the request finish so it cannot leak into the next test.
    expect(await screen.findByRole('list')).toBeInTheDocument()
  })

  it('retries after an error', async () => {
    const tournament = createTournament({ name: 'Retry Open' })
    let calls = 0
    server.use(
      http.get('/tournaments', () =>
        ++calls === 1 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json([tournament]),
      ),
    )

    renderWithClient(<TournamentList />)
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Retry Open')).toBeInTheDocument()
  })
})
