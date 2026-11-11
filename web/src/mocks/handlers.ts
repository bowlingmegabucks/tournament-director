import { http, HttpResponse } from 'msw'
import { sse } from 'msw/sse'
import {
  createDemoAtLarge,
  createDivision,
  createDemoDivisions,
  createDemoLanePage,
  createDemoLiveResults,
  createDemoRecapSheets,
  createDemoRegistrationList,
  createDemoSeeding,
  createDemoSquadResults,
  createDemoSuperSweeper,
  createDemoSweeperResults,
  createDemoSquads,
  createSquad,
  createDemoSweepers,
  createSweeper,
  createDemoTournaments,
  createSettings,
  createTournament,
} from './data'
import { createDemoGamesView, createDemoScoresWithSaves, mockScoreChange } from './gamesData'
import { authHandlers } from './authHandlers'
import { userHandlers } from './userHandlers'
import { createRegistrationHandlers } from './registrationHandlers'
import type { DivisionChanges, NewDivision } from '../features/divisions/types'
import { formatPair } from '../features/lanes/format'
import { applyMoves, planMove, type Move } from '../features/lanes/optimisticMove'
import type { LaneBowler, LanePage } from '../features/lanes/types'
import type { RankMode } from '../features/results/types'
import type { SessionKind } from '../shared/session'
import type { NewSquad, Squad, SquadChanges } from '../features/squads/types'
import type { NewSweeper, Sweeper, SweeperChanges } from '../features/sweepers/types'
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
// The demo's second squad pretends 12 bowlers entered, and its first sweeper pretends scores are
// saved, so the edit pages show their notes, a warning, and a lock in the browser (D-180).
const busySquadId = squads[1]?.id
const scoredSweeperId = sweepers[0]?.id

const demoSettings = createSettings()
// The demo's past tournaments are complete, so the e2e tests can see what a complete one refuses (D-130).
const completedIds = new Set(tournaments.slice(1).map((tournament) => tournament.id))
// What each tournament made through the form was given, so the overview shows what was typed.
const createdSettings = new Map<string, TournamentSettings>()

// Entries, assignments, and scores are not kept: only the two demo sessions above pretend (D-180).
const noSessionFacts = {
  entryCount: 0,
  assignmentCount: 0,
  hasScores: false,
  lowestAssignedLane: null,
  highestAssignedLane: null,
  fullestPair: null,
}

const busySquadFacts = { ...noSessionFacts, entryCount: 12 }

const scoredSweeperFacts = { ...noSessionFacts, hasScores: true }

/**
 * A demo lane bowler who is also in the registration list takes that registration's id, so the lane
 * page's Registration actions (D-197) reach the same registration the edit page does. A bowler who
 * is not in the list keeps one id for the life of the page (by name), so a move saved by id finds
 * the same bowler on the next read (LAN-20); the edit routes answer 404 for it.
 */
const unlistedIds = new Map<string, string>()

function withListedRegistrations(page: LanePage): LanePage {
  const idOf = (bowler: LaneBowler) => {
    const listed = registrations.registrations.find(
      (row) => row.bowler.firstName === bowler.firstName && row.bowler.lastName === bowler.lastName,
    )?.id
    if (listed) return listed
    const kept = unlistedIds.get(bowler.name) ?? crypto.randomUUID()
    unlistedIds.set(bowler.name, kept)
    return kept
  }
  const remap = (bowlers: LaneBowler[]) =>
    bowlers.map((bowler) => ({ ...bowler, registrationId: idOf(bowler) }))
  return {
    ...page,
    pairs: page.pairs.map((pair) => ({ ...pair, bowlers: remap(pair.bowlers) })),
    unassigned: remap(page.unassigned),
    other: remap(page.other),
  }
}

/** Moves made through the mock `PUT`, by session and then registration. Lost when the page reloads. */
const laneMoves = new Map<string, Map<string, Move>>()
/** The skip saved through the mock `PUT`, by session (SCR-23). No entry means staggered. */
const skips = new Map<string, 'staggered' | 'same'>()
/** Scores saved through the mock `PUT`, by session and then registration. Lost when the page reloads. */
const savedScores = new Map<string, Map<string, (number | null)[]>>()
/** Registrations the keeper flagged "did not finish", by session (SCR-24). A saved score takes the flag off. */
const dnfFlags = new Map<string, Set<string>>()
/** What each open mock event stream can be told, by session (LAN-21). */
const streams = new Map<string, Set<(message: string) => void>>()

