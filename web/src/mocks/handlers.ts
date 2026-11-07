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
  createSquad,
  createDemoSweepers,
  createDemoTournaments,
  createSettings,
  createTournament,
} from './data'
import { authHandlers } from './authHandlers'
import { userHandlers } from './userHandlers'
import type { DivisionChanges, NewDivision } from '../features/divisions/types'
import type { NewSquad } from '../features/squads/types'
import type {
  NewTournament,
  TournamentChanges,
  TournamentSettings,
} from '../features/tournaments/types'

// Built once so refetches return the same list, as a real API would.
const tournaments = createDemoTournaments()
const divisions = createDemoDivisions()
/** The demo division the mock treats as holding registered bowlers (D-151). */
const registeredDemoDivision = 'Scratch'
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
  // DIV-12 edit: the mock saves what was sent, refuses a name another division uses, and asks to
  // confirm a percent over 100. It knows no registrations or scores, and never completes a
  // tournament, so the API tests cover those rules (D-147).
  http.patch('/v1/tournaments/:id/divisions/:divisionId', async ({ params, request }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    const found = divisions.find((stored) => stored.id === params['divisionId'])
    if (!found) return HttpResponse.json({ message: 'Division not found' }, { status: 404 })
    const { confirmWarnings, ...changes } = (await request.json()) as DivisionChanges & {
      confirmWarnings?: boolean
    }
    if (
      changes.name !== undefined &&
      divisions.some(
        (stored) =>
          stored.id !== found.id &&
          stored.name.trim().toLowerCase() === changes.name?.trim().toLowerCase(),
      )
    ) {
      const message = 'A division with this name already exists in this tournament'
      return HttpResponse.json({ message, errors: { name: message } }, { status: 409 })
    }
    if ((changes.handicapPercentage ?? 0) > 100 && confirmWarnings !== true) {
      return HttpResponse.json(
        {
          message: 'Confirm these changes to save them.',
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
    Object.assign(found, changes)
    return HttpResponse.json({ division: found })
  }),
  // DIV-12 delete: the mock removes the division and closes the numbers after it (D-153). It
  // pretends 12 bowlers are registered in the demo "Scratch" division, so the refusal can be seen
  // (D-151); it never completes a tournament, so the API tests cover that rule.
  http.delete('/v1/tournaments/:id/divisions/:divisionId', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    const at = divisions.findIndex((stored) => stored.id === params['divisionId'])
    const found = divisions[at]
    if (!found) return HttpResponse.json({ message: 'Division not found' }, { status: 404 })
    if (found.name === registeredDemoDivision) {
      const message =
        '12 bowlers are registered in this division. Move them to another division first.'
      return HttpResponse.json({ message, errors: { division: message } }, { status: 409 })
    }
    divisions.splice(at, 1)
    for (const stored of divisions) if (stored.number > found.number) stored.number -= 1
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('/v1/tournaments/:id/divisions/:divisionId/delete-info', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    const found = divisions.find((stored) => stored.id === params['divisionId'])
    if (!found) return HttpResponse.json({ message: 'Division not found' }, { status: 404 })
    return HttpResponse.json({
      deleteInfo: {
        registrationCount: found.name === registeredDemoDivision ? 12 : 0,
        sweeperCount: 0,
      },
    })
  }),
  http.get('/v1/tournaments/:id/divisions/:divisionId/edit-info', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    return divisions.some((stored) => stored.id === params['divisionId'])
      ? HttpResponse.json({ editInfo: { registrationCount: 0, hasScores: false } })
      : HttpResponse.json({ message: 'Division not found' }, { status: 404 })
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
  // SQD-01 to SQD-08: the browser has checked the field rules; the mock refuses a date outside the
  // tournament and answers the list shape, with the tournament's values for a blank override. It
  // never completes a tournament, so the API tests cover that refusal (D-171).
  http.post('/v1/tournaments/:id/squads', async ({ params, request }) => {
    const tournament = tournaments.find((candidate) => candidate.id === params['id'])
    if (!tournament) return notFound()
    const input = (await request.json()) as NewSquad
    const day = input.date.slice(0, 10)
    if (day < tournament.startDate || day > tournament.endDate) {
      const message =
        day < tournament.startDate
          ? 'Squad date must be after tournament start'
          : 'Squad date must be before tournament end'
      return HttpResponse.json({ message, errors: { date: message } }, { status: 409 })
    }
    const settings = createdSettings.get(tournament.id) ?? demoSettings
    const created = createSquad({
      date: `${input.date}:00`,
      startingLane: input.startingLane,
      numberOfLanes: input.numberOfLanes,
      maxPerPair: input.maxPerPair,
      entryFee: input.entryFee ?? tournament.entryFee,
      entryFeeOverridden: input.entryFee !== null,
      finalsRatio: input.finalsRatio ?? settings.finalsRatio,
      finalsRatioOverridden: input.finalsRatio !== null,
      cashRatio: input.cashRatio ?? settings.cashRatio,
      cashRatioOverridden: input.cashRatio !== null,
      games: settings.games,
    })
    squads.push(created)
    squads.sort((a, b) => a.date.localeCompare(b.date))
    return HttpResponse.json({ squad: created }, { status: 201 })
  }),
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
