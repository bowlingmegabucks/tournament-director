import { http, HttpResponse } from 'msw'
import { faker } from '@faker-js/faker'
import type { Division } from '../features/divisions/types'
import type {
  BowlerRegistration,
  BowlerSearchResult,
  BowlerValues,
  DeskRegistrationRequest,
  EditRegistrationRequest,
  RegistrationList,
} from '../features/registrations/types'
import type { Squad } from '../features/squads/types'
import type { Sweeper } from '../features/sweepers/types'
import type { Tournament } from '../features/tournaments/types'

interface MockBowler extends BowlerValues {
  id: string
}

interface MockRegistration {
  id: string
  bowlerId: string
  divisionId: string
  average: number | null
  superSweeper: boolean
  squadIds: string[]
  sweeperIds: string[]
  hasScores: boolean
}

function bowler(
  fields: Partial<MockBowler> & Pick<MockBowler, 'firstName' | 'lastName'>,
): MockBowler {
  return {
    id: faker.string.uuid(),
    middleInitial: '',
    suffix: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    email: '',
    phoneNumber: '',
    usbcId: '',
    dateOfBirth: '',
    gender: '',
    ...fields,
  }
}

const displayName = (b: BowlerValues) =>
  b.suffix === '' ? `${b.firstName} ${b.lastName}` : `${b.firstName} ${b.lastName}, ${b.suffix}`

const sameText = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' }) === 0
const startsWith = (value: string, prefix: string) =>
  sameText(value.slice(0, prefix.length), prefix)

interface World {
  tournaments: Tournament[]
  divisions: Division[]
  squads: Squad[]
  sweepers?: Sweeper[]
  registrations: RegistrationList
}

/**
 * The desk's add-registration routes for the mock server (D-157). It keeps its own bowlers, built
 * from the registration list plus a few that are not registered, and changes the list when a
 * registration is saved, so a test can add one and see the row. It follows the API's rules the
 * desk cares about (names, handicap USBC ID, squads, the two conflicts, a division move after
 * scores) and never completes a tournament: the API tests cover the rest.
 */