/** Forget the moves and the streams, so one test cannot see another's (the test setup calls it). */
export function resetMockLaneMoves() {
  laneMoves.clear()
  skips.clear()
  savedScores.clear()
  streams.clear()
}

function lanePageOf(kind: SessionKind, session: Parameters<typeof createDemoLanePage>[1]) {
  const page = withListedRegistrations(createDemoLanePage(kind, session, divisions))
  return applyMoves(page, laneMoves.get(session.id) ?? new Map())
}

/** Tell every open mock stream of the session that it changed, as the API does after a move (D-218). */
function publishMock(sessionId: string, kind: 'lanes' | 'entries' | 'scores' = 'lanes') {
  for (const send of streams.get(sessionId) ?? []) {
    send(JSON.stringify({ kind, version: Date.now() }))
  }
}

/** The mock twin of `PUT .../skip` (SCR-23): unknown ids are 404, a bad value 400, a complete session 409. */
function saveMockSkip(tournamentId: string, sessionId: string, kind: SessionKind, body: unknown) {
  if (!tournaments.some((candidate) => candidate.id === tournamentId)) {
    return problem('Tournament not found', 404)
  }
  const session = (kind === 'squad' ? squads : sweepers).find((entry) => entry.id === sessionId)
  if (!session) return problem(`${kind === 'squad' ? 'Squad' : 'Sweeper'} not found`, 404)
  const skip = typeof body === 'object' && body !== null && 'skip' in body ? body.skip : undefined
  if (skip !== 'staggered' && skip !== 'same') return problem('Skip must be staggered or same', 400)
  if (session.complete) return problem(`This ${kind} is complete. The skip cannot change.`, 409)
  if ((skips.get(sessionId) ?? 'staggered') !== skip) {
    skips.set(sessionId, skip)
    publishMock(sessionId)
  }
  return HttpResponse.json({ skip })
}

/** The demo session of a kind, or the 404 that says it is missing. */
function mockSession(tournamentId: string, sessionId: string, kind: SessionKind) {
  if (!tournaments.some((candidate) => candidate.id === tournamentId)) {
    return { missing: problem('Tournament not found', 404) }
  }
  const session = (kind === 'squad' ? squads : sweepers).find((entry) => entry.id === sessionId)
  return session
    ? { session }
    : { missing: problem(`${kind === 'squad' ? 'Squad' : 'Sweeper'} not found`, 404) }
}

/** The mock twin of `GET .../scores/games` (SCR-22). */
function mockGames(tournamentId: string, sessionId: string, kind: SessionKind) {
  const found = mockSession(tournamentId, sessionId, kind)
  if (found.missing) return found.missing
  return HttpResponse.json(
    createDemoGamesView(
      kind,
      found.session,
      divisions,
      skips.get(sessionId) ?? 'staggered',
      savedScores.get(sessionId),
      dnfFlags.get(sessionId),
    ),
  )
}

/** The mock twin of `PUT` and `DELETE .../scores/:registrationId/dnf` (SCR-24). */
function flagMockDnf(
  params: Readonly<Record<string, string | readonly string[] | undefined>>,
  kind: SessionKind,
  flagged: boolean,
) {
  const sessionId = String(params['sessionId'])
  const registrationId = String(params['registrationId'])
  const found = mockSession(String(params['id']), sessionId, kind)
  if (found.missing) return found.missing
  if (found.session.complete) {
    return problem(`This ${kind} is complete. Did not finish cannot change.`, 409)
  }
  const page = createDemoScoresWithSaves(kind, found.session, divisions, savedScores.get(sessionId))
  const bowler = [...page.pairs.flatMap((pair) => pair.bowlers), ...page.other].find(
    (entry) => entry.registrationId === registrationId,
  )
  if (!bowler) return problem(`Bowler is not registered for this ${kind}`, 404)
  if (flagged && bowler.scores.every((score) => score === null)) {
    return problem('This bowler has no score yet, so there is nothing to finish.', 409)
  }
  const flags = dnfFlags.get(sessionId) ?? new Set<string>()
  if (flagged) flags.add(registrationId)
  else flags.delete(registrationId)
  dnfFlags.set(sessionId, flags)
  publishMock(sessionId, 'scores')
  return new HttpResponse(null, { status: 204 })
}

