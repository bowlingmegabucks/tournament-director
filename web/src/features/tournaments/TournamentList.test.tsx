import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createTournament } from '../../mocks/data'
import { renderWithClient } from '../../test/renderWithClient'
import { TournamentList } from './TournamentList'

describe('TournamentList', () => {
  it('shows tournaments returned by the API', async () => {
    const tournament = createTournament({ name: 'Spring Open', entrants: 42 })
    server.use(http.get('/api/tournaments', () => HttpResponse.json([tournament])))

    renderWithClient(<TournamentList />)

    expect(await screen.findByText('Spring Open')).toBeInTheDocument()
    expect(screen.getByText(/42 entrants/)).toBeInTheDocument()
  })

  it('shows a message when there are no tournaments', async () => {
    server.use(http.get('/api/tournaments', () => HttpResponse.json([])))

    renderWithClient(<TournamentList />)

    expect(await screen.findByText('No tournaments yet.')).toBeInTheDocument()
  })

  it('shows an error when the API fails', async () => {
    server.use(http.get('/api/tournaments', () => new HttpResponse(null, { status: 500 })))

    renderWithClient(<TournamentList />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load tournaments (500)')
  })
})