export function createRegistrationHandlers({
  tournaments,
  divisions,
  squads,
  sweepers = [],
  registrations,
}: World) {
  const bowlers: MockBowler[] = [
    bowler({
      firstName: 'Maria',
      lastName: 'Gonzalez',
      street: '14 Elm Street',
      city: 'Worcester',
      state: 'MA',
      zipCode: '01604',
      email: 'maria.g@example.com',
      phoneNumber: '5085550142',
      usbcId: '1234-56789',
      dateOfBirth: '1984-03-09',
      gender: 'Female',
    }),
    bowler({ firstName: 'Maria', lastName: 'Gonzales', city: 'Quincy', state: 'MA' }),
    bowler({
      firstName: 'Maria',
      lastName: 'Gonzalez',
      suffix: 'Jr',
      city: 'Albany',
      state: 'NY',
      usbcId: '2233-44556',
    }),
    bowler({
      firstName: 'Race',
      lastName: 'Runner',
      city: 'Boston',
      state: 'MA',
      usbcId: '7000-10001',
    }),
    // Registered, with a score: the division is locked (D-160). Not in the list the page first shows.
    bowler({
      firstName: 'Sam',
      lastName: 'Scored',
      city: 'Lowell',
      state: 'MA',
      usbcId: '8000-20002',
    }),
  ]
  const stored: MockRegistration[] = []
  // Becomes registered the moment someone saves for it, so the desk meets a conflict it could not see (D-159).
  const racing = new Set(
    bowlers.filter((candidate) => candidate.lastName === 'Runner').map((b) => b.id),
  )

  // The bowlers of the demo list are stored bowlers too, registered in their division.
  for (const entry of registrations.registrations) {
    bowlers.push(
      bowler({
        id: entry.bowler.id,
        firstName: entry.bowler.firstName,
        lastName: entry.bowler.lastName,
        usbcId: entry.bowler.usbcId,
        city: 'Worcester',
        state: 'MA',
      }),
    )
    stored.push({
      id: entry.id,
      bowlerId: entry.bowler.id,
      divisionId: entry.divisionId,
      average: 190,
      superSweeper: entry.superSweeper,
      squadIds: [...entry.squadIds],
      sweeperIds: [...entry.sweeperIds],
      hasScores: false,
    })
  }
  const sam = bowlers.find((candidate) => candidate.lastName === 'Scored')
  const open = squads.find((squad) => !squad.complete)
  const firstDivision = divisions[0]
  if (sam && firstDivision && open) {
    stored.push({
      id: faker.string.uuid(),
      bowlerId: sam.id,
      divisionId: firstDivision.id,
      average: 185,
      superSweeper: false,
      squadIds: [open.id],
      sweeperIds: [],
      hasScores: true,
    })
  }

  // Hooks for the e2e tests: a search that fails once, one that finds more than 25, and a save that fails once.
  let boomed = false
  let flaked = false
  let editFlaked = false
  const crowd: BowlerSearchResult[] = Array.from({ length: 26 }, (_, index) => ({
    id: faker.string.uuid(),
    name: `Pat Many${String(index).padStart(2, '0')}`,
    firstName: 'Pat',
    lastName: `Many${String(index).padStart(2, '0')}`,
    usbcId: '',
    city: 'Salem',
    state: 'MA',
    registered: null,
  }))

  const tournamentExists = (id: unknown) => tournaments.some((candidate) => candidate.id === id)
  const registrationOf = (bowlerId: string) => stored.find((entry) => entry.bowlerId === bowlerId)
  const divisionName = (id: string) => divisions.find((division) => division.id === id)?.name ?? ''

  function toSearchResult(candidate: MockBowler): BowlerSearchResult {
    const registration = registrationOf(candidate.id)
    return {
      id: candidate.id,
      name: displayName(candidate),
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      usbcId: candidate.usbcId,
      city: candidate.city,
      state: candidate.state,
      registered:
        registration && !racing.has(candidate.id)
          ? { divisionName: divisionName(registration.divisionId) }
          : null,
    }
  }

  function toRegistration(entry: MockRegistration): BowlerRegistration {
    return {
      id: entry.id,
      divisionId: entry.divisionId,
      divisionName: divisionName(entry.divisionId),
      average: entry.average,
      superSweeper: entry.superSweeper,
      squadIds: entry.squadIds,
      sweeperIds: entry.sweeperIds,
      hasScores: entry.hasScores,
    }
  }

  /** What a bowler paid outside this system, by last name (D-210): Tom Delgado paid $85. */
  const paymentsOf = (owner: MockBowler) =>
    owner.lastName === 'Delgado' ? [{ system: 'BowlingSite', amount: 85 }] : []

  function deleteFacts(entry: MockRegistration, owner: MockBowler) {
    const sessions = [
      ...squads.filter((squad) => entry.squadIds.includes(squad.id)),
      ...sweepers.filter((sweeper) => entry.sweeperIds.includes(sweeper.id)),
    ]
    const entries = [
      ...entry.squadIds.flatMap((squadId) => {
        const squad = squads.find((candidate) => candidate.id === squadId)
        return squad
          ? [{ id: squad.id, kind: 'squad' as const, date: squad.date, entryFee: squad.entryFee }]
          : []
      }),
      ...entry.sweeperIds.flatMap((sweeperId) => {
        const sweeper = sweepers.find((candidate) => candidate.id === sweeperId)
        return sweeper
          ? [
              {
                id: sweeper.id,
                kind: 'sweeper' as const,
                date: sweeper.date,
                entryFee: sweeper.entryFee,
              },
            ]
          : []
      }),
    ].sort((a, b) => a.date.localeCompare(b.date))
    const payments = paymentsOf(owner)
    return {
      bowlerName: displayName(owner),
      divisionName: divisionName(entry.divisionId),
      tournamentComplete: false,
      hasScores: entry.hasScores || sessions.some((session) => session.complete),
      entries,
      entriesTotal: entries.reduce((sum, item) => sum + item.entryFee, 0),
      payments,
      paidTotal: payments.reduce((sum, item) => sum + item.amount, 0),
    }
  }

  function removeRegistration(entry: MockRegistration) {
    stored.splice(stored.indexOf(entry), 1)
    const list = registrations.registrations
    const at = list.findIndex((row) => row.id === entry.id)
    if (at !== -1) list.splice(at, 1)
    const { summary } = registrations
    summary.registrations -= 1
    if (entry.superSweeper) summary.superSweepers -= 1
    for (const division of summary.divisions) {
      if (division.id === entry.divisionId) division.entries -= entry.squadIds.length
    }
    for (const squad of summary.squads) if (entry.squadIds.includes(squad.id)) squad.entries -= 1
    for (const sweeper of summary.sweepers) {
      if (entry.sweeperIds.includes(sweeper.id)) sweeper.entries -= 1
    }
  }

  const reject = (errors: Record<string, string>) =>
    HttpResponse.json(
      { message: Object.values(errors)[0] ?? 'Invalid request', errors },
      { status: 400 },
    )

  function syncList(entry: MockRegistration, owner: MockBowler, created: boolean) {
    const row = registrations.registrations.find((candidate) => candidate.id === entry.id)
    const next = {
      id: entry.id,
      bowler: {
        id: owner.id,
        name: displayName(owner),
        firstName: owner.firstName,
        lastName: owner.lastName,
        usbcId: owner.usbcId,
      },
      divisionId: entry.divisionId,
      divisionName: divisionName(entry.divisionId),
      squadIds: [...entry.squadIds],
      sweeperIds: [...entry.sweeperIds],
      superSweeper: entry.superSweeper,
    }
    if (row) Object.assign(row, next)
    else registrations.registrations.push(next)
    if (created) registrations.summary.registrations += 1
    registrations.registrations.sort((a, b) =>
      (a.bowler.lastName + a.bowler.firstName).localeCompare(
        b.bowler.lastName + b.bowler.firstName,
      ),
    )
  }

  const blank = (value: string | undefined) => (value ?? '').trim() === ''

  /** The last problem among the squad ids wins, as the API reports one message per field. */
  function squadProblem(ids: string[]) {
    let problem: string | undefined
    for (const id of ids) {
      const squad = squads.find((candidate) => candidate.id === id)
      if (!squad) problem = 'Invalid squad IDs'
      else if (squad.complete) problem = 'Cannot add squad(s) that are already complete.'
    }
    return problem
  }

  function validate(
    body: DeskRegistrationRequest,
    known: MockBowler | undefined,
    division: Division | undefined,
    existing: MockRegistration | undefined,
  ) {
    const errors: Record<string, string> = {}
    const typed = { ...known, ...body.bowler } as BowlerValues
    if (blank(typed.firstName)) errors['bowler.firstName'] = 'First Name is Required'
    if (blank(typed.lastName)) errors['bowler.lastName'] = 'Last Name is Required'
    if (!division) errors['divisionId'] = 'The specified division does not exist.'
    if (division?.handicapPercentage != null && blank(typed.usbcId)) {
      errors['bowler.usbcId'] = 'USBC Id is required for Handicap Divisions'
    }
    if (body.squadIds.length + (existing?.squadIds.length ?? 0) === 0) {
      errors['squadIds'] = 'Bowler must enter at least one squad'
    }
    const problem = squadProblem(body.squadIds)
    if (problem) errors['squadIds'] = problem
    return errors
  }

  /** D-161: an exact USBC ID match for a new bowler. */
  function usbcOnFile(body: DeskRegistrationRequest) {
    const typedUsbc = (body.bowler.usbcId ?? '').trim()
    if (body.bowlerId || typedUsbc === '') return undefined
    const onFile = bowlers.find((candidate) => sameText(candidate.usbcId, typedUsbc))
    if (!onFile) return undefined
    return HttpResponse.json(
      {
        message: 'A bowler with this USBC ID is on file.',
        conflict: 'usbcIdOnFile',
        bowler: { id: onFile.id, name: displayName(onFile) },
      },
      { status: 409 },
    )
  }

  /** The racing bowler gets registered by "someone else" the first time the desk saves (D-159). */
  function raceConflict(
    known: MockBowler | undefined,
    existing: MockRegistration | undefined,
    division: Division | undefined,
  ) {
    if (!known || !racing.has(known.id) || existing) return undefined
    racing.delete(known.id)
    const first = squads.find((squad) => !squad.complete)
    if (!first || !division) return undefined
    const entry: MockRegistration = {
      id: faker.string.uuid(),
      bowlerId: known.id,
      divisionId: division.id,
      average: 180,
      superSweeper: false,
      squadIds: [first.id],
      sweeperIds: [],
      hasScores: false,
    }
    stored.push(entry)
    syncList(entry, known, true)
    return conflictOf(entry)
  }

  /** A stored bowler keeps what the desk left blank; a new bowler is added. */
  function saveBowler(known: MockBowler | undefined, fields: DeskRegistrationRequest['bowler']) {
    if (known) {
      for (const [key, value] of Object.entries(fields)) {
        if (typeof value === 'string' && value.trim() !== '') Object.assign(known, { [key]: value })
      }
      return known
    }
    const added = bowler({ firstName: '', lastName: '' })
    Object.assign(added, fields)
    bowlers.push(added)
    return added
  }

  function append(
    existing: MockRegistration,
    owner: MockBowler,
    body: DeskRegistrationRequest,
    division: Division,
  ) {
    if (existing.divisionId !== division.id && existing.hasScores) {
      return reject({
        divisionId: 'Cannot change bowler division after scores have been recorded.',
      })
    }
    if (body.squadIds.some((id) => existing.squadIds.includes(id))) {
      return reject({ squadIds: 'The specified squads are already registered.' })
    }
    existing.divisionId = division.id
    existing.average = body.average ?? existing.average
    existing.superSweeper = body.superSweeper
    existing.squadIds.push(...body.squadIds)
    existing.sweeperIds.push(...body.sweeperIds)
    syncList(existing, owner, false)
    return HttpResponse.json({ registrationId: existing.id, mode: 'appended' }, { status: 201 })
  }

  function commit(
    body: DeskRegistrationRequest,
    known: MockBowler | undefined,
    existing: MockRegistration | undefined,
    division: Division | undefined,
  ) {
    const owner = saveBowler(known, body.bowler)
    if (existing && body.appendToExisting !== true) return conflictOf(existing)
    if (existing && division) return append(existing, owner, body, division)
    const entry: MockRegistration = {
      id: faker.string.uuid(),
      bowlerId: owner.id,
      divisionId: body.divisionId,
      average: body.average,
      superSweeper: body.superSweeper,
      squadIds: [...body.squadIds],
      sweeperIds: [...body.sweeperIds],
      hasScores: false,
    }
    stored.push(entry)
    syncList(entry, owner, true)
    return HttpResponse.json({ registrationId: entry.id, mode: 'created' }, { status: 201 })
  }

  /** What an edit may not do, in the order the API reports it (D-197 to D-206). One message per field. */
  function editProblems(entry: MockRegistration, owner: MockBowler, body: EditRegistrationRequest) {
    const errors: Record<string, string> = {}
    const removedSquads = body.removeSquadIds ?? []
    const addedSquads = body.addSquadIds ?? []
    const problem = squadProblem(addedSquads)
    if (problem) errors['squadIds'] = problem
    if (removedSquads.length > 0 && entry.hasScores) {
      errors['squadIds'] = 'Bowler has already bowled in removed squads.'
    }
    const squadsAfter = [
      ...entry.squadIds.filter((id) => !removedSquads.includes(id)),
      ...addedSquads,
    ]
    if (squadsAfter.length === 0) errors['squadIds'] ??= 'Bowler must enter at least one squad'
    if (body.divisionId !== undefined && body.divisionId !== entry.divisionId && entry.hasScores) {
      errors['divisionId'] = 'Cannot change bowler division after scores have been recorded.'
    }
    const division = divisions.find(
      (candidate) => candidate.id === (body.divisionId ?? entry.divisionId),
    )
    const typed = { ...owner, ...body.bowler }
    if (blank(typed.firstName)) errors['bowler.firstName'] = 'First Name is Required'
    if (blank(typed.lastName)) errors['bowler.lastName'] = 'Last Name is Required'
    // REG-05 runs when the division or the USBC ID changes (D-205), not on every edit.
    const checksUsbc = body.divisionId !== undefined || body.bowler?.usbcId !== undefined
    if (checksUsbc && division?.handicapPercentage != null && blank(typed.usbcId)) {
      errors['bowler.usbcId'] = 'USBC Id is required for Handicap Divisions'
    }
    return errors
  }

  // For the e2e tests (D-199): the first save for this bowler finds that "the site" added the last
  // squad a moment earlier, so the desk meets a changed registration.
  let staleDone = false
  function editConflict(entry: MockRegistration, owner: MockBowler, body: EditRegistrationRequest) {
    const lastSquad = squads.at(-1)
    if (
      !staleDone &&
      owner.usbcId === '5560-11902' &&
      lastSquad &&
      !entry.squadIds.includes(lastSquad.id)
    ) {
      staleDone = true
      entry.squadIds.push(lastSquad.id)
      syncList(entry, owner, false)
      return changedResponse(entry)
    }
    const gone = [...(body.removeSquadIds ?? []), ...(body.removeSweeperIds ?? [])].some(
      (id) => ![...entry.squadIds, ...entry.sweeperIds].includes(id),
    )
    const held = [...(body.addSquadIds ?? []), ...(body.addSweeperIds ?? [])].some((id) =>
      [...entry.squadIds, ...entry.sweeperIds].includes(id),
    )
    return gone || held ? changedResponse(entry) : undefined
  }

  function changedResponse(entry: MockRegistration) {
    return HttpResponse.json(
      {
        message: 'This registration changed. Review and save again.',
        conflict: 'changed',
        existing: {
          registrationId: entry.id,
          divisionId: entry.divisionId,
          divisionName: divisionName(entry.divisionId),
          squadIds: entry.squadIds,
          sweeperIds: entry.sweeperIds,
        },
      },
      { status: 409 },
    )
  }

  function applyEdit(entry: MockRegistration, owner: MockBowler, body: EditRegistrationRequest) {
    const removed = [...(body.removeSquadIds ?? []), ...(body.removeSweeperIds ?? [])]
    const added = [...(body.addSquadIds ?? []), ...(body.addSweeperIds ?? [])]
    entry.squadIds = [
      ...entry.squadIds.filter((id) => !(body.removeSquadIds ?? []).includes(id)),
      ...(body.addSquadIds ?? []),
    ]
    entry.sweeperIds = [
      ...entry.sweeperIds.filter((id) => !(body.removeSweeperIds ?? []).includes(id)),
      ...(body.addSweeperIds ?? []),
    ]
    if (body.divisionId !== undefined) entry.divisionId = body.divisionId
    if (body.average !== undefined) entry.average = body.average
    if (body.superSweeper !== undefined) entry.superSweeper = body.superSweeper
    Object.assign(owner, body.bowler)
    syncList(entry, owner, false)
    return HttpResponse.json({
      registrationId: entry.id,
      added: added.length,
      removed: removed.length,
    })
  }

  return [
    http.get('/v1/bowlers', ({ request }) => {
      const query = new URL(request.url).searchParams
      const lastName = query.get('lastName')?.trim() ?? ''
      const firstName = query.get('firstName')?.trim() ?? ''
      const email = query.get('email')?.trim() ?? ''
      const usbcId = query.get('usbcId')?.trim() ?? ''
      if (lastName === '' && firstName === '' && email === '' && usbcId === '') {
        return HttpResponse.json({ message: 'Enter at least one search field.' }, { status: 400 })
      }
      if (lastName.toLowerCase() === 'boom' && !boomed) {
        boomed = true
        return new HttpResponse(null, { status: 500 })
      }
      if (lastName.toLowerCase() === 'many') {
        return HttpResponse.json({ bowlers: crowd.slice(0, 25), more: true })
      }
      const found = bowlers
        .filter(
          (candidate) =>
            (lastName === '' || startsWith(candidate.lastName, lastName)) &&
            (firstName === '' || startsWith(candidate.firstName, firstName)) &&
            (email === '' || sameText(candidate.email, email)) &&
            (usbcId === '' || sameText(candidate.usbcId, usbcId)),
        )
        .map(toSearchResult)
        .sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName))
      return HttpResponse.json({ bowlers: found.slice(0, 25), more: found.length > 25 })
    }),

    http.get('/v1/bowlers/:id', ({ params }) => {
      const found = bowlers.find((candidate) => candidate.id === params['id'])
      if (!found) return HttpResponse.json({ message: 'Bowler not found' }, { status: 404 })
      const registration = racing.has(found.id) ? undefined : registrationOf(found.id)
      return HttpResponse.json({
        bowler: found,
        registration: registration ? toRegistration(registration) : null,
      })
    }),

    http.get('/v1/tournaments/:id/registrations/:registrationId/edit-info', ({ params }) => {
      if (!tournamentExists(params['id'])) {
        return HttpResponse.json({ message: 'Tournament not found' }, { status: 404 })
      }
      const entry = stored.find((candidate) => candidate.id === params['registrationId'])
      const owner = bowlers.find((candidate) => candidate.id === entry?.bowlerId)
      if (!entry || !owner) {
        return HttpResponse.json({ message: 'Registration not found' }, { status: 404 })
      }
      return HttpResponse.json({
        bowler: owner,
        registration: {
          id: entry.id,
          divisionId: entry.divisionId,
          average: entry.average,
          superSweeper: entry.superSweeper,
          squadIds: entry.squadIds,
          sweeperIds: entry.sweeperIds,
        },
        locks: {
          scoredSessionIds: entry.hasScores ? entry.squadIds : [],
          hasScores: entry.hasScores,
          hasSweeperScores: false,
        },
      })
    }),

    // D-212: the fees and the real payments. A bowler in a complete session has a score, as the API
    // finds (SQD-15), and Tom Delgado paid outside this system (for the e2e tests).
    http.get('/v1/tournaments/:id/registrations/:registrationId/delete-info', ({ params }) => {
      if (!tournamentExists(params['id'])) {
        return HttpResponse.json({ message: 'Tournament not found' }, { status: 404 })
      }
      const entry = stored.find((candidate) => candidate.id === params['registrationId'])
      const owner = bowlers.find((candidate) => candidate.id === entry?.bowlerId)
      if (!entry || !owner) {
        return HttpResponse.json({ message: 'Registration not found' }, { status: 404 })
      }
      return HttpResponse.json({ deleteInfo: deleteFacts(entry, owner) })
    }),

    // D-209 to D-211: refuse scores, warn about a real payment until the total comes back, else delete.
    http.delete('/v1/tournaments/:id/registrations/:registrationId', ({ params, request }) => {
      if (!tournamentExists(params['id'])) {
        return HttpResponse.json({ message: 'Tournament not found' }, { status: 404 })
      }
      const entry = stored.find((candidate) => candidate.id === params['registrationId'])
      const owner = bowlers.find((candidate) => candidate.id === entry?.bowlerId)
      if (!entry || !owner) {
        return HttpResponse.json({ message: 'Registration not found' }, { status: 404 })
      }
      const facts = deleteFacts(entry, owner)
      if (facts.hasScores) {
        const message = 'Cannot delete registration with scores.'
        return HttpResponse.json({ message, errors: { scores: message } }, { status: 409 })
      }
      const query = new URL(request.url).searchParams
      const confirmed =
        query.get('confirmWarnings') === 'true' && Number(query.get('paid')) === facts.paidTotal
      if (facts.payments.length > 0 && !confirmed) {
        return HttpResponse.json(
          {
            message: 'Confirm to delete this registration.',
            warnings: [{ field: 'registration', message: 'Paid outside this system.' }],
            paid: facts.paidTotal,
          },
          { status: 409 },
        )
      }
      removeRegistration(entry)
      return new HttpResponse(null, { status: 204 })
    }),

    http.patch('/v1/tournaments/:id/registrations/:registrationId', async ({ params, request }) => {
      if (!tournamentExists(params['id'])) {
        return HttpResponse.json({ message: 'Tournament not found' }, { status: 404 })
      }
      const entry = stored.find((candidate) => candidate.id === params['registrationId'])
      const owner = bowlers.find((candidate) => candidate.id === entry?.bowlerId)
      if (!entry || !owner) {
        return HttpResponse.json({ message: 'Registration not found' }, { status: 404 })
      }
      const body = (await request.json()) as EditRegistrationRequest
      // For the e2e tests: a save that changes the last name to "Flaky" fails once.
      if (body.bowler?.lastName === 'Flaky' && !editFlaked) {
        editFlaked = true
        return new HttpResponse(null, { status: 500 })
      }
      const conflict = editConflict(entry, owner, body)
      if (conflict) return conflict
      const errors = editProblems(entry, owner, body)
      if (Object.keys(errors).length > 0) return reject(errors)
      if (body.average !== undefined && body.average !== entry.average && entry.hasScores) {
        if (body.confirmWarnings !== true) {
          return HttpResponse.json(
            {
              message: 'Confirm these changes to save them.',
              warnings: [
                {
                  field: 'average',
                  message: 'This bowler has scores. Handicap and results will change.',
                },
              ],
            },
            { status: 409 },
          )
        }
      }
      return applyEdit(entry, owner, body)
    }),

    http.post('/v1/tournaments/:id/registrations', async ({ params, request }) => {
      if (!tournamentExists(params['id'])) {
        return HttpResponse.json({ message: 'Tournament not found' }, { status: 404 })
      }
      const body = (await request.json()) as DeskRegistrationRequest
      if (body.bowler.lastName === 'Flaky' && !flaked) {
        flaked = true
        return new HttpResponse(null, { status: 500 })
      }
      const known = body.bowlerId
        ? bowlers.find((candidate) => candidate.id === body.bowlerId)
        : undefined
      if (body.bowlerId && !known) {
        return HttpResponse.json({ message: 'Bowler not found' }, { status: 404 })
      }
      const division = divisions.find((candidate) => candidate.id === body.divisionId)
      const existing = known ? registrationOf(known.id) : undefined
      const errors = validate(body, known, division, existing)
      if (Object.keys(errors).length > 0) return reject(errors)

      return (
        usbcOnFile(body) ??
        raceConflict(known, existing, division) ??
        commit(body, known, existing, division)
      )
    }),
  ]

  function conflictOf(entry: MockRegistration) {
    return HttpResponse.json(
      {
        message: 'Bowler is already registered for this tournament.',
        conflict: 'alreadyRegistered',
        existing: {
          registrationId: entry.id,
          divisionId: entry.divisionId,
          divisionName: divisionName(entry.divisionId),
          squadIds: entry.squadIds,
          sweeperIds: entry.sweeperIds,
        },
      },
      { status: 409 },
    )
  }
}