/** The mock twin of `PUT` and `DELETE .../scores/:registrationId/:game` (SCR-19). `score` null clears. */
function saveMockScore(
  params: Readonly<Record<string, string | readonly string[] | undefined>>,
  kind: SessionKind,
  score: number | null,
) {
  const sessionId = String(params['sessionId'])
  const registrationId = String(params['registrationId'])
  const found = mockSession(String(params['id']), sessionId, kind)
  if (found.missing) return found.missing
  const page = createDemoScoresWithSaves(kind, found.session, divisions, savedScores.get(sessionId))
  const bowler = [...page.pairs.flatMap((pair) => pair.bowlers), ...page.other].find(
    (entry) => entry.registrationId === registrationId,
  )
  if (!bowler) return problem(`Bowler is not registered for this ${kind}`, 404)
  const result = mockScoreChange(
    bowler.scores,
    page.session.games,
    Number(params['game']),
    score,
    found.session.complete,
  )
  if (result.status !== 200) return problem(result.message, result.status)
  const bySession = savedScores.get(sessionId) ?? new Map<string, (number | null)[]>()
  bySession.set(registrationId, result.scores)
  savedScores.set(sessionId, bySession)
  // D-250: a saved score counts the bowler again. A clear leaves the flag.
  if (score !== null) dnfFlags.get(sessionId)?.delete(registrationId)
  publishMock(sessionId, 'scores')
  return HttpResponse.json({
    scores: result.scores,
    total: result.scores.reduce<number>((sum, value) => sum + (value ?? 0), 0),
  })
}

function problem(message: string, status: number) {
  return HttpResponse.json({ message }, { status })
}

/** The mock refusal for a move into a pair (D-216), or the planned move. */
function planPairMove(
  kind: SessionKind,
  page: LanePage,
  bowler: LaneBowler,
  lane: unknown,
): Move | Response {
  const pair = page.pairs.find((candidate) => candidate.firstLane === lane)
  if (!pair) {
    return problem(`Lane ${String(lane)} is not the first lane of a pair in this ${kind}`, 400)
  }
  if (pair.bowlers.some((candidate) => candidate.registrationId === bowler.registrationId)) {
    return HttpResponse.json({ position: bowler.position })
  }
  if (pair.bowlers.length >= pair.capacity) {
    return problem(
      `${formatPair(pair)} ${pair.lanes.length === 1 ? 'is' : 'are'} full (${pair.bowlers.length} of ${pair.capacity}). Pick another pair.`,
      409,
    )
  }
  return planMove(bowler, pair)
}

/** The mock twin of the lane move (D-216): refuse a full pair, pick the seat, remember it, tell the streams. */
function laneMoveHandler(kind: SessionKind, sessions: { id: string; complete: boolean }[]) {
  const label = kind === 'squad' ? 'Squad' : 'Sweeper'
  return http.put(
    `/v1/tournaments/:id/${kind}s/:sessionId/lanes/:registrationId`,
    async ({ params, request }) => {
      if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
      const found = (kind === 'squad' ? squads : sweepers).find(
        (candidate) => candidate.id === params['sessionId'],
      )
      if (!found) return problem(`${label} not found`, 404)
      if (sessions.find((candidate) => candidate.id === found.id)?.complete ?? found.complete) {
        return problem(`This ${kind} is complete. Lanes cannot change.`, 409)
      }
      const body: unknown = await request.json()
      const lane = typeof body === 'object' && body !== null ? Reflect.get(body, 'lane') : undefined
      const page = lanePageOf(kind, found)
      const everyone = [...page.pairs.flatMap((pair) => pair.bowlers), ...page.unassigned]
      const bowler = everyone.find(
        (candidate) => candidate.registrationId === params['registrationId'],
      )
      if (!bowler) return problem(`Bowler is not registered for this ${kind}`, 404)
      const move =
        lane === null ? planMove(bowler, 'unassigned') : planPairMove(kind, page, bowler, lane)
      if (move instanceof Response) return move
      laneMoves.set(found.id, new Map(laneMoves.get(found.id)).set(bowler.registrationId, move))
      publishMock(found.id)
      return HttpResponse.json({ position: move.position })
    },
  )
}

