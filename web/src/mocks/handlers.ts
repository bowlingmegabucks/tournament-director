import { http, HttpResponse } from 'msw'
import {
  createDemoDivisions,
  createDemoLanePage,
  createDemoRecapSheets,
  createDemoRegistrationList,
  createDemoScorePage,
  createDemoSquadResults,
  createDemoSweeperResults,
  createDemoSquads,
  createDemoSweepers,
  createDemoTournaments,
} from './data'

// Built once so refetches return the same list, as a real API would.
const tournaments = createDemoTournaments()
const divisions = createDemoDivisions()
const squads = createDemoSquads()
const sweepers = createDemoSweepers(divisions)
const registrations = createDemoRegistrationList(divisions, squads, sweepers)

const notFound = () => HttpResponse.json({ message: 'Tournament not found' }, { status: 404 })

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
  http.get('/v1/tournaments/:id/squads', ({ params }) =>
    tournaments.some((candidate) => candidate.id === params.id)
      ? HttpResponse.json({ squads })
      : HttpResponse.json({ message: 'Tournament not found' }, { status: 404 }),
  ),
  http.get('/v1/tournaments/:id/registrations', ({ params }) =>
    tournaments.some((candidate) => candidate.id === params.id)
      ? HttpResponse.json(registrations)
      : HttpResponse.json({ message: 'Tournament not found' }, { status: 404 }),
  ),
  http.get('/v1/tournaments/:id/squads/:sessionId/lanes', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const squad = squads.find((candidate) => candidate.id === params.sessionId)
    return squad
      ? HttpResponse.json(createDemoLanePage('squad', squad, divisions))
      : HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/sweepers/:sessionId/lanes', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const sweeper = sweepers.find((candidate) => candidate.id === params.sessionId)
    return sweeper
      ? HttpResponse.json(createDemoLanePage('sweeper', sweeper, divisions))
      : HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/squads/:sessionId/scores', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const squad = squads.find((candidate) => candidate.id === params.sessionId)
    return squad
      ? HttpResponse.json(createDemoScorePage('squad', squad, divisions))
      : HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/sweepers/:sessionId/scores', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const sweeper = sweepers.find((candidate) => candidate.id === params.sessionId)
    return sweeper
      ? HttpResponse.json(createDemoScorePage('sweeper', sweeper, divisions))
      : HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/squads/:sessionId/results', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const squad = squads.find((candidate) => candidate.id === params.sessionId)
    return squad
      ? HttpResponse.json(createDemoSquadResults(squad, divisions))
      : HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/sweepers/:sessionId/results', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const sweeper = sweepers.find((candidate) => candidate.id === params.sessionId)
    return sweeper
      ? HttpResponse.json(createDemoSweeperResults(sweeper))
      : HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/squads/:sessionId/recap-sheets', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const squad = squads.find((candidate) => candidate.id === params.sessionId)
    return squad
      ? HttpResponse.json(createDemoRecapSheets('squad', squad, divisions))
      : HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/sweepers/:sessionId/recap-sheets', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const sweeper = sweepers.find((candidate) => candidate.id === params.sessionId)
    return sweeper
      ? HttpResponse.json(createDemoRecapSheets('sweeper', sweeper, divisions))
      : HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/sweepers', ({ params }) =>
    tournaments.some((candidate) => candidate.id === params.id)
      ? HttpResponse.json({ sweepers })
      : HttpResponse.json({ message: 'Tournament not found' }, { status: 404 }),
  ),
]
