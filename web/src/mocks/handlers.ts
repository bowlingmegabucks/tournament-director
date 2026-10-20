import { http, HttpResponse } from 'msw'
import { createTournaments } from './data'

// Built once so refetches return the same list, as a real API would.
const tournaments = createTournaments()

export const handlers = [http.get('/api/tournaments', () => HttpResponse.json(tournaments))]