/** The ranking mode a request asks for: steady unless it says `live` (RES-45). */
function modeOf(query: URLSearchParams): RankMode {
  return query.get('mode') === 'live' ? 'live' : 'full-game'
}

/**
 * The mock event streams (LAN-21). Kept out of `handlers` because MSW builds an `sse` handler only
 * where `EventSource` exists: the browser sets these up, the Node test server does not.
 */
export function createEventStreamHandlers() {
  return [
    eventsHandler('squad'),
    eventsHandler('sweeper'),
    eventsHandler('squad', '/scores/events'),
    eventsHandler('sweeper', '/scores/events'),
  ]
}

/**
 * The mock event stream of a session: it sends `changed` whenever the mock `PUT` saves a move
 * (LAN-21). The public score stream (SCR-20) shares the same list, as the API's hub does.
 */
function eventsHandler(kind: SessionKind, suffix = '/events') {
  return sse<{ changed: string }>(
    `/v1/tournaments/:id/${kind}s/:sessionId${suffix}`,
    ({ client, params }) => {
      const sessionId = String(params['sessionId'])
      const send = (data: string) => {
        client.send({ event: 'changed', data })
      }
      streams.set(sessionId, (streams.get(sessionId) ?? new Set()).add(send))
    },
  )
}

/** What the delete rules look at for a demo session (D-186). The busy squad has 12 bowlers; the scored sweeper has scores. */
function deleteInfoOf(sessionId: string) {
  return {
    entryCount: sessionId === busySquadId ? 12 : 0,
    scoreCount: sessionId === scoredSweeperId ? 30 : 0,
  }
}

/** The `409` a delete answers when bowlers are entered or scores are saved (D-186). */
function deleteRefusal(kind: 'squad' | 'sweeper', sessionId: string) {
  const { entryCount, scoreCount } = deleteInfoOf(sessionId)
  const errors: Record<string, string> = {}
  if (entryCount > 0) {
    errors['entries'] =
      `${entryCount} bowlers are entered in this ${kind}. Remove them from the ${kind} first.`
  }
  if (scoreCount > 0)
    errors['scores'] = `Scores are saved for this ${kind}, so it cannot be deleted.`
  const message = Object.values(errors)[0]
  return message ? HttpResponse.json({ message, errors }, { status: 409 }) : undefined
}

const notFound = () => HttpResponse.json({ message: 'Tournament not found' }, { status: 404 })

/** A `409` that names the date box when a date falls outside the tournament; else undefined. */
function dateOutsideTournament(
  date: string | undefined,
  tournament: { startDate: string; endDate: string },
  noun: string,
) {
  if (date === undefined) return undefined
  const day = date.slice(0, 10)
  if (day >= tournament.startDate && day <= tournament.endDate) return undefined
  const message =
    day < tournament.startDate
      ? `${noun} date must be after tournament start`
      : `${noun} date must be before tournament end`
  return HttpResponse.json({ message, errors: { date: message } }, { status: 409 })
}

function confirmRefusal(warnings: { field: string; message: string }[]) {
  return HttpResponse.json(
    { message: 'Confirm these changes to save them.', warnings },
    { status: 409 },
  )
}

function busySquadWarnings(changes: SquadChanges) {
  const warnings: { field: string; message: string }[] = []
  if (changes.date !== undefined) {
    warnings.push({
      field: 'date',
      message: '12 bowlers are entered. They planned around this time. Tell them.',
    })
  }
  if (changes.entryFee !== undefined) {
    warnings.push({
      field: 'entryFee',
      message: '12 bowlers are entered. They keep what they paid. New entries pay the new fee.',
    })
  }
  return warnings
}

function applySquadChanges(
  found: Squad,
  changes: SquadChanges,
  tournament: { entryFee: number },
  settings: { finalsRatio: number; cashRatio: number },
) {
  if (changes.date !== undefined) found.date = `${changes.date}:00`
  if (changes.startingLane !== undefined) found.startingLane = changes.startingLane
  if (changes.numberOfLanes !== undefined) found.numberOfLanes = changes.numberOfLanes
  if (changes.maxPerPair !== undefined) found.maxPerPair = changes.maxPerPair
  if (changes.entryFee !== undefined) {
    found.entryFee = changes.entryFee ?? tournament.entryFee
    found.entryFeeOverridden = changes.entryFee !== null
  }
  if (changes.finalsRatio !== undefined) {
    found.finalsRatio = changes.finalsRatio ?? settings.finalsRatio
    found.finalsRatioOverridden = changes.finalsRatio !== null
  }
  if (changes.cashRatio !== undefined) {
    found.cashRatio = changes.cashRatio ?? settings.cashRatio
    found.cashRatioOverridden = changes.cashRatio !== null
  }
}

