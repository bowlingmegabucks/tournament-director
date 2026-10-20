import { http, HttpResponse } from 'msw'
import { createTournaments } from './data'

export const handlers = [http.get('/api/tournaments', () => HttpResponse.json(createTournaments()))]
