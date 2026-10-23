import { http, HttpResponse } from 'msw'
import { createDemoDivisions, createDemoTournaments } from './data'

// Built once so refetches return the same list, as a real API would.
const tournaments = createDemoTournaments()
const divisions = createDemoDivisions()

export const handlers = [
  http.get('/v1/tournaments', () => HttpResponse.json({ tournaments })),
  http.get('/v1/tournaments/:id', ({ params }) => {
    const tournament = tournaments.find((candidate) => candidate.id === params.id)
    return tournament
      ? HttpResponse.json({ tournament })
      : HttpResponse.json({ message: 'Tournament not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/divisions', ({ params }) =>
    tournaments.some((candidate) => candidate.id === params.id)
      ? HttpResponse.json({ divisions })
      : HttpResponse.json({ message: 'Tournament not found' }, { status: 404 }),
  ),
]
