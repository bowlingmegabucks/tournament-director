import { http, HttpResponse } from 'msw'
import {
  createDemoAtLarge,
  createDemoDivisions,
  createDemoLanePage,
  createDemoRecapSheets,
  createDemoRegistrationList,
  createDemoScorePage,
  createDemoSeeding,
  createDemoSquadResults,
  createDemoSuperSweeper,
  createDemoSweeperResults,
  createDemoSquads,
  createDemoSweepers,
  createDemoTournaments,
  createSettings,
  createTournament,
} from './data'
import { authHandlers } from './authHandlers'
import { userHandlers } from './userHandlers'
import type {
  NewTournament,
  TournamentChanges,
  TournamentSettings,
} from '../features/tournaments/types'

// Built once so refetches return the same list, as a real API would.
const tournaments = createDemoTournaments()
const divisions = createDemoDivisions()
const squads = createDemoSquads()
const sweepers = createDemoSweepers(divisions)
const registrations = createDemoRegistrationList(divisions, squads, sweepers)

const demoSettings = createSettings()
// What each tournament made through the form was given, so the overview shows what was typed.
const createdSettings = new Map<string, TournamentSettings>()

const notFound = () => HttpResponse.json({ message: 'Tournament not found' }, { status: 404 })

export const handlers = [
  ...authHandlers,
  ...userHandlers,
  http.get('/v1/tournaments', () => HttpResponse.json({ tournaments })),
  // TRN-19: the browser has checked the rules; the mock only refuses a duplicate, as the API does.
  http.post('/v1/tournaments', async ({ request }) => {
    const body = (await request.json()) as NewTournament
    const duplicate = tournaments.some(
      (candidate) =>
        candidate.startDate === body.startDate &&
        candidate.name.trim().toLowerCase() === body.name.trim().toLowerCase(),
    )
    if (duplicate) {
      const message = 'A tournament with this name and start date already exists'
      return HttpResponse.json({ message, errors: { name: message } }, { status: 409 })
    }
    const { games, finalsRatio, cashRatio, superSweeperCashRatio, ...summary } = body
    const created = createTournament(summary)
    tournaments.push(created)
    createdSettings.set(created.id, { games, finalsRatio, cashRatio, superSweeperCashRatio })
    return HttpResponse.json({ tournament: created }, { status: 201 })
  }),
  // TRN-24: the API decides locks and warnings (D-128, D-129); the mock only applies the change
  // and refuses a duplicate, so `dev:mocks` shows the form working.
  http.patch('/v1/tournaments/:id', async ({ params, request }) => {
    const found = tournaments.find((candidate) => candidate.id === params.id)
    if (!found) return notFound()
    // The mock never warns, so it ignores `confirmWarnings`.
    const changes = (await request.json()) as TournamentChanges
    delete changes.confirmWarnings
    const { games, finalsRatio, cashRatio, superSweeperCashRatio, ...summary } = changes
    const next = { ...found, ...summary }
    const duplicate = tournaments.some(
      (candidate) =>
        candidate.id !== found.id &&
        candidate.startDate === next.startDate &&
        candidate.name.trim().toLowerCase() === next.name.trim().toLowerCase(),
    )
    if (duplicate) {
      const message = 'A tournament with this name and start date already exists'
      return HttpResponse.json({ message, errors: { name: message } }, { status: 409 })
    }
    Object.assign(found, summary)
    const settings = {
      ...(createdSettings.get(found.id) ?? demoSettings),
      ...(games === undefined ? {} : { games }),
      ...(finalsRatio === undefined ? {} : { finalsRatio }),
      ...(cashRatio === undefined ? {} : { cashRatio }),
      ...(superSweeperCashRatio === undefined ? {} : { superSweeperCashRatio }),
    }
    createdSettings.set(found.id, settings)
    return HttpResponse.json({ tournament: { ...found, ...settings } })
  }),
  http.get('/v1/tournaments/:id/edit-info', ({ params }) =>
    tournaments.some((candidate) => candidate.id === params.id)
      ? HttpResponse.json({
          editInfo: { registrationCount: 0, hasScores: false, hasSweeperScores: false },
        })
      : notFound(),
  ),
  http.get('/v1/tournaments/:id/settings', ({ params }) =>
    tournaments.some((candidate) => candidate.id === params.id)
      ? HttpResponse.json({
          settings: {
            ...(createdSettings.get(String(params.id)) ?? demoSettings),
            completed: false,
          },
        })
      : notFound(),
  ),
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
  http.get('/v1/tournaments/:id/at-large', ({ params }) =>
    tournaments.some((candidate) => candidate.id === params.id)
      ? HttpResponse.json(createDemoAtLarge())
      : notFound(),
  ),
  http.get('/v1/tournaments/:id/seeding', ({ params }) =>
    tournaments.some((candidate) => candidate.id === params.id)
      ? HttpResponse.json(createDemoSeeding())
      : notFound(),
  ),
  http.get('/v1/tournaments/:id/super-sweeper', ({ params }) =>
    tournaments.some((candidate) => candidate.id === params.id)
      ? HttpResponse.json(createDemoSuperSweeper(sweepers))
      : notFound(),
  ),
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