function scoredSweeperWarnings(changes: SweeperChanges) {
  const results = 'Scores are saved. Posted results change at once.'
  const warnings: { field: string; message: string }[] = []
  if (changes.cashRatio !== undefined) warnings.push({ field: 'cashRatio', message: results })
  for (const id of Object.keys(changes.bonusPins ?? {})) {
    const name = divisions.find((entry) => entry.id === id)?.name ?? 'Division'
    warnings.push({
      field: `bonusPins.${id}`,
      message: `${name}: scores are saved. Posted results change at once.`,
    })
  }
  return warnings
}

function applySweeperChanges(found: Sweeper, changes: SweeperChanges) {
  if (changes.date !== undefined) found.date = `${changes.date}:00`
  if (changes.startingLane !== undefined) found.startingLane = changes.startingLane
  if (changes.numberOfLanes !== undefined) found.numberOfLanes = changes.numberOfLanes
  if (changes.maxPerPair !== undefined) found.maxPerPair = changes.maxPerPair
  if (changes.entryFee !== undefined) found.entryFee = changes.entryFee
  if (changes.games !== undefined) found.games = changes.games
  if (changes.cashRatio !== undefined) found.cashRatio = changes.cashRatio
  if (changes.bonusPins === undefined) return
  const stored = new Map(found.bonusPins.map((pin) => [pin.divisionId, pin.bonusPinsPerGame]))
  for (const [id, pins] of Object.entries(changes.bonusPins)) stored.set(id, pins ?? 0)
  found.bonusPins = divisions.flatMap((division) => {
    const pins = stored.get(division.id) ?? 0
    return pins === 0
      ? []
      : [{ divisionId: division.id, divisionName: division.name, bonusPinsPerGame: pins }]
  })
}

