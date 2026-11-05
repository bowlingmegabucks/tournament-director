import { http, HttpResponse } from 'msw'
import {
  createDemoAtLarge,
  createDivision,
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
import type { NewDivision } from '../features/divisions/types'
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
  // TRN-32: the API decides refusals and warnings (D-133, D-134); the mock deletes at once so
  // `dev:mocks` shows the dialog working.
  http.delete('/v1/tournaments/:id', ({ params }) => {
    const index = tournaments.findIndex((candidate) => candidate.id === params.id)
    if (index === -1) return notFound()
    tournaments.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
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
  // DIV-12: the browser has checked the rules; the mock numbers the division, refuses a used name,
  // and asks to confirm a percent over 100, as the API does (D-139, D-140, D-142). The mock keeps
  // one list of divisions for every tournament and never completes one, so it cannot scope the name
  // check to a tournament or refuse a complete one (D-140, D-143): the API tests cover those.
  http.post('/v1/tournaments/:id/divisions', async ({ params, request }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    const body = (await request.json()) as NewDivision & { confirmWarnings?: boolean }
    const { confirmWarnings, ...input } = body
    if (
      divisions.some(
        (stored) => stored.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
      )
    ) {
      const message = 'A division with this name already exists in this tournament'
      return HttpResponse.json({ message, errors: { name: message } }, { status: 409 })
    }
    if ((input.handicapPercentage ?? 0) > 100 && confirmWarnings !== true) {
      return HttpResponse.json(
        {
          message: 'Confirm to add this division.',
          warnings: [
            {
              field: 'handicapPercentage',
              message: 'A handicap percentage above 100 is unusual. Check that it is right.',
            },
          ],
        },
        { status: 409 },
      )
    }
    const created = createDivision({
      ...input,
      number: Math.max(0, ...divisions.map((stored) => stored.number)) + 1,
    })
    divisions.push(created)
    return HttpResponse.json({ division: created }, { status: 201 })
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