export const handlers = [
  ...authHandlers,
  ...userHandlers,
  ...createRegistrationHandlers({ tournaments, divisions, squads, sweepers, registrations }),
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
            completed: completedIds.has(String(params.id)),
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
  // SQD-23 edit: the browser has checked the field rules; the mock saves what was sent, refuses a date
  // outside the tournament, and shows a cleared fee or ratio as the tournament's value. It knows no
  // entries, assignments, or scores and never completes anything, so the API tests cover those
  // rules (D-180).
  http.patch('/v1/tournaments/:id/squads/:sessionId', async ({ params, request }) => {
    const tournament = tournaments.find((candidate) => candidate.id === params['id'])
    if (!tournament) return notFound()
    const found = squads.find((candidate) => candidate.id === params['sessionId'])
    if (!found) return HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
    const changes = (await request.json()) as SquadChanges & { confirmWarnings?: boolean }
    const confirmed = changes.confirmWarnings === true
    delete changes.confirmWarnings
    const dateRefusal = dateOutsideTournament(changes.date, tournament, 'Squad')
    if (dateRefusal) return dateRefusal
    // The demo's busy squad warns about its date and fee until the director confirms (SQD-25).
    if (found.id === busySquadId && !confirmed) {
      const warnings = busySquadWarnings(changes)
      if (warnings.length > 0) return confirmRefusal(warnings)
    }
    applySquadChanges(
      found,
      changes,
      tournament,
      createdSettings.get(tournament.id) ?? demoSettings,
    )
    squads.sort((a, b) => a.date.localeCompare(b.date))
    return HttpResponse.json({ squad: found })
  }),
  http.get('/v1/tournaments/:id/squads/:sessionId/edit-info', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    return squads.some((candidate) => candidate.id === params['sessionId'])
      ? HttpResponse.json({
          editInfo: params['sessionId'] === busySquadId ? busySquadFacts : noSessionFacts,
        })
      : HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
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
      ? HttpResponse.json(lanePageOf('squad', squad))
      : HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
  }),
  laneMoveHandler('squad', squads),
  http.get('/v1/tournaments/:id/sweepers/:sessionId/lanes', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const sweeper = sweepers.find((candidate) => candidate.id === params.sessionId)
    return sweeper
      ? HttpResponse.json(lanePageOf('sweeper', sweeper))
      : HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
  }),
  laneMoveHandler('sweeper', sweepers),
  // SCR-22, SCR-19: score entry. The mock keeps saved scores in memory and tells the streams.
  http.get('/v1/tournaments/:id/squads/:sessionId/scores/games', ({ params }) =>
    mockGames(String(params['id']), String(params['sessionId']), 'squad'),
  ),
  http.get('/v1/tournaments/:id/sweepers/:sessionId/scores/games', ({ params }) =>
    mockGames(String(params['id']), String(params['sessionId']), 'sweeper'),
  ),
  // The DNF routes come first: `dnf` would otherwise read as a game number.
  http.put('/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/dnf', ({ params }) =>
    flagMockDnf(params, 'squad', true),
  ),
  http.put('/v1/tournaments/:id/sweepers/:sessionId/scores/:registrationId/dnf', ({ params }) =>
    flagMockDnf(params, 'sweeper', true),
  ),
  http.delete('/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/dnf', ({ params }) =>
    flagMockDnf(params, 'squad', false),
  ),
  http.delete('/v1/tournaments/:id/sweepers/:sessionId/scores/:registrationId/dnf', ({ params }) =>
    flagMockDnf(params, 'sweeper', false),
  ),
  http.put(
    '/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/:game',
    async ({ params, request }) =>
      saveMockScore(params, 'squad', ((await request.json()) as { score: number }).score),
  ),
  http.put(
    '/v1/tournaments/:id/sweepers/:sessionId/scores/:registrationId/:game',
    async ({ params, request }) =>
      saveMockScore(params, 'sweeper', ((await request.json()) as { score: number }).score),
  ),
  http.delete('/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/:game', ({ params }) =>
    saveMockScore(params, 'squad', null),
  ),
  http.delete(
    '/v1/tournaments/:id/sweepers/:sessionId/scores/:registrationId/:game',
    ({ params }) => saveMockScore(params, 'sweeper', null),
  ),
  http.get('/v1/tournaments/:id/squads/:sessionId/scores', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const squad = squads.find((candidate) => candidate.id === params.sessionId)
    return squad
      ? HttpResponse.json(
          createDemoScoresWithSaves('squad', squad, divisions, savedScores.get(squad.id)),
        )
      : HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/sweepers/:sessionId/scores', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const sweeper = sweepers.find((candidate) => candidate.id === params.sessionId)
    return sweeper
      ? HttpResponse.json(
          createDemoScoresWithSaves('sweeper', sweeper, divisions, savedScores.get(sweeper.id)),
        )
      : HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/squads/:sessionId/results', ({ params, request }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const squad = squads.find((candidate) => candidate.id === params.sessionId)
    const query = new URL(request.url).searchParams
    return squad
      ? HttpResponse.json(
          createDemoSquadResults(
            squad,
            divisions,
            modeOf(query),
            query.get('division') ?? undefined,
          ),
        )
      : HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/sweepers/:sessionId/results', ({ params, request }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const sweeper = sweepers.find((candidate) => candidate.id === params.sessionId)
    return sweeper
      ? HttpResponse.json(
          createDemoSweeperResults(sweeper, modeOf(new URL(request.url).searchParams)),
        )
      : HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/live-results', ({ params }) => {
    const tournament = tournaments.find((candidate) => candidate.id === params.id)
    return tournament
      ? HttpResponse.json(createDemoLiveResults(tournament, squads, sweepers, divisions))
      : notFound()
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
  http.get('/v1/tournaments/:id/super-sweeper', ({ params, request }) =>
    tournaments.some((candidate) => candidate.id === params.id)
      ? HttpResponse.json(
          createDemoSuperSweeper(sweepers, modeOf(new URL(request.url).searchParams)),
        )
      : notFound(),
  ),
  http.get('/v1/tournaments/:id/squads/:sessionId/recap-sheets', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const squad = squads.find((candidate) => candidate.id === params.sessionId)
    return squad
      ? HttpResponse.json({
          ...createDemoRecapSheets('squad', squad, divisions),
          skip: skips.get(squad.id) ?? 'staggered',
        })
      : HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/sweepers/:sessionId/recap-sheets', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params.id)) return notFound()
    const sweeper = sweepers.find((candidate) => candidate.id === params.sessionId)
    return sweeper
      ? HttpResponse.json({
          ...createDemoRecapSheets('sweeper', sweeper, divisions),
          skip: skips.get(sweeper.id) ?? 'staggered',
        })
      : HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
  }),
  // SCR-23, D-235: the mock keeps the skip in memory and tells the streams the lanes changed.
  http.put('/v1/tournaments/:id/squads/:sessionId/skip', async ({ params, request }) =>
    saveMockSkip(String(params['id']), String(params['sessionId']), 'squad', await request.json()),
  ),
  http.put('/v1/tournaments/:id/sweepers/:sessionId/skip', async ({ params, request }) =>
    saveMockSkip(
      String(params['id']),
      String(params['sessionId']),
      'sweeper',
      await request.json(),
    ),
  ),
  http.get('/v1/tournaments/:id/sweepers', ({ params }) =>
    tournaments.some((candidate) => candidate.id === params.id)
      ? HttpResponse.json({ sweepers })
      : HttpResponse.json({ message: 'Tournament not found' }, { status: 404 }),
  ),
  // SQD-10 to SQD-13: the browser has checked the field rules; the mock refuses a date outside the
  // tournament and a division it does not know, and answers the list shape with the nonzero pins.
  // It never completes a tournament, so the API tests cover that refusal (D-171).
  http.post('/v1/tournaments/:id/sweepers', async ({ params, request }) => {
    const tournament = tournaments.find((candidate) => candidate.id === params['id'])
    if (!tournament) return notFound()
    const input = (await request.json()) as NewSweeper
    const day = input.date.slice(0, 10)
    if (day < tournament.startDate || day > tournament.endDate) {
      const message =
        day < tournament.startDate
          ? 'Sweeper date must be after tournament start'
          : 'Sweeper date must be before tournament end'
      return HttpResponse.json({ message, errors: { date: message } }, { status: 409 })
    }
    if (Object.keys(input.bonusPins).some((id) => !divisions.some((entry) => entry.id === id))) {
      const message = 'A division no longer exists. Reload the page'
      return HttpResponse.json({ message, errors: { bonusPins: message } }, { status: 409 })
    }
    const created = createSweeper({
      date: `${input.date}:00`,
      startingLane: input.startingLane,
      numberOfLanes: input.numberOfLanes,
      maxPerPair: input.maxPerPair,
      entryFee: input.entryFee,
      games: input.games,
      cashRatio: input.cashRatio,
      bonusPins: divisions.flatMap((division) => {
        const pins = input.bonusPins[division.id] ?? 0
        return pins === 0
          ? []
          : [{ divisionId: division.id, divisionName: division.name, bonusPinsPerGame: pins }]
      }),
    })
    sweepers.push(created)
    sweepers.sort((a, b) => a.date.localeCompare(b.date))
    return HttpResponse.json({ sweeper: created }, { status: 201 })
  }),
  // SQD-23 and SQD-29 edit: the mock saves what was sent, refuses a date outside the tournament and
  // a division that is gone, and keeps only the nonzero pins, in division order. It knows no entries,
  // assignments, or scores, so the API tests cover those rules (D-180).
  http.patch('/v1/tournaments/:id/sweepers/:sessionId', async ({ params, request }) => {
    const tournament = tournaments.find((candidate) => candidate.id === params['id'])
    if (!tournament) return notFound()
    const found = sweepers.find((candidate) => candidate.id === params['sessionId'])
    if (!found) return HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
    const changes = (await request.json()) as SweeperChanges & { confirmWarnings?: boolean }
    const confirmed = changes.confirmWarnings === true
    delete changes.confirmWarnings
    const dateRefusal = dateOutsideTournament(changes.date, tournament, 'Sweeper')
    if (dateRefusal) return dateRefusal
    const sentPins = changes.bonusPins ?? {}
    if (Object.keys(sentPins).some((id) => !divisions.some((entry) => entry.id === id))) {
      const message = 'A division no longer exists. Reload the page'
      return HttpResponse.json({ message, errors: { bonusPins: message } }, { status: 409 })
    }
    // The demo's scored sweeper locks games and warns about the cash ratio and pins (D-180).
    if (found.id === scoredSweeperId) {
      if (changes.games !== undefined) {
        const message = 'Scores are saved, so the number of games cannot change.'
        return HttpResponse.json({ message, errors: { games: message } }, { status: 409 })
      }
      const warnings = scoredSweeperWarnings(changes)
      if (warnings.length > 0 && !confirmed) return confirmRefusal(warnings)
    }
    applySweeperChanges(found, changes)
    sweepers.sort((a, b) => a.date.localeCompare(b.date))
    return HttpResponse.json({ sweeper: found })
  }),
  http.delete('/v1/tournaments/:id/squads/:sessionId', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    const at = squads.findIndex((candidate) => candidate.id === params['sessionId'])
    if (at === -1) return HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
    const refusal = deleteRefusal('squad', String(params['sessionId']))
    if (refusal) return refusal
    squads.splice(at, 1)
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('/v1/tournaments/:id/squads/:sessionId/delete-info', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    return squads.some((candidate) => candidate.id === params['sessionId'])
      ? HttpResponse.json({ deleteInfo: deleteInfoOf(String(params['sessionId'])) })
      : HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
  }),
  http.delete('/v1/tournaments/:id/sweepers/:sessionId', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    const at = sweepers.findIndex((candidate) => candidate.id === params['sessionId'])
    if (at === -1) return HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
    const refusal = deleteRefusal('sweeper', String(params['sessionId']))
    if (refusal) return refusal
    sweepers.splice(at, 1)
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('/v1/tournaments/:id/sweepers/:sessionId/delete-info', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    return sweepers.some((candidate) => candidate.id === params['sessionId'])
      ? HttpResponse.json({ deleteInfo: deleteInfoOf(String(params['sessionId'])) })
      : HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
  }),
  // SQD-15 complete: the mock flips the flag and says three no-shows got zeros for the demo's busy
  // squad, none for any other. It writes no scores, so the API tests cover the zero-fill (D-190). A
  // repeat is a 409, as the API answers (D-192).
  http.post('/v1/tournaments/:id/squads/:sessionId/complete', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    const found = squads.find((candidate) => candidate.id === params['sessionId'])
    if (!found) return HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
    if (found.complete) {
      const message = 'This squad is already complete'
      return HttpResponse.json({ message, errors: { session: message } }, { status: 409 })
    }
    found.complete = true
    return HttpResponse.json({ squad: found, noShowCount: found.id === busySquadId ? 3 : 0 })
  }),
  http.get('/v1/tournaments/:id/squads/:sessionId/complete-info', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    const found = squads.find((candidate) => candidate.id === params['sessionId'])
    if (!found) return HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
    const busy = found.id === busySquadId
    return HttpResponse.json({
      completeInfo: {
        entryCount: busy ? 12 : 0,
        noScoreCount: busy ? 3 : 0,
        partialCount: busy ? 1 : 0,
        games: found.games,
      },
    })
  }),
  // SQD-16 complete: the flag only (D-191).
  http.post('/v1/tournaments/:id/sweepers/:sessionId/complete', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    const found = sweepers.find((candidate) => candidate.id === params['sessionId'])
    if (!found) return HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
    if (found.complete) {
      const message = 'This sweeper is already complete'
      return HttpResponse.json({ message, errors: { session: message } }, { status: 409 })
    }
    found.complete = true
    return HttpResponse.json({ sweeper: found })
  }),
  http.get('/v1/tournaments/:id/sweepers/:sessionId/complete-info', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    return sweepers.some((candidate) => candidate.id === params['sessionId'])
      ? HttpResponse.json({ completeInfo: { entryCount: 0 } })
      : HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
  }),
  http.get('/v1/tournaments/:id/sweepers/:sessionId/edit-info', ({ params }) => {
    if (!tournaments.some((candidate) => candidate.id === params['id'])) return notFound()
    return sweepers.some((candidate) => candidate.id === params['sessionId'])
      ? HttpResponse.json({
          editInfo: params['sessionId'] === scoredSweeperId ? scoredSweeperFacts : noSessionFacts,
        })
      : HttpResponse.json({ message: 'Sweeper not found' }, { status: 404 })
  }),
]
